"""`analyze_agent_payload` (spec B3): turns any supported payload into tools, tool calls, actions and findings.

Five formats normalise to `_Parsed` (OpenAI, Anthropic and Ollama JSON, LangChain ReAct text, AutoGPT JSON), then one
classifier handles them all.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable

from .patterns import Rule, agent as rules
from .scanner import fingerprint, make_finding, scan_text
from .types import AgentAction, AgentAnalysis, DetFinding, Severity

_DETAIL_CHARS = 500
_MATCH_CHARS = 120
_MAX_CALLS = 200
_MAX_JSON_STARTS = 20
_CLASSIFY_CHARS = 8192   # commands are short; anything past this is data, and `.*` rules should not walk it
_JSON_KEYS = ("tools", "functions", "messages", "choices", "content", "message", "command", "response", "prompt",
              "system")
_TEXT_MARKERS = ("Action Input:", '"command"', "one of [")
_COMMAND_KEYS = ("command", "cmd", "script", "code", "input", "query")
_PATH_KEYS = ("path", "file", "filename", "file_path", "filepath", "url")
_SEVERITY_ORDER: tuple[Severity, ...] = ("info", "low", "medium", "high", "critical")


@dataclass(slots=True)
class _Call:
    name: str
    arguments: Any


@dataclass(slots=True)
class _Parsed:
    tools: list[str] = field(default_factory=list)
    calls: list[_Call] = field(default_factory=list)
    results: list[str] = field(default_factory=list)  # tool output fed back to the model
    texts: list[str] = field(default_factory=list)    # free text that may hold ReAct or AutoGPT steps
    round_trips: int = 0


def _empty() -> AgentAnalysis:
    return {"is_agent": False, "framework": "unknown", "tools_declared": [], "actions": [], "findings": [],
            "permissions": dict.fromkeys(rules.PERMISSION_TOOLS, False)}


def _list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


# --- Parsers ------------------------------------------------------------------------------------------------------

def _parse_arguments(raw: Any) -> Any:
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, RecursionError):
            return raw
    return raw


def _declared_tools(payload: dict, parsed: _Parsed) -> None:
    for tool in (*_list(payload.get("tools")), *_list(payload.get("functions"))):
        tool = _dict(tool)
        name = _dict(tool.get("function")).get("name") or tool.get("name")
        if isinstance(name, str):
            parsed.tools.append(name)


def _add_openai_call(entry: Any, parsed: _Parsed) -> None:
    function = _dict(_dict(entry).get("function")) or _dict(entry)
    if isinstance(function.get("name"), str):
        parsed.calls.append(_Call(function["name"], _parse_arguments(function.get("arguments"))))


def _block_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    parts = (_dict(block).get("text") for block in _list(content))
    return "\n".join(part for part in parts if isinstance(part, str))


def _parse_blocks(blocks: list, parsed: _Parsed) -> tuple[bool, bool]:
    """Anthropic content blocks. Returns whether they held a tool call and a tool result."""
    called = answered = False
    for block in map(_dict, blocks):
        kind = block.get("type")
        if kind == "tool_use" and isinstance(block.get("name"), str):
            parsed.calls.append(_Call(block["name"], block.get("input")))
            called = True
        elif kind == "tool_result":
            parsed.results.append(_block_text(block.get("content")))
            answered = True
        elif isinstance(block.get("text"), str):
            parsed.texts.append(block["text"])
    return called, answered


def _parse_message(message: dict, parsed: _Parsed) -> tuple[bool, bool]:
    """One chat message of any JSON format. Returns whether it held a tool call and a tool result."""
    calls = _list(message.get("tool_calls"))
    for call in calls:
        _add_openai_call(call, parsed)
    if message.get("function_call"):
        _add_openai_call(message["function_call"], parsed)
    called, answered = bool(calls or message.get("function_call")), False

    content = message.get("content")
    if message.get("role") in ("tool", "function"):
        parsed.results.append(_block_text(content))
        answered = True
    elif isinstance(content, list):
        block_called, block_answered = _parse_blocks(content, parsed)
        called, answered = called or block_called, answered or block_answered
    elif isinstance(content, str):
        parsed.texts.append(content)
    return called, answered


def _parse_history(messages: list, parsed: _Parsed) -> None:
    """Count consecutive tool round trips: anything but a tool call or its result ends the run."""
    run = 0
    for message in map(_dict, messages):
        called, answered = _parse_message(message, parsed)
        run = run + 1 if called else run if answered else 0
        parsed.round_trips = max(parsed.round_trips, run)


def _parse_json(payload: dict) -> _Parsed:
    parsed = _Parsed()
    _declared_tools(payload, parsed)
    _parse_history(_list(payload.get("messages")), parsed)
    for choice in map(_dict, _list(payload.get("choices"))):
        message = _dict(choice.get("message")) or _dict(choice.get("delta"))
        parsed.round_trips = max(parsed.round_trips, int(_parse_message(message, parsed)[0]))
        if isinstance(choice.get("text"), str):
            parsed.texts.append(choice["text"])
    if payload.get("message"):
        parsed.round_trips = max(parsed.round_trips, int(_parse_message(_dict(payload["message"]), parsed)[0]))
    if isinstance(payload.get("content"), list):
        parsed.round_trips = max(parsed.round_trips, int(_parse_blocks(payload["content"], parsed)[0]))
    command = _dict(payload.get("command"))
    if isinstance(command.get("name"), str):
        parsed.calls.append(_Call(command["name"], command.get("args")))
    parsed.texts += [payload[key] for key in ("prompt", "response", "system") if isinstance(payload.get(key), str)]
    for text in parsed.texts:
        _parse_text(text, parsed)
    return parsed


def _parse_autogpt_text(text: str, parsed: _Parsed) -> None:
    """AutoGPT JSON inside prose. "thoughts" comes first and is an object too, so try the outermost brace first."""
    key = text.find('"command"')
    start = text.find("{", 0, key)
    for _ in range(_MAX_JSON_STARTS):
        if start < 0:
            return
        try:
            decoded, _end = json.JSONDecoder().raw_decode(text, start)
        except (ValueError, RecursionError):
            decoded = None
        command = _dict(_dict(decoded).get("command"))
        if isinstance(command.get("name"), str):
            parsed.calls.append(_Call(command["name"], command.get("args")))
            return
        start = text.find("{", start + 1, key)


def _parse_text(text: str, parsed: _Parsed) -> None:
    """ReAct and AutoGPT steps in free text. A tool name is one token, which skips LangChain's own prompt template."""
    if "Action Input:" in text:
        steps = [m for m in rules.REACT_STEP.finditer(text) if rules.REACT_TOOL_NAME.fullmatch(m["tool"].strip("[]`"))]
        parsed.calls += [_Call(m["tool"].strip("[]`"), _parse_arguments(m["input"].strip())) for m in steps]
        parsed.round_trips = max(parsed.round_trips, len(steps))
        parsed.results += [m["result"].strip() for m in rules.REACT_OBSERVATION.finditer(text)]
    if "one of [" in text:
        for match in rules.REACT_TOOL_LIST.finditer(text):
            parsed.tools += [name.strip() for name in match[1].split(",") if name.strip()]
    if '"command"' in text:
        _parse_autogpt_text(text, parsed)


