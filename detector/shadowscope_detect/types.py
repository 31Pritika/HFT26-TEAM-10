"""TypedDicts for the detector's public payloads (keys = master spec §6, spec 01 §A9)."""
from __future__ import annotations

from typing import Literal, TypedDict

Severity = Literal["critical", "high", "medium", "low", "info"]
FindingType = Literal["secret", "pii", "source_code", "agent_action", "shadow_ai", "canary", "policy", "exfil_volume"]
Detector = Literal["regex", "entropy", "heuristic", "validator", "llm", "process", "anomaly"]


class Evidence(TypedDict):
    redacted_snippet: str
    match_redacted: str
    entropy: float | None
    line: int | None
    offset: int | None
    fingerprint: str | None  # sha256(match)[:12]


class DetFinding(TypedDict):
    """Finding minus the keys Part A owns (id, ts, event_id, status, triage, provider_id, process_name)."""
    type: FindingType
    subtype: str
    severity: Severity
    confidence: float
    title: str
    description: str
    evidence: Evidence
    detector: Detector
    compliance: list[str]
    remediation: list[str]


class ScanStats(TypedDict):
    chars: int
    lines: int
    entropy_max: float
    flagged_tokens: int
    duration_ms: float


class ScanResult(TypedDict):
    findings: list[DetFinding]
    risk_score: int
    redacted_text: str
    stats: ScanStats


class AgentAction(TypedDict):
    ts: str
    kind: Literal["shell_exec", "file_read", "file_write", "http_request", "code_exec", "tool_call"]
    detail: str
    severity: Severity
    verified: bool
    tool_name: str | None


class AgentAnalysis(TypedDict):
    is_agent: bool
    framework: str
    tools_declared: list[str]
    actions: list[AgentAction]
    findings: list[DetFinding]
    permissions: dict[str, bool]


class ProcessClass(TypedDict):
    is_ai_tool: bool
    framework: str | None
    category: Literal["cloud_llm", "local_llm", "ai_saas", "ai_coding", "unknown"] | None
    confidence: float


class TriageResult(TypedDict):
    verdict: Literal["true_positive", "likely_false_positive", "needs_review"]
    sensitivity: Severity
    reasoning: str
    remediation_steps: list[str]
    policy_suggestion: str
    engine: Literal["featherless", "groq", "ollama", "rules"]
    model: str
    latency_ms: int
    redacted_input_preview: str
