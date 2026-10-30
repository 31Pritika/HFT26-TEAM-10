"""Single entry point to detection. Uses Part B's shadowscope_detect, or a small built-in fallback (spec 01 §A9).

Whatever the detector returns, this module re-checks it before the pipeline sees it, because the output ends up
in storage: harden() masks anything still secret-shaped, and snippets are cut from already-redacted text.
"""
from __future__ import annotations

import asyncio
import logging
import math
import re
import sys
import time
from typing import Any

from .. import config
from ..utils import fingerprint

log = logging.getLogger("shadowscope.detect")
SNIPPET_CONTEXT = 40
MASK_CHAR = "•"


def _import_detector() -> Any | None:
    try:
        import shadowscope_detect
        return shadowscope_detect
    except ImportError:
        pass
    # macOS can flag an editable install's .pth file as hidden, and Python then silently skips it.
    if (config.DETECTOR_DIR / "shadowscope_detect").is_dir():
        sys.path.insert(0, str(config.DETECTOR_DIR))
        try:
            import shadowscope_detect
            return shadowscope_detect
        except ImportError:
            pass
    log.warning("shadowscope_detect not available, using the built-in fallback detector")
    return None


_detector = _import_detector()


def use_detector(module: Any | None) -> None:
    """Swaps the active detector. Used by tests."""
    global _detector
    _detector = module


def status() -> dict:
    if _detector is None:
        return {"active": "builtin", "version": None}
    return {"active": "shadowscope_detect", "version": getattr(_detector, "__version__", None)}


# ---- Redaction -------------------------------------------------------------------------------------
def mask(value: str) -> str:
    if len(value) <= 8:
        return MASK_CHAR * len(value)
    return value[:4] + MASK_CHAR * (len(value) - 6) + value[-2:]


def mask_email(value: str) -> str:
    local, _, domain = value.partition("@")
    return f"{local[:1]}{MASK_CHAR * 3}@{domain[:1]}{MASK_CHAR * 3}.{domain.rstrip('.').rsplit('.', 1)[-1]}"


_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_REDACT_PATTERNS = [re.compile(pattern) for pattern in (
    r"(?s)-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----(?:.*?-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|[A-Za-z0-9+/=\s]*)",
    r"(?:[A-Za-z0-9+/=]{40,}\s+){2,}",  # A key body left behind when only the header was masked.
    r"\b(?:AKIA|ASIA)[0-9A-Z]{16}",
    r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}",
    r"\bgh[pousr]_[A-Za-z0-9]{36,}",
    r"\bgithub_pat_[A-Za-z0-9_]{22,}",
    r"\bAIza[0-9A-Za-z_-]{35}",
    r"\bxox[baprs]-[A-Za-z0-9-]{10,}",
    r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}",
    r"\bhf_[A-Za-z0-9]{30,}",
    r"\bgsk_[A-Za-z0-9]{40,}",
    r"\bnpm_[A-Za-z0-9]{36}",
    r"\bSG\.[\w-]{22}\.[\w-]{43}",
    r"\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}",
    r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[^\s:@/]+:[^\s@/]+@[^\s/]+",
    r"DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[^;\s]+",
    r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b",
    r"\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b",
    r"\b(?:\d[ -]?){13,19}\b",
    r"\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b",
    r"(?:\+91[\s-]?)?\b[6-9]\d{9}\b",
)]
_ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b(\s*[:=]\s*['\"]?)([^\s'\"]{8,})")


def _mask_match(match: re.Match) -> str:
    value = match.group(0)
    return value if MASK_CHAR in value else mask(value)


def harden(text: str, canaries: list[str] | None = None) -> str:
    """Masks anything still secret-shaped. Safe to run on text that is already redacted."""
    for token in canaries or []:
        if token:
            text = text.replace(token, mask(token))
    for pattern in _REDACT_PATTERNS:
        text = pattern.sub(_mask_match, text)
    text = _ASSIGNMENT.sub(lambda m: m.group(0) if MASK_CHAR in m.group(3) else f"{m.group(1)}{m.group(2)}{mask(m.group(3))}", text)
    return _EMAIL.sub(lambda m: m.group(0) if MASK_CHAR in m.group(0) else mask_email(m.group(0)), text)


def redact(text: str, canaries: list[str] | None = None) -> str:
    if _detector is not None:
        try:
            text = _detector.redact(text)
        except Exception:
            log.exception("detector redact failed")
    return harden(text, canaries)


# ---- Built-in fallback detector ----------------------------------------------------------------------
_FALLBACK_RULES = [
    ("secret", "aws_access_key", "critical", "AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), mask),
    ("secret", "openai_key", "critical", "OpenAI API key", re.compile(r"\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b"), mask),
    ("secret", "jwt", "high", "JSON Web Token", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), mask),
    ("secret", "private_key", "critical", "Private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----"), mask),
    ("pii", "email", "medium", "Email address", _EMAIL, mask_email),
]
_FALLBACK_WEIGHTS = {"critical": 60, "high": 40, "medium": 20, "low": 8, "info": 2}