def _parse_raw_text(text: str) -> _Parsed:
    parsed = _Parsed(texts=[text])
    _parse_text(text, parsed)
    return parsed


# --- Classification -----------------------------------------------------------------------------------------------

def _tool_kind(name: str) -> str:
    return next((kind for kind, pattern in rules.TOOL_KINDS if pattern.search(name)), "tool_call")


def _argument_text(arguments: Any) -> str:
    """The human-readable core of a call: the command or path if there is one, else compact JSON."""
    if isinstance(arguments, str):
        return arguments
    if isinstance(arguments, dict):
        for key in (*_COMMAND_KEYS, *_PATH_KEYS):
            if isinstance(arguments.get(key), str):
                return arguments[key]
    return "" if arguments is None else json.dumps(arguments, ensure_ascii=False, default=str)


def _is_command(kind: str, arguments: Any) -> bool:
    return kind in ("shell_exec", "code_exec") or (isinstance(arguments, dict) and any(
        key in arguments for key in ("command", "cmd")))


def _matched_rules(kind: str, arguments: Any, text: str) -> list[Rule]:
    command = _is_command(kind, arguments)
    sample = text[:_CLASSIFY_CHARS]
    matched = [rule for rule in rules.COMMAND_RULES if rule.regex.search(sample)] if command else []
    if command or kind == "file_read":
        matched += next(([rule] for rule in rules.PATH_RULES if rule.regex.search(sample)), [])
    return matched


def _worst(severities: Iterable[Severity]) -> Severity:
    return max(severities, key=_SEVERITY_ORDER.index)


def _behaviour_finding(rule: Rule, match: str, detail: str, key: str) -> DetFinding:
    return make_finding(
        rule, severity=rule.severity, confidence=rule.confidence, title=rule.title, description=f"{rule.title}.",
        evidence={"redacted_snippet": detail, "match_redacted": match, "entropy": None, "line": None, "offset": None,
                  "fingerprint": fingerprint(key)},
    )


def _positionless(findings: list[DetFinding]) -> list[DetFinding]:
    """Offsets from scanning a tool argument mean nothing relative to the payload the caller holds."""
    return [{**f, "evidence": {**f["evidence"], "line": None, "offset": None}} for f in findings]


