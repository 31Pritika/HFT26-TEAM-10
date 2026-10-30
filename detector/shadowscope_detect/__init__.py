"""Public detection API (spec 01 §A9). Signatures are frozen."""
from __future__ import annotations

from .agent_analyzer import analyze_agent_payload as _analyze_agent_payload
from .classify import classify_process as _classify_process
from .scanner import scan_text
from .triage.engine import triage as _triage

__version__ = "0.2.0"
__all__ = ["scan_text", "analyze_agent_payload", "classify_process", "triage", "redact", "__version__"]


def redact(text: str) -> str:
    """Return `text` with every detected value masked."""
    return scan_text(text)["redacted_text"]


def analyze_agent_payload(payload: dict | str, *, direction: str) -> dict:
    """Tools, tool calls and risky behaviour in a body. `direction` is "request" or "response"."""
    return _analyze_agent_payload(payload, direction=direction)


def classify_process(name: str, cmdline: list[str] | None) -> dict:
    """Whether a process is an AI tool: {is_ai_tool, framework, category, confidence}."""
    return _classify_process(name, cmdline)


async def triage(finding: dict, context_snippet: str, *, engine_cfg: dict) -> dict:
    """Triage a finding: Featherless → Groq → Ollama → rules. Always redacts and re-scans before anything is sent."""
    return await _triage(finding, context_snippet, engine_cfg=engine_cfg)