def _entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = (value.count(char) for char in set(value))
    return round(-sum(n / len(value) * math.log2(n / len(value)) for n in counts), 2)


def _fallback_scan(text: str) -> dict:
    started = time.perf_counter()
    findings = []
    for finding_type, subtype, severity, title, pattern, masker in _FALLBACK_RULES:
        for match in pattern.finditer(text):
            value = match.group(0)
            findings.append({
                "type": finding_type, "subtype": subtype, "severity": severity, "confidence": 0.8,
                "title": title, "description": f"{title} found by the built-in fallback detector.",
                "evidence": {"redacted_snippet": "", "match_redacted": masker(value), "entropy": _entropy(value),
                             "line": text.count("\n", 0, match.start()) + 1, "offset": match.start(),
                             "fingerprint": fingerprint(value)},
                "detector": "regex", "compliance": [], "remediation": [],
            })
    return {
        "findings": findings,
        "redacted_text": harden(text),
        "risk_score": min(100, sum(_FALLBACK_WEIGHTS[f["severity"]] for f in findings)),
        "stats": {"chars": len(text), "lines": text.count("\n") + 1 if text else 0,
                  "entropy_max": max((_entropy(token) for token in text.split()), default=0.0),
                  "flagged_tokens": len(findings), "duration_ms": round((time.perf_counter() - started) * 1000, 2)},
    }


def _fallback_triage(finding: dict, context_snippet: str, started: float) -> dict:
    return {
        "verdict": "needs_review", "sensitivity": finding.get("severity", "medium"),
        "reasoning": "Rules-based result: no LLM was consulted.",
        "remediation_steps": list(finding.get("remediation") or []),
        "policy_suggestion": "Route this tool through the Local Gateway and review the finding.",
        "engine": "rules", "model": "rules-fallback", "latency_ms": round((time.perf_counter() - started) * 1000),
        "redacted_input_preview": context_snippet[:config.PAYLOAD_PREVIEW_CHARS],
    }


# AI process signatures, master §7. Name → (framework, category).
_PROCESS_NAMES: dict[str, tuple[str | None, str]] = {
    "cursor": ("cursor", "ai_coding"), "cursor helper": ("cursor", "ai_coding"), "windsurf": (None, "ai_coding"),
    "ollama": (None, "local_llm"), "lm studio": (None, "local_llm"), "jan": (None, "local_llm"), "gpt4all": (None, "local_llm"),
    "chatgpt": (None, "ai_saas"), "claude": ("claude_code", "ai_coding"), "aider": ("aider", "ai_coding"),
    "goose": ("custom", "ai_coding"), "interpreter": ("open_interpreter", "ai_coding"),
}
_CMDLINE_MARKERS = (("langchain", "langchain"), ("langgraph", "langchain"), ("autogpt", "autogpt"), ("crewai", "crewai"),
                    ("llama_index", "custom"), ("openai", "custom"), ("anthropic", "custom"), ("agent", "custom"))


def _fallback_classify(name: str, cmdline: list[str] | None) -> dict:
    lowered = name.lower().removesuffix(".exe")
    if name == "Claude":  # The desktop app, unlike the `claude` CLI, is not a coding agent.
        return {"is_ai_tool": True, "framework": None, "category": "ai_saas", "confidence": 0.9}
    if lowered in _PROCESS_NAMES:
        framework, category = _PROCESS_NAMES[lowered]
        return {"is_ai_tool": True, "framework": framework, "category": category, "confidence": 0.9}
    if lowered.startswith(("python", "node")):
        joined = " ".join(cmdline or []).lower()
        for marker, framework in _CMDLINE_MARKERS:
            if marker in joined:
                return {"is_ai_tool": True, "framework": framework, "category": "cloud_llm", "confidence": 0.7}
    return {"is_ai_tool": False, "framework": None, "category": None, "confidence": 0.0}


