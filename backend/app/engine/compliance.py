"""Framework scores, findings → framework mapping, remediation defaults and the report (master §9)."""
from __future__ import annotations

from collections import Counter
from collections.abc import Callable

from .. import db
from ..fingerprints import matcher
from ..utils import clamp, now, to_iso, window_start
from . import agents, detect_adapter, risk, stats

FRAMEWORK_IDS = ("DPDP", "GDPR", "SOC2", "PCI-DSS", "ISO27001")
ORG_NAME = "Local workstation"
TOP_FINDINGS = 10
SCORE_FACTOR = {"DPDP": 0.08, "GDPR": 0.08, "SOC2": 0.015, "PCI-DSS": 0.30, "ISO27001": 0.01}

_RULES: dict[str, Callable[[dict], bool]] = {
    "DPDP": lambda f: f["type"] == "pii",
    "GDPR": lambda f: f["type"] == "pii",
    "PCI-DSS": lambda f: f["subtype"] == "credit_card",
    "SOC2": lambda f: f["type"] in ("secret", "shadow_ai", "agent_action"),
    "ISO27001": lambda f: True,
}

REMEDIATION: dict[str, list[str]] = {
    "aws_access_key": ["Deactivate key in IAM now", "Rotate & move to AWS Secrets Manager", "Add pre-commit secret scanning"],
    "aadhaar": ["Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system"],
    "pan": ["Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system"],
    "secret": ["Revoke and rotate the credential", "Move it to a secrets manager", "Add pre-commit secret scanning"],
    "pii": ["Purge from AI provider history", "Review the data-sharing policy with the user"],
    "source_code": ["Review what was shared with the provider", "Move the team to a sanctioned AI tool"],
    "canary": ["Treat as an active leak", "Trace the process and user that sent the token"],
    "agent_action": ["Run agent in sandbox/container", "Require human approval for shell tools", "Restrict tool allowlist"],
    "shadow_ai": ["Decide whether to sanction or block this tool", "Point the owner to an approved alternative"],
    "policy": ["Block the provider at the network edge", "Follow up with the process owner"],
    "exfil_volume": ["Inspect the destination and payload", "Pause the process until it is reviewed"],
}



def _is_pii(finding: dict) -> bool:
    return finding["type"] == "pii"


def _is_secret(finding: dict) -> bool:
    return finding["type"] == "secret"


def _is_sensitive_pii(finding: dict) -> bool:
    return finding["subtype"] in ("aadhaar", "pan", "bulk_pii", "credit_card", "passport_in", "us_ssn")


def _is_serious_pii(finding: dict) -> bool:
    return _is_pii(finding) and finding["severity"] in ("critical", "high")


def _left_for_cloud(finding: dict) -> bool:
    provider = matcher.provider_by_id(finding["provider_id"])
    return provider is not None and provider["category"] != "local_llm"


def _pii_in_cloud(finding: dict) -> bool:
    return _is_pii(finding) and _left_for_cloud(finding)


def _is_card(finding: dict) -> bool:
    return finding["subtype"] == "credit_card"


def _is_shadow(finding: dict) -> bool:
    return finding["type"] in ("shadow_ai", "policy")


def _is_agent(finding: dict) -> bool:
    return finding["type"] == "agent_action"


def _is_exfil(finding: dict) -> bool:
    return finding["type"] in ("exfil_volume", "canary")


def _is_code(finding: dict) -> bool:
    return finding["type"] == "source_code"


def _is_dangerous_agent(finding: dict) -> bool:
    return _is_agent(finding) and finding["severity"] in ("critical", "high")


