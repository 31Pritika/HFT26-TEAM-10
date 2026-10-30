"""Raw observation → AIEvent → findings → risk → store → publish (spec 01 §A2)."""
from __future__ import annotations

import json
import logging
import shlex
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
from urllib.parse import urlsplit

from pydantic import ValidationError

from . import config, db
from .bus import bus
from .engine import agents, compliance, detect_adapter, risk
from .fingerprints import matcher
from .models import AIEvent, Finding, Observation
from .utils import fingerprint, new_id, normalize_ts, parse_ts, to_iso

log = logging.getLogger("shadowscope.pipeline")

SELF_HEADER = "x-shadowscope-self"
# These sources are scanned even when the destination is not a known AI provider.
UNMATCHED_SOURCES = {"extension", "log"}
DEFAULT_PROTOCOL = {443: "https"}


@dataclass
class Result:
    event: dict
    findings: list[dict] = field(default_factory=list)
    created: int = 0


def _is_self_traffic(headers: dict[str, str] | None) -> bool:
    return any(key.lower() == SELF_HEADER and value == "1" for key, value in (headers or {}).items())


def _resolve_provider(obs: Observation) -> dict | None:
    override = matcher.provider_by_id((obs.meta or {}).get("provider_id"))
    if override:
        return override
    found = matcher.match(host=obs.dest.host, ip=obs.dest.ip, port=obs.dest.port, path=obs.dest.path)
    return found.provider if found else None


def _process_info(obs: Observation) -> dict:
    process = obs.process.model_dump() if obs.process else {}
    return {"pid": process.get("pid"), "name": process.get("name") or "unknown", "exe": process.get("exe"),
            "user": process.get("user"), "parent": process.get("parent"), "cmdline_hint": process.get("cmdline_hint")}


def _classify(process: dict) -> dict:
    try:
        cmdline = shlex.split(process["cmdline_hint"] or "")
    except ValueError:
        cmdline = (process["cmdline_hint"] or "").split()
    return detect_adapter.classify_process(process["name"], cmdline)


def _parse_payload(text: str) -> dict | str:
    """A JSON object as a dict, anything else as text: the detector contract takes only these two."""
    if text.lstrip()[:1] == "{":
        try:
            return json.loads(text)
        except ValueError:
            pass
    return text


def _model_name(body: str | None) -> str | None:
    payload = _parse_payload(body) if body else None
    model = payload.get("model") if isinstance(payload, dict) else None
    return model[:120] if isinstance(model, str) else None


def _analyze_agent(obs: Observation) -> dict:
    merged = {"is_agent": False, "framework": "unknown", "tools_declared": [], "actions": [], "findings": [], "permissions": {}}
    for text, direction in ((obs.body_text, "request"), (obs.response_text, "response")):
        if not text:
            continue
        analysis = detect_adapter.analyze_agent_payload(_parse_payload(text), direction=direction)
        merged["is_agent"] = merged["is_agent"] or analysis["is_agent"]
        if analysis["framework"] != "unknown":
            merged["framework"] = analysis["framework"]
        for key in ("tools_declared", "actions", "findings"):
            merged[key] += analysis[key]
        for permission, granted in analysis.get("permissions", {}).items():
            merged["permissions"][permission] = merged["permissions"].get(permission, False) or granted
    return merged


def _behaviour_finding(finding_type: str, subtype: str, severity: str, title: str, detail: str, key: str, detector: str) -> dict:
    return {
        "type": finding_type, "subtype": subtype, "severity": severity, "confidence": 0.95, "title": title, "description": detail,
        "evidence": {"redacted_snippet": detail, "match_redacted": detail, "entropy": None, "line": None, "offset": None,
                     "fingerprint": fingerprint(key)},
        "detector": detector, "compliance": [], "remediation": [],
    }


def _policy_findings(provider: dict, process_name: str, sanctioned: bool, policy: dict) -> list[dict]:
    found = []
    name = provider["name"]
    if provider["id"] in policy["blocked_providers"]:
        found.append(_behaviour_finding(
            "policy", "blocked_provider_contacted", "critical", f"Blocked provider contacted: {name}",
            f"{process_name} contacted {name}, which policy blocks.", f"blocked:{process_name}:{provider['id']}", "heuristic"))
    item = db.get_inventory(process_name)
    if not sanctioned and (item is None or provider["id"] not in item["provider_ids"]):
        severity = "high" if provider["category"] in ("cloud_llm", "ai_saas", "ai_coding") else "medium"
        found.append(_behaviour_finding(
            "shadow_ai", "new_unsanctioned_tool", severity, f"New unsanctioned AI tool: {process_name}",
            f"{process_name} contacted {name} for the first time.", f"shadow:{process_name}:{provider['id']}", "process"))
    return found


