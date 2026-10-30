"""AgentSession aggregation and autonomy score (master §8.4)."""
from __future__ import annotations

import re

from .. import config, db
from ..utils import clamp, fingerprint, new_id, now, parse_ts
from . import risk

DANGEROUS_TOOL = re.compile(r"shell|bash|terminal|exec|run_command|execute|python_repl|code_interpreter|subprocess|powershell|cmd|read_file|file_read|write_file|fs_|delete", re.I)
LOOP_MIN_REQUESTS = 6
LOOP_MAX_MEAN_GAP_S = 2.0
LOOP_MIN_ROUND_TRIPS = 3
RECENT_REQUESTS = 30
ROUND_TRIP_MAX_GAP_S = 60  # Tool calls further apart than this are separate tasks, not one loop.

_PERMISSION_TOOLS = {
    "shell": re.compile(r"shell|bash|terminal|run_command|powershell|cmd|subprocess", re.I),
    "filesystem_read": re.compile(r"read_file|file_read|fs_read|list_dir", re.I),
    "filesystem_write": re.compile(r"write_file|file_write|fs_write|delete", re.I),
    "network": re.compile(r"http|fetch|curl|request|browser|web", re.I),
    "internal_api": re.compile(r"internal|admin", re.I),
    "code_exec": re.compile(r"python_repl|code_interpreter|exec", re.I),
}
_PERMISSION_KINDS = {"shell_exec": "shell", "file_read": "filesystem_read", "file_write": "filesystem_write",
                     "http_request": "network", "code_exec": "code_exec"}


def autonomy_score(rate_factor: float, tool_loop_factor: float, dangerous_ratio: float) -> int:
    return clamp(35 * min(rate_factor, 1) + 35 * min(tool_loop_factor, 1) + 30 * min(dangerous_ratio, 1))


def _new_session(process: dict, framework: str, ts: str) -> dict:
    return {
        "id": new_id("agt"), "process_name": process["name"], "pid": process.get("pid"), "framework": framework,
        "provider_id": None, "started": ts, "last_seen": ts, "requests": 0, "tools_used": [], "actions": [],
        "permissions": dict.fromkeys(_PERMISSION_TOOLS, False), "autonomy_score": 0, "risk_score": 0, "status": "active",
        "_stats": {"recent": [], "tool_calls": 0, "dangerous": 0, "rounds": 0, "max_rounds": 0, "peak_rate": 0.0, "max_weight": 0},
    }


def _record_action(session: dict, raw: dict, ts: str) -> dict:
    action = {
        "ts": raw.get("ts") or ts, "kind": raw.get("kind") or "tool_call", "detail": str(raw.get("detail", ""))[:500],
        "severity": raw.get("severity") or "medium", "verified": bool(raw.get("verified", False)), "tool_name": raw.get("tool_name"),
    }
    name = action["tool_name"] or action["kind"]
    usage = next((tool for tool in session["tools_used"] if tool["name"] == name), None)
    if usage is None:
        usage = {"name": name, "count": 0, "severity": action["severity"]}
        session["tools_used"].append(usage)
    usage["count"] += 1
    if risk.SEVERITY_WEIGHT[action["severity"]] > risk.SEVERITY_WEIGHT[usage["severity"]]:
        usage["severity"] = action["severity"]

    counters = session["_stats"]
    counters["tool_calls"] += 1
    counters["dangerous"] += bool(DANGEROUS_TOOL.search(name)) and not action["verified"]
    counters["max_weight"] = max(counters["max_weight"], risk.SEVERITY_WEIGHT[action["severity"]])
    if action["kind"] in _PERMISSION_KINDS:
        session["permissions"][_PERMISSION_KINDS[action["kind"]]] = True
    return action


def _rate(recent: list[str], ts: str) -> tuple[int, float]:
    """Requests in the minute up to `ts`, and the mean gap between them in seconds."""
    moment = parse_ts(ts)
    window = sorted(parse_ts(value) for value in recent if 0 <= (moment - parse_ts(value)).total_seconds() <= 60)
    if len(window) < 2:
        return len(window), float("inf")
    gaps = [(later - earlier).total_seconds() for earlier, later in zip(window, window[1:])]
    return len(window), sum(gaps) / len(gaps)