_FRAMEWORKS: list[dict] = [
    {"id": "DPDP", "name": "India DPDP Act 2023", "controls": [
        ("DPDP-S4", "Personal data handled for a lawful purpose", _is_pii),
        ("DPDP-S8.4", "Technical and organisational measures", _is_serious_pii),
        ("DPDP-S8.5", "Reasonable security safeguards", lambda f: _is_pii(f) or _is_secret(f)),
        ("DPDP-S8.6", "Breach notification readiness", _is_sensitive_pii),
        ("DPDP-S8.7", "Erasure from third-party systems", _pii_in_cloud),
        ("DPDP-S16", "Transfer of personal data outside India", _pii_in_cloud),
    ]},
    {"id": "GDPR", "name": "GDPR", "controls": [
        ("GDPR-5", "Data minimisation", _is_pii),
        ("GDPR-6", "Lawful basis for processing", _pii_in_cloud),
        ("GDPR-25", "Data protection by design", _is_serious_pii),
        ("GDPR-32", "Security of processing", lambda f: _is_pii(f) or _is_secret(f)),
        ("GDPR-33", "Breach notification readiness", _is_sensitive_pii),
        ("GDPR-44", "International transfers", _pii_in_cloud),
    ]},
    {"id": "SOC2", "name": "SOC 2", "controls": [
        ("CC6.1", "Logical access controls", _is_secret),
        ("CC6.6", "Protection at system boundaries", lambda f: _is_shadow(f) or _is_exfil(f)),
        ("CC6.7", "Restricted transmission of information", lambda f: _is_secret(f) or _is_pii(f)),
        ("CC6.8", "Prevention of unauthorised software", _is_shadow),
        ("CC7.2", "Monitoring of anomalous activity", lambda f: _is_agent(f) or _is_exfil(f)),
        ("CC7.3", "Evaluation of security events", _is_dangerous_agent),
    ]},
    {"id": "PCI-DSS", "name": "PCI-DSS", "controls": [
        ("PCI-3", "Protect stored account data", _is_card),
        ("PCI-4", "Protect cardholder data in transit", lambda f: _is_card(f) and _left_for_cloud(f)),
        ("PCI-7", "Restrict access to cardholder data", lambda f: _is_card(f) or _is_dangerous_agent(f)),
        ("PCI-10", "Log and monitor access", lambda f: _is_card(f) or _is_exfil(f)),
        ("PCI-12", "Information security policy", lambda f: _is_card(f) or _is_shadow(f)),
    ]},
    {"id": "ISO27001", "name": "ISO 27001", "controls": [
        ("A.5.14", "Information transfer", lambda f: _is_secret(f) or _is_pii(f) or _is_code(f)),
        ("A.5.23", "Use of cloud services", _is_shadow),
        ("A.8.11", "Data masking", _is_pii),
        ("A.8.12", "Data leakage prevention", lambda f: _is_exfil(f) or _is_code(f)),
        ("A.8.16", "Monitoring activities", _RULES["ISO27001"]),
        ("A.8.19", "Software installation on operational systems", _is_dangerous_agent),
    ]},
]


def tags_for(finding_type: str, subtype: str) -> list[str]:
    finding = {"type": finding_type, "subtype": subtype}
    return [framework for framework in FRAMEWORK_IDS if _RULES[framework](finding)]


def remediation_for(finding_type: str, subtype: str) -> list[str]:
    return detect_adapter.remediation_steps(subtype) or list(REMEDIATION.get(subtype) or REMEDIATION.get(finding_type) or [])


def scores(open_findings: list[dict]) -> dict[str, int]:
    """Higher is better: 100 minus the weighted sum of open findings mapped to the framework."""
    result = {}
    for framework in FRAMEWORK_IDS:
        total = sum(risk.SEVERITY_WEIGHT[f["severity"]] for f in open_findings if _RULES[framework](f))
        result[framework] = clamp(100 - SCORE_FACTOR[framework] * total)
    return result


def _names(findings: list[dict], limit: int = 3) -> str:
    """The tools involved, most frequent first."""
    counts = Counter(f["process_name"] or "unknown" for f in findings)
    names = [name for name, _ in counts.most_common(limit)]
    extra = len(counts) - len(names)
    return ", ".join(names) + (f" and {extra} more" if extra > 0 else "")


def _control(control_id: str, name: str, rule: Callable[[dict], bool], open_findings: list[dict]) -> dict:
    matched = [f for f in open_findings if rule(f)]
    serious = sum(f["severity"] in ("critical", "high") for f in matched)
    status = "fail" if serious else "warn" if matched else "pass"
    if not matched:
        return {"id": control_id, "name": name, "status": status, "evidence": "No open findings in scope"}
    evidence = f"{len(matched)} open findings, {serious} critical or high. Tools: {_names(matched)}"
    return {"id": control_id, "name": name, "status": status, "evidence": evidence}


def _recommendation(priority: str, title: str, detail: str) -> dict:
    return {"priority": priority, "title": title, "detail": detail}


