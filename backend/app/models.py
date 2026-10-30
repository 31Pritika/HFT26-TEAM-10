"""Pydantic models mirroring master spec §6. Keys must stay identical to contracts/API.md."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low", "info"]
Source = Literal["live_conn", "dns_sni", "loopback", "gateway", "pcap", "har", "log", "extension", "simulator"]
ProviderCategory = Literal["cloud_llm", "local_llm", "ai_saas", "ai_coding", "unknown"]
Protocol = Literal["https", "http", "tls", "tcp"]
FindingType = Literal["secret", "pii", "source_code", "agent_action", "shadow_ai", "canary", "policy", "exfil_volume"]
FindingStatus = Literal["open", "acknowledged", "resolved", "false_positive"]
Detector = Literal["regex", "entropy", "heuristic", "validator", "llm", "process", "anomaly"]
TriageEngine = Literal["featherless", "groq", "ollama", "rules"]
Framework = Literal["langchain", "autogpt", "crewai", "cursor", "claude_code", "aider", "open_interpreter", "custom", "unknown"]


class Provider(BaseModel):
    id: str
    name: str
    category: ProviderCategory
    hosts: list[str]
    ports: list[int]
    paths: list[str]
    logo: str | None = None


class ProcessInfo(BaseModel):
    pid: int | None = None
    name: str
    exe: str | None = None
    user: str | None = None
    parent: str | None = None
    cmdline_hint: str | None = None


class ProviderRef(BaseModel):
    id: str
    name: str
    category: ProviderCategory


class EventDest(BaseModel):
    host: str
    ip: str | None = None
    port: int
    path: str | None = None
    protocol: Protocol


class AIEvent(BaseModel):
    id: str
    ts: str
    source: Source
    process: ProcessInfo
    provider: ProviderRef | None
    dest: EventDest
    method: str | None
    model: str | None
    bytes_out: int
    bytes_in: int
    payload_visible: bool
    payload_preview: str | None
    sanctioned: bool
    risk_score: int
    finding_ids: list[str]
    tags: list[str]


class Evidence(BaseModel):
    redacted_snippet: str
    match_redacted: str
    entropy: float | None = None
    line: int | None = None
    offset: int | None = None
    fingerprint: str | None = None


class TriageResult(BaseModel):
    verdict: Literal["true_positive", "likely_false_positive", "needs_review"]
    sensitivity: Severity
    reasoning: str
    remediation_steps: list[str]
    policy_suggestion: str
    engine: TriageEngine
    model: str
    latency_ms: int
    redacted_input_preview: str


class Finding(BaseModel):
    id: str
    ts: str
    event_id: str | None
    type: FindingType
    subtype: str
    severity: Severity
    confidence: float
    title: str
    description: str
    evidence: Evidence
    detector: Detector
    provider_id: str | None
    process_name: str | None
    status: FindingStatus
    compliance: list[str]
    remediation: list[str]
    triage: TriageResult | None


class AIEventDetail(AIEvent):
    findings: list[Finding]


class FindingDetail(Finding):
    event: AIEvent | None


class AgentAction(BaseModel):
    ts: str
    kind: Literal["shell_exec", "file_read", "file_write", "http_request", "code_exec", "tool_call"]
    detail: str
    severity: Severity
    verified: bool
    tool_name: str | None


class ToolUsage(BaseModel):
    name: str
    count: int
    severity: Severity


class AgentPermissions(BaseModel):
    shell: bool
    filesystem_read: bool
    filesystem_write: bool
    network: bool
    internal_api: bool
    code_exec: bool


class AgentSession(BaseModel):
    id: str
    process_name: str
    pid: int | None
    framework: Framework
    provider_id: str | None
    started: str
    last_seen: str
    requests: int
    tools_used: list[ToolUsage]
    actions: list[AgentAction]
    permissions: AgentPermissions
    autonomy_score: int
    risk_score: int
    status: Literal["active", "idle", "blocked"]


class InventoryItem(BaseModel):
    id: str
    process_name: str
    exe: str | None
    category: ProviderCategory
    provider_ids: list[str]
    first_seen: str
    last_seen: str
    request_count: int
    bytes_out: int
    sanctioned: bool
    risk_score: int
    findings_count: int
    is_agent: bool


class Totals(BaseModel):
    events: int
    ai_requests: int
    findings_open: int
    critical: int
    secrets: int
    pii: int
    agent_actions: int
    shadow_tools: int
    bytes_out: int


class RiskPoint(BaseModel):
    ts: str
    score: int


class ProviderStat(BaseModel):
    provider_id: str
    name: str
    count: int
    bytes_out: int


class TimelineBucket(BaseModel):
    ts: str
    requests: int
    findings: int


class ProcessStat(BaseModel):
    name: str
    count: int
    risk_score: int


class CollectorState(BaseModel):
    name: str
    running: bool


class Overview(BaseModel):
    risk_score: int
    risk_grade: Literal["A", "B", "C", "D", "F"]
    risk_trend: list[RiskPoint]
    totals: Totals
    by_provider: list[ProviderStat]
    by_severity: dict[str, int]
    by_type: dict[str, int]
    timeline: list[TimelineBucket]
    top_processes: list[ProcessStat]
    compliance: dict[str, int]
    collectors: list[CollectorState]


class GraphNode(BaseModel):
    id: str
    label: str
    kind: Literal["process", "provider", "host", "agent"]
    risk: int
    size: int


class GraphLink(BaseModel):
    source: str
    target: str
    weight: int
    risk: int


class GraphData(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]


class LlmTriagePolicy(BaseModel):
    enabled: bool
    engine: Literal["auto", "featherless", "groq", "ollama", "rules"]
    model: str | None


class Policy(BaseModel):
    sanctioned_providers: list[str]
    sanctioned_processes: list[str]
    blocked_providers: list[str]
    canary_tokens: list[str]
    entropy_threshold: float
    alert_min_severity: Severity
    redact_in_storage: Literal[True]
    llm_triage: LlmTriagePolicy
    self_exclude: Literal[True]
    block_on_critical: bool = True  # Additive to §6: the gateway refuses requests with critical findings (spec §A5).


class PolicyUpdate(BaseModel):
    sanctioned_providers: list[str] | None = None
    sanctioned_processes: list[str] | None = None
    blocked_providers: list[str] | None = None
    canary_tokens: list[str] | None = None
    entropy_threshold: float | None = Field(default=None, ge=0, le=8)
    alert_min_severity: Severity | None = None
    redact_in_storage: Literal[True] | None = None
    llm_triage: LlmTriagePolicy | None = None
    self_exclude: Literal[True] | None = None
    block_on_critical: bool | None = None


class ScanStats(BaseModel):
    chars: int
    lines: int
    entropy_max: float
    flagged_tokens: int
    duration_ms: float


class ScanResult(BaseModel):
    findings: list[Finding]
    risk_score: int
    redacted_text: str
    stats: ScanStats


class IngestResult(BaseModel):
    file_name: str
    format: Literal["pcap", "har", "jsonl", "json", "log"]
    events_created: int
    findings_created: int
    ai_requests: int
    duration_ms: int
    warnings: list[str]


class Scenario(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    severity: Severity
    tags: list[str]


class ObservationProcess(BaseModel):
    pid: int | None = None
    name: str | None = None
    exe: str | None = None
    user: str | None = None
    parent: str | None = None
    cmdline_hint: str | None = None


class ObservationDest(BaseModel):
    host: str
    ip: str | None = None
    port: int
    path: str | None = None
    protocol: Protocol | None = None


class Observation(BaseModel):
    source: Source
    ts: str | None = None
    process: ObservationProcess | None = None
    dest: ObservationDest
    method: str | None = None
    headers: dict[str, str] | None = None
    body_text: str | None = None
    response_text: str | None = None
    bytes_out: int | None = None
    bytes_in: int | None = None
    meta: dict[str, Any] | None = None


class ExtensionEvent(BaseModel):
    site: str
    url: str
    kind: Literal["paste", "submit", "file_drop"]
    text: str
    ts: str
    browser: Literal["chrome", "edge", "other"]
    findings: list[dict] = []  # Additive to §6: the extension scans before redacting, so the engine cannot find these again.


class ComplianceControl(BaseModel):
    id: str
    name: str
    status: Literal["pass", "warn", "fail"]
    evidence: str


class ComplianceFramework(BaseModel):
    id: str
    name: str
    score: int
    controls: list[ComplianceControl]


class ReportOverall(BaseModel):
    score: int
    grade: str
    summary: str


class Recommendation(BaseModel):
    priority: Literal["P0", "P1", "P2"]
    title: str
    detail: str


class ComplianceReport(BaseModel):
    generated_at: str
    org: str
    window: dict[str, str]
    overall: ReportOverall
    frameworks: list[ComplianceFramework]
    top_findings: list[Finding]
    inventory: list[InventoryItem]
    agents: list[AgentSession]
    recommendations: list[Recommendation]
    stats: Totals


class EventPage(BaseModel):
    items: list[AIEvent]
    next_cursor: str | None


class FindingPage(BaseModel):
    items: list[Finding]
    next_cursor: str | None


class InventoryList(BaseModel):
    items: list[InventoryItem]


class AgentList(BaseModel):
    items: list[AgentSession]


class ScenarioList(BaseModel):
    items: list[Scenario]


class FindingPatch(BaseModel):
    status: FindingStatus


class TriageRequest(BaseModel):
    engine: Literal["auto", "featherless", "groq", "ollama", "rules"] | None = None


class ScanContext(BaseModel):
    provider: str | None = None
    url: str | None = None


class ScanRequest(BaseModel):
    text: str
    source: Literal["playground", "extension", "api"] | None = None
    context: ScanContext | None = None


class SimulateRequest(BaseModel):
    scenario_id: str
    intensity: int = Field(default=1, ge=1, le=3)