def loop_fingerprint(process_name: str, framework: str) -> str:
    return fingerprint(f"loop:{process_name}:{framework}")


def _loop_finding(session: dict, requests: int, mean_gap: float, rounds: int) -> dict:
    detail = f"{requests} requests/min, mean gap {mean_gap:.1f} s, {rounds} tool round trips"
    return {
        "type": "agent_action", "subtype": "autonomous_loop", "severity": "medium", "confidence": 0.85,
        "title": "Autonomous agent loop detected", "description": f"{session['process_name']} is acting at machine speed.",
        "evidence": {"redacted_snippet": detail, "match_redacted": detail, "entropy": None, "line": None, "offset": None,
                     "fingerprint": loop_fingerprint(session["process_name"], session["framework"])},
        "detector": "anomaly", "compliance": [], "remediation": [],
    }


def update(process: dict, framework: str, provider_id: str | None, ts: str, analysis: dict) -> tuple[dict, list[dict]]:
    """Adds one request to the session. Returns the session and any behaviour findings it triggered."""
    session = db.find_agent(process["name"], framework) or _new_session(process, framework, ts)
    counters = session["_stats"]
    session["requests"] += 1
    session["last_seen"] = max(session["last_seen"], ts)
    session["pid"] = process.get("pid") or session["pid"]
    session["provider_id"] = provider_id or session["provider_id"]

    for tool in analysis.get("tools_declared") or []:
        for permission, pattern in _PERMISSION_TOOLS.items():
            session["permissions"][permission] |= bool(pattern.search(str(tool)))
    for permission, granted in (analysis.get("permissions") or {}).items():
        if permission in session["permissions"]:
            session["permissions"][permission] |= bool(granted)
    actions = [_record_action(session, raw, ts) for raw in analysis.get("actions") or []]

    previous = counters["recent"][-1] if counters["recent"] else None
    connected = previous is not None and (parse_ts(ts) - parse_ts(previous)).total_seconds() <= ROUND_TRIP_MAX_GAP_S
    counters["recent"] = [*counters["recent"], ts][-RECENT_REQUESTS:]
    counters["rounds"] = (counters["rounds"] + 1 if connected else 1) if actions else 0
    counters["max_rounds"] = max(counters["max_rounds"], counters["rounds"])
    requests, mean_gap = _rate(counters["recent"], ts)
    counters["peak_rate"] = max(counters["peak_rate"], requests)

    session["autonomy_score"] = autonomy_score(
        counters["peak_rate"] / LOOP_MIN_REQUESTS, counters["max_rounds"] / LOOP_MIN_ROUND_TRIPS,
        counters["dangerous"] / counters["tool_calls"] if counters["tool_calls"] else 0,
    )
    session["risk_score"] = clamp(0.5 * session["autonomy_score"] + 0.8 * counters["max_weight"])

    db.upsert_agent(session)
    for action in actions:
        db.insert_agent_action(session["id"], action)

    looping = (requests >= LOOP_MIN_REQUESTS and mean_gap < LOOP_MAX_MEAN_GAP_S) or counters["rounds"] >= LOOP_MIN_ROUND_TRIPS
    return session, [_loop_finding(session, requests, mean_gap, counters["rounds"])] if looping else []


def present(session: dict) -> dict:
    """The stored session in contract shape. Active vs idle depends on the current time."""
    public = {key: value for key, value in session.items() if not key.startswith("_")}
    public["actions"] = db.agent_actions(session["id"])
    if session["status"] != "blocked":
        idle_for = (now() - parse_ts(session["last_seen"])).total_seconds()
        public["status"] = "active" if idle_for <= config.AGENT_ACTIVE_WINDOW_S else "idle"
    return public


def list_sessions() -> list[dict]:
    return [present(session) for session in db.list_agents()]


def get_session(agent_id: str) -> dict | None:
    session = db.get_agent(agent_id)
    return present(session) if session else None