def _recommendations(open_findings: list[dict], sessions: list[dict], inventory: list[dict]) -> list[dict]:
    """Every entry comes from something open right now, and names what it affects."""
    def matching(rule: Callable[[dict], bool]) -> list[dict]:
        return [f for f in open_findings if rule(f)]

    items = []
    secrets = matching(lambda f: _is_secret(f) and f["severity"] == "critical")
    if secrets:
        items.append(_recommendation("P0", "Rotate exposed credentials", f"{len(secrets)} critical secrets reached AI tools through {_names(secrets)}. Revoke them, starting with cloud and database keys."))
    canaries = matching(lambda f: f["type"] == "canary")
    if canaries:
        items.append(_recommendation("P0", "Investigate tripped honeytokens", f"{len(canaries)} canary tokens appeared in traffic from {_names(canaries)}. Treat this as an active leak."))
    cards = matching(_is_card)
    if cards:
        items.append(_recommendation("P0", "Contain card data exposure", f"{len(cards)} card numbers reached {_names(cards)}. Follow your PCI-DSS incident process."))
    risky = [session for session in sessions if session["risk_score"] >= 70 and session["status"] != "blocked"]
    if risky:
        names = ", ".join(sorted({session["process_name"] for session in risky}))
        items.append(_recommendation("P0", "Sandbox high-risk agents", f"Require human approval for shell and file tools in: {names}."))
    blocked = matching(lambda f: f["type"] == "policy")
    if blocked:
        items.append(_recommendation("P0", "Stop traffic to blocked providers", f"{len(blocked)} contacts with blocked providers from {_names(blocked)}. Block them at the network edge."))
    personal = matching(_is_pii)
    if personal:
        items.append(_recommendation("P1", "Review personal data exposure", f"{len(personal)} open PII findings from {_names(personal)}. Check whether DPDP or GDPR notification duties apply."))
    exfil = matching(lambda f: f["type"] == "exfil_volume")
    if exfil:
        items.append(_recommendation("P1", "Review unusual upload volume", f"{len(exfil)} volume spikes from {_names(exfil)}. Inspect the destination and pause the process until reviewed."))
    code = matching(_is_code)
    if code:
        items.append(_recommendation("P1", "Move code review to a sanctioned tool", f"{len(code)} source code findings from {_names(code)}."))
    leaks = matching(lambda f: _is_secret(f) or _is_pii(f))
    if leaks:
        items.append(_recommendation("P1", "Route AI traffic through the Local Gateway", f"Point {_names(leaks)} at the gateway so critical leaks are blocked before they leave."))
    shadow = [item["process_name"] for item in inventory if not item["sanctioned"]]
    if shadow:
        named = ", ".join(shadow[:3]) + (f" and {len(shadow) - 3} more" if len(shadow) > 3 else "")
        items.append(_recommendation("P2", "Publish a sanctioned AI tool list", f"{len(shadow)} unsanctioned tools are in use, including {named}."))
    return items or [_recommendation("P2", "Keep monitoring", "No open risks need action right now.")]


def build_report(window: str) -> dict:
    moment = now()
    since = to_iso(window_start(window, moment))
    all_open = db.open_findings()
    open_findings = [f for f in all_open if f["ts"] >= since]
    org = risk.org_score(all_open, moment)
    framework_scores = scores(open_findings)
    sessions = agents.list_sessions()
    inventory = db.list_inventory()
    period_totals = stats.totals(since)
    ranked = sorted(open_findings, key=lambda f: (risk.SEVERITY_WEIGHT[f["severity"]], f["ts"]), reverse=True)
    return {
        "generated_at": to_iso(moment), "org": ORG_NAME, "window": {"from": since, "to": to_iso(moment)},
        "overall": {"score": org["score"], "grade": org["grade"],
                    "summary": f"{period_totals['shadow_tools']} unsanctioned AI tools and {len(open_findings)} open findings."},
        "frameworks": [
            {"id": framework["id"], "name": framework["name"], "score": framework_scores[framework["id"]],
             "controls": [_control(*control, open_findings) for control in framework["controls"]]}
            for framework in _FRAMEWORKS
        ],
        "top_findings": ranked[:TOP_FINDINGS], "inventory": inventory, "agents": sessions,
        "recommendations": _recommendations(open_findings, sessions, inventory), "stats": period_totals,
    }