def _one_loop_per_session(detected: list[dict], process_name: str, framework: str | None) -> list[dict]:
    """The detector and agents.py can both report a loop. A shared fingerprint makes them one finding."""
    key = agents.loop_fingerprint(process_name, framework or "unknown")
    return [{**raw, "evidence": {**raw["evidence"], "fingerprint": key}} if raw.get("subtype") == "autonomous_loop" else raw for raw in detected]


def _store_finding(raw: dict, event_id: str, ts: str, provider_id: str | None, process_name: str) -> tuple[dict | None, bool]:
    """Stores a detector finding, or counts another occurrence of a recent identical one."""
    evidence = raw.get("evidence") or {}
    key = evidence.get("fingerprint") or fingerprint(f"{raw.get('subtype')}:{evidence.get('match_redacted')}")
    since = to_iso(parse_ts(ts) - timedelta(seconds=config.DEDUPE_WINDOW_S))
    existing = db.find_recent_finding(key, raw.get("subtype", ""), since)
    if existing:
        db.bump_finding_occurrences(existing["id"])
        return existing, False
    try:
        finding = Finding.model_validate({
            **raw, "id": new_id("fnd"), "ts": ts, "event_id": event_id, "evidence": {**evidence, "fingerprint": key},
            "provider_id": provider_id, "process_name": process_name, "status": "open", "triage": None,
            "compliance": raw.get("compliance") or compliance.tags_for(raw["type"], raw["subtype"]),
            "remediation": raw.get("remediation") or compliance.remediation_for(raw["type"], raw["subtype"]),
        }).model_dump()
    except (ValidationError, KeyError) as error:
        log.warning("skipping malformed finding: %s", error)
        return None, False
    db.insert_finding(finding)
    return finding, True


def _update_inventory(process: dict, provider: dict, event: dict, created: int, is_agent: bool, policy: dict) -> None:
    item = db.get_inventory(process["name"]) or {
        "id": new_id("inv"), "process_name": process["name"], "exe": process["exe"], "category": provider["category"],
        "provider_ids": [], "first_seen": event["ts"], "last_seen": event["ts"], "request_count": 0, "bytes_out": 0,
        "sanctioned": False, "risk_score": 0, "findings_count": 0, "is_agent": False,
    }
    if provider["id"] not in item["provider_ids"]:
        item["provider_ids"].append(provider["id"])
    item.update(
        exe=item["exe"] or process["exe"], first_seen=min(item["first_seen"], event["ts"]), last_seen=max(item["last_seen"], event["ts"]),
        request_count=item["request_count"] + 1, bytes_out=item["bytes_out"] + event["bytes_out"],
        risk_score=max(item["risk_score"], event["risk_score"]), findings_count=item["findings_count"] + created,
        is_agent=item["is_agent"] or is_agent,
    )
    item["sanctioned"] = is_sanctioned_item(item, policy)
    db.upsert_inventory(item)


def is_sanctioned_item(item: dict, policy: dict) -> bool:
    if item["process_name"] in policy["sanctioned_processes"]:
        return True
    return bool(item["provider_ids"]) and set(item["provider_ids"]) <= set(policy["sanctioned_providers"])


def refresh_inventory(policy: dict) -> None:
    """Re-applies the policy to known tools after it changes."""
    with db.transaction():
        for item in db.list_inventory():
            item["sanctioned"] = is_sanctioned_item(item, policy)
            db.upsert_inventory(item)


