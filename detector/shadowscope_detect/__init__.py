"""Public detection API (spec 01 §A9). Signatures are frozen; the bodies are bootstrap stubs."""
from __future__ import annotations

import hashlib
import math
import re
import time

__version__ = "0.1.0"
__all__ = ["scan_text", "analyze_agent_payload", "classify_process", "triage", "redact", "__version__"]

_AWS_KEY = re.compile(r"AKIA[0-9A-Z]{16}")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def _mask(value: str) -> str:
    return value[:4] + "•" * max(len(value) - 6, 2) + value[-2:]


def _mask_email(value: str) -> str:
    local, domain = value.split("@", 1)
    return f"{local[0]}•••@{domain[0]}•••.{domain.rsplit('.', 1)[-1]}"


def _entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = (value.count(c) for c in set(value))
    return -sum(n / len(value) * math.log2(n / len(value)) for n in counts)


def redact(text: str) -> str:
    """Return `text` with every detected value masked."""
    return _EMAIL.sub(lambda m: _mask_email(m.group()), _AWS_KEY.sub(lambda m: _mask(m.group()), text))


def _finding(text: str, match: re.Match, finding_type: str, subtype: str, severity: str, title: str,
             masked: str, compliance: list[str], remediation: list[str]) -> dict:
    start, end = match.span()
    return {
        "type": finding_type, "subtype": subtype, "severity": severity, "confidence": 0.9,
        "title": title, "description": title,
        "evidence": {
            "redacted_snippet": redact(text[max(start - 40, 0):end + 40]),
            "match_redacted": masked,
            "entropy": round(_entropy(match.group()), 2),
            "line": text.count("\n", 0, start) + 1,
            "offset": start,
            "fingerprint": hashlib.sha256(match.group().encode()).hexdigest()[:12],
        },
        "detector": "regex", "compliance": compliance, "remediation": remediation,
    }


def scan_text(text: str, *, context: dict | None = None, policy: dict | None = None) -> dict:
    """Stub: detects only AWS access keys and emails."""
    started = time.perf_counter()
    findings = [
        _finding(text, m, "secret", "aws_access_key", "critical", "AWS access key", _mask(m.group()),
                 ["SOC2", "ISO27001"], ["Deactivate key in IAM now"])
        for m in _AWS_KEY.finditer(text)
    ]
    findings += [
        _finding(text, m, "pii", "email", "medium", "Email address", _mask_email(m.group()),
                 ["DPDP", "GDPR", "ISO27001"], ["Purge from AI provider history"])
        for m in _EMAIL.finditer(text)
    ]
    weights = {"critical": 60, "medium": 20}
    return {
        "findings": findings,
        "redacted_text": redact(text),
        "risk_score": min(100, sum(weights[f["severity"]] for f in findings)),
        "stats": {
            "chars": len(text),
            "lines": text.count("\n") + 1 if text else 0,
            "entropy_max": round(max((_entropy(t) for t in text.split()), default=0.0), 2),
            "flagged_tokens": len(findings),
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        },
    }


def analyze_agent_payload(payload: dict | str, *, direction: str) -> dict:
    """Stub: reports no agent activity. `direction` is "request" or "response"."""
    return {"is_agent": False, "framework": "unknown", "tools_declared": [], "actions": [], "findings": []}


def classify_process(name: str, cmdline: list[str] | None) -> dict:
    """Stub: recognises nothing as an AI tool."""
    return {"is_ai_tool": False, "framework": None, "category": None, "confidence": 0.0}


async def triage(finding: dict, context_snippet: str, *, engine_cfg: dict) -> dict:
    """Stub: rules-style TriageResult. Never sends anything over the network."""
    return {
        "verdict": "needs_review",
        "sensitivity": finding.get("severity", "medium"),
        "reasoning": "Rules-only stub: no LLM was consulted.",
        "remediation_steps": list(finding.get("remediation", [])),
        "policy_suggestion": "Review this finding manually.",
        "engine": "rules",
        "model": "rules-v0",
        "latency_ms": 0,
        "redacted_input_preview": redact(context_snippet)[:500],
    }
