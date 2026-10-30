"""Public detection API (spec 01 §A9). Signatures are frozen; agent, classify and triage are still stubs."""
from __future__ import annotations

from .scanner import scan_text

__version__ = "0.1.0"
__all__ = ["scan_text", "analyze_agent_payload", "classify_process", "triage", "redact", "__version__"]


def redact(text: str) -> str:
    """Return `text` with every detected value masked."""
    return scan_text(text)["redacted_text"]


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