def process(observation: Observation | dict, *, prescan: dict | None = None, force: bool = False, publish: bool = True) -> Result | None:
    """Runs one observation through the pipeline. Returns None when it is dropped.

    `prescan` supplies detection results instead of running the detector. `force` keeps the event even when
    nothing marks it as AI traffic.
    """
    obs = observation if isinstance(observation, Observation) else Observation.model_validate(observation)
    if _is_self_traffic(obs.headers):
        return None

    provider = _resolve_provider(obs)
    if provider is None and not force and obs.source not in UNMATCHED_SOURCES:
        return None

    policy = db.get_policy()
    prescan = prescan or {}
    scan = prescan.get("scan")
    if scan is None and obs.body_text:
        scan = detect_adapter.scan_text(obs.body_text, context={"source": obs.source}, policy=policy)
    analysis = prescan.get("analysis") or _analyze_agent(obs)
    detected = [*(scan["findings"] if scan else []), *analysis["findings"]]
    if provider is None and not force and not detected:
        return None

    ts = normalize_ts(obs.ts)
    process_info = _process_info(obs)
    classification = _classify(process_info)
    framework = classification.get("framework")
    if analysis["is_agent"]:
        framework = analysis["framework"] if analysis["framework"] != "unknown" else framework or "unknown"

    provider_id = provider["id"] if provider else None
    category = provider["category"] if provider else None
    name = process_info["name"]
    sanctioned = provider_id in policy["sanctioned_providers"] or name in policy["sanctioned_processes"]
    body_bytes = len(obs.body_text.encode("utf-8", "replace")) if obs.body_text else 0
    response_bytes = len(obs.response_text.encode("utf-8", "replace")) if obs.response_text else 0
    event_id = new_id("evt")
    session = None

    with db.transaction():
        if framework:
            session, behaviour = agents.update(process_info, framework, provider_id, ts, analysis)
            detected += behaviour
        if provider:
            detected += _policy_findings(provider, name, sanctioned, policy)
        detected = _one_loop_per_session(detected, name, framework)

        findings, created = [], 0
        for raw in detected:
            finding, is_new = _store_finding(raw, event_id, ts, provider_id, name)
            if finding and finding["id"] not in {existing["id"] for existing in findings}:
                findings.append(finding)
                created += is_new

        has_agent_action = bool(analysis["actions"]) or any(f["type"] == "agent_action" for f in findings)
        tags = [*((obs.meta or {}).get("tags") or [])]
        tags += ["shadow-ai"] if provider and not sanctioned else []
        tags += ["agent"] if framework else []
        tags += ["tool-call"] if analysis["actions"] else []
        tags += ["burst"] if any(f["subtype"] == "autonomous_loop" for f in findings) else []
        if (obs.meta or {}).get("run_id"):
            tags.append(f"run:{obs.meta['run_id']}")

        event = AIEvent.model_validate({
            "id": event_id, "ts": ts, "source": obs.source, "process": process_info,
            "provider": {key: provider[key] for key in ("id", "name", "category")} if provider else None,
            "dest": {"host": matcher.normalize_host(obs.dest.host) or obs.dest.host, "ip": obs.dest.ip, "port": obs.dest.port,
                     "path": obs.dest.path, "protocol": obs.dest.protocol or DEFAULT_PROTOCOL.get(obs.dest.port, "http")},
            "method": obs.method, "model": _model_name(obs.body_text),
            "bytes_out": obs.bytes_out if obs.bytes_out is not None else body_bytes,
            "bytes_in": obs.bytes_in if obs.bytes_in is not None else response_bytes,
            "payload_visible": bool(obs.body_text),
            "payload_preview": scan["redacted_text"][:config.PAYLOAD_PREVIEW_CHARS] if scan else None,
            "sanctioned": sanctioned,
            "risk_score": risk.event_score(category, sanctioned, [f["severity"] for f in findings], has_agent_action),
            "finding_ids": [f["id"] for f in findings], "tags": tags,
        }).model_dump()
        db.insert_event(event)
        if provider:
            _update_inventory(process_info, provider, event, created, bool(framework), policy)
        db.bump_metrics(ts, requests=1 if provider else 0, findings=created, bytes_out=event["bytes_out"])

    if publish:
        bus.publish({"type": "event", "data": event})
        for finding in findings:
            bus.publish({"type": "finding", "data": finding})
        if session:
            bus.publish({"type": "agent", "data": agents.present(session)})
    return Result(event, findings, created)


def scan_text(text: str, source: str = "api", context: dict[str, Any] | None = None) -> dict:
    """POST /scan. Text with findings becomes an event through the normal pipeline."""
    context = context or {}
    policy = db.get_policy()
    scan = detect_adapter.scan_text(text, context=context, policy=policy)
    findings: list[dict] = []
    if scan["findings"]:
        url = context.get("url") or ""
        parts = urlsplit(url if "//" in url else f"//{url}")
        result = process(
            {"source": "extension" if source == "extension" else "log",
             "process": {"name": "ShadowScope Playground" if source == "playground" else "ShadowScope API"},
             "dest": {"host": parts.hostname or "local-scan", "port": parts.port or 0, "path": parts.path or None, "protocol": "tcp"},
             "body_text": text, "meta": {"provider_id": context.get("provider"), "tags": ["scan"]}},
            prescan={"scan": scan}, force=True,
        )
        findings = result.findings if result else []
    return {"findings": findings, "risk_score": scan["risk_score"], "redacted_text": scan["redacted_text"], "stats": scan["stats"]}


def record_extension_event(site: str, url: str, text: str, ts: str, browser: str, kind: str) -> Result:
    """POST /extension/event. Always stored: a paste into an AI site is worth recording even when clean."""
    names = {"chrome": "Google Chrome", "edge": "Microsoft Edge"}
    parts = urlsplit(url if "//" in url else f"//{url}")
    result = process(
        {"source": "extension", "ts": ts, "process": {"name": names.get(browser, "Browser")},
         "dest": {"host": parts.hostname or site, "port": parts.port or 443, "path": parts.path or None, "protocol": "https"},
         "method": kind.upper(), "body_text": text, "meta": {"tags": [f"extension:{kind}"]}},
        force=True,
    )
    assert result is not None  # Only self-traffic is dropped when forced, and this has no headers.
    return result