# ---- Public API --------------------------------------------------------------------------------------
def _clean_finding(raw: dict, redacted_text: str | None, canaries: list[str]) -> dict:
    evidence = dict(raw.get("evidence") or {})
    match_redacted = harden(str(evidence.get("match_redacted") or ""), canaries)
    if redacted_text is None:
        snippet = harden(str(evidence.get("redacted_snippet") or match_redacted), canaries)
    else:
        position = redacted_text.find(match_redacted) if match_redacted else -1
        start = max(position - SNIPPET_CONTEXT, 0)
        snippet = redacted_text[start:position + len(match_redacted) + SNIPPET_CONTEXT] if position >= 0 else match_redacted
    return {
        **raw,
        "confidence": float(raw.get("confidence", 0.5)),
        "description": raw.get("description") or raw.get("title", ""),
        "detector": raw.get("detector") or "regex",
        "compliance": list(raw.get("compliance") or []),
        "remediation": list(raw.get("remediation") or []),
        "evidence": {
            "redacted_snippet": snippet, "match_redacted": match_redacted, "entropy": evidence.get("entropy"),
            "line": evidence.get("line"), "offset": evidence.get("offset"), "fingerprint": evidence.get("fingerprint"),
        },
    }


def _canary_finding(token: str, text: str) -> dict:
    return {
        "type": "canary", "subtype": "canary_token", "severity": "critical", "confidence": 1.0,
        "title": "Honeytoken tripped", "description": "A policy canary token appeared in AI traffic.",
        "evidence": {"redacted_snippet": "", "match_redacted": mask(token), "entropy": None,
                     "line": text.count("\n", 0, text.find(token)) + 1, "offset": text.find(token),
                     "fingerprint": fingerprint(token)},
        "detector": "regex", "compliance": [], "remediation": [],
    }


def scan_text(text: str, *, context: dict | None = None, policy: dict | None = None) -> dict:
    """Detector scan_text, re-checked. Falls back to the built-in rules if the detector fails."""
    canaries = list((policy or {}).get("canary_tokens") or [])
    result = None
    if _detector is not None:
        try:
            result = _detector.scan_text(text, context=context, policy=policy)
        except Exception:
            log.exception("detector scan_text failed, using the fallback")
    if result is None:
        result = _fallback_scan(text)

    redacted_text = harden(result.get("redacted_text") or "", canaries)
    findings = list(result.get("findings") or [])
    known = {f.get("evidence", {}).get("fingerprint") for f in findings if f.get("type") == "canary"}
    findings += [_canary_finding(token, text) for token in canaries if token and token in text and fingerprint(token) not in known]
    return {
        "findings": [_clean_finding(finding, redacted_text, canaries) for finding in findings],
        "redacted_text": redacted_text,
        "risk_score": int(result.get("risk_score") or 0),
        "stats": result.get("stats") or _fallback_scan("")["stats"],
    }


def analyze_agent_payload(payload: dict | str, *, direction: str) -> dict:
    empty = {"is_agent": False, "framework": "unknown", "tools_declared": [], "actions": [], "findings": [], "permissions": {}}
    if _detector is None:
        return empty
    try:
        result = {**empty, **_detector.analyze_agent_payload(payload, direction=direction)}
    except Exception:
        log.exception("detector analyze_agent_payload failed")
        return empty
    result["findings"] = [_clean_finding(finding, None, []) for finding in result["findings"]]
    result["actions"] = [{**action, "detail": harden(str(action.get("detail", "")))} for action in result["actions"]]
    return result


def remediation_steps(subtype: str) -> list[str]:
    """Part B's remediation table, or nothing when it has no entry or the package is missing."""
    try:
        from shadowscope_detect.remediation import remediation_for
        return list(remediation_for(subtype) or [])
    except Exception:
        return []


def classify_process(name: str, cmdline: list[str] | None = None) -> dict:
    if _detector is not None:
        try:
            result = _detector.classify_process(name, cmdline)
            if result.get("is_ai_tool"):
                return result
        except Exception:
            log.exception("detector classify_process failed")
    return _fallback_classify(name, cmdline)


async def triage(finding: dict, context_snippet: str, *, engine_cfg: dict) -> dict:
    """Detector triage with a hard timeout. Only hardened text is ever handed over."""
    started = time.perf_counter()
    safe_context = harden(context_snippet)
    if _detector is not None:
        try:
            return await asyncio.wait_for(_detector.triage(finding, safe_context, engine_cfg=engine_cfg), config.TRIAGE_TIMEOUT_S)
        except Exception:
            log.exception("detector triage failed, using rules")
    return _fallback_triage(finding, safe_context, started)