def _classify_call(call: _Call) -> tuple[AgentAction, list[DetFinding]]:
    kind = _tool_kind(call.name)
    text = _argument_text(call.arguments)
    if kind == "tool_call" and _is_command(kind, call.arguments):
        kind = "shell_exec"

    scan = scan_text(text)
    redacted = scan["redacted_text"]
    detail = (redacted if kind == "shell_exec" else f"{call.name} {redacted}".strip())[:_DETAIL_CHARS]
    match = detail[:_MATCH_CHARS]
    dangerous = bool(rules.DANGEROUS_TOOL.search(call.name))
    verified = bool(rules.HUMAN_CONFIRMATION.search(
        json.dumps(call.arguments, default=str) if call.arguments is not None else ""))

    matched = _matched_rules(kind, call.arguments, text)
    findings = [_behaviour_finding(rule, match, detail, f"{rule.id}:{call.name}:{text}") for rule in matched]
    if dangerous and not verified:
        note = f"tool {call.name} called with no human confirmation"
        findings.append(_behaviour_finding(rules.UNVERIFIED_TOOL_CALL, note, detail, f"unverified:{call.name}"))
    findings += _positionless(scan["findings"])

    base: Severity = "medium" if dangerous else "low" if kind == "http_request" else "info"
    action: AgentAction = {
        "ts": "", "kind": kind, "detail": detail, "severity": _worst((base, *(f["severity"] for f in findings))),
        "verified": verified, "tool_name": call.name,
    }
    return action, findings


def _dedupe(names: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(names))


def _framework(parsed: _Parsed, payload: dict | str) -> str:
    haystack = payload if isinstance(payload, str) else "\n".join(parsed.texts)
    if not isinstance(payload, str) and isinstance(payload.get("command"), dict):
        return "autogpt"
    return next((name for name, marker in rules.FRAMEWORK_MARKERS if marker.search(haystack)), "unknown")


def _permissions(names: Iterable[str]) -> dict[str, bool]:
    names = list(names)
    return {permission: any(pattern.search(name) for name in names)
            for permission, pattern in rules.PERMISSION_TOOLS.items()}


def _loop_finding(round_trips: int, framework: str) -> DetFinding:
    note = f"{round_trips} consecutive tool round trips in one payload"
    return _behaviour_finding(rules.AUTONOMOUS_LOOP, note, note, f"payload-loop:{framework}")


def analyze_agent_payload(payload: dict | str, *, direction: str) -> AgentAnalysis:
    """Tools, tool calls and risky behaviour in a request or response body.

    A JSON request repeats every earlier tool call in its history, so it yields findings (the caller dedupes those by
    fingerprint) but no actions; those come from the response that issued each call. Raw text has no such counterpart
    and always yields actions.
    """
    if isinstance(payload, str):
        if not any(marker in payload for marker in _TEXT_MARKERS):
            return _empty()
        parsed = _parse_raw_text(payload)
    elif isinstance(payload, dict) and any(key in payload for key in _JSON_KEYS):
        parsed = _parse_json(payload)
    else:
        return _empty()
    if not parsed.tools and not parsed.calls:
        return _empty()

    actions: list[AgentAction] = []
    found: dict[tuple[str, str], DetFinding] = {}
    for call in parsed.calls[:_MAX_CALLS]:
        action, findings = _classify_call(call)
        actions.append(action)
        found.update(((f["subtype"], f["evidence"]["fingerprint"]), f) for f in findings)
    for result in parsed.results:
        found.update(((f["subtype"], f["evidence"]["fingerprint"]), f)
                     for f in _positionless(scan_text(result)["findings"]))

    framework = _framework(parsed, payload)
    if parsed.round_trips >= rules.LOOP_MIN_ROUND_TRIPS:
        finding = _loop_finding(parsed.round_trips, framework)
        found[(finding["subtype"], finding["evidence"]["fingerprint"])] = finding

    tools = _dedupe(parsed.tools)
    return {
        "is_agent": True,
        "framework": framework,
        "tools_declared": tools,
        "actions": [] if direction == "request" and isinstance(payload, dict) else actions,
        "findings": list(found.values()),
        "permissions": _permissions((*tools, *(call.name for call in parsed.calls))),
    }


# --- Autonomy score -----------------------------------------------------------------------------------------------

_RATE_REQUESTS = 6      # master §8.4: 6 requests a minute is machine speed


def _seconds(moment: float | str) -> float:
    return datetime.fromisoformat(moment).timestamp() if isinstance(moment, str) else float(moment)


def _peak_per_minute(timestamps: Iterable[float | str]) -> int:
    moments = sorted(_seconds(moment) for moment in timestamps)
    peak = start = 0
    for end, moment in enumerate(moments):
        while moment - moments[start] > 60:
            start += 1
        peak = max(peak, end - start + 1)
    return peak


def autonomy_score(timestamps: Iterable[float | str], tool_calls: int, dangerous_ratio: float) -> int:
    """Master §8.4: 35·rate_factor + 35·tool_loop_factor + 30·dangerous_tool_ratio, each factor in 0..1."""
    rate_factor = min(_peak_per_minute(timestamps) / _RATE_REQUESTS, 1.0)
    tool_loop_factor = min(tool_calls / rules.LOOP_MIN_ROUND_TRIPS, 1.0)
    return round(35 * rate_factor + 35 * tool_loop_factor + 30 * max(0.0, min(dangerous_ratio, 1.0)))
