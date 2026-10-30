# ShadowScope API Contract (FROZEN)

> Verbatim copy of `docs/specs/00_MASTER_SPEC.md` §5 + §6. Do not edit without telling the team in chat.

## 5. API CONTRACT (base `http://localhost:8787/api`)

All JSON. Timestamps ISO-8601 UTC strings. IDs are strings (`evt_…`, `fnd_…`, `agt_…`, `inv_…`).
CORS allows `http://localhost:5173`, `http://127.0.0.1:5173`, `chrome-extension://*`, and the deployed
frontend origin. Errors: `{ "error": { "code": str, "message": str } }`.

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/health` | – | `{status:"ok", version, uptime_s, collectors:{name:{enabled, running, reason?}}, llm_engine}` |
| GET | `/overview` | `?window=24h` (1h,6h,24h,7d) | `Overview` |
| GET | `/events` | `?limit=100&cursor&provider&process&source&min_risk&since` | `{items: AIEvent[], next_cursor}` |
| GET | `/events/{id}` | – | `AIEvent` (+ `findings: Finding[]`) |
| GET | `/findings` | `?severity&type&status&limit&cursor&q` | `{items: Finding[], next_cursor}` |
| GET | `/findings/{id}` | – | `Finding` (+ `event: AIEvent|null`) |
| PATCH | `/findings/{id}` | `{status}` | `Finding` |
| POST | `/findings/{id}/triage` | `{engine?: "auto"|"featherless"|"groq"|"ollama"|"rules"}` | `TriageResult` |
| GET | `/inventory` | – | `{items: InventoryItem[]}` |
| GET | `/agents` | – | `{items: AgentSession[]}` |
| GET | `/agents/{id}` | – | `AgentSession` |
| GET | `/graph` | `?window=24h` | `GraphData` |
| GET | `/providers` | – | `{items: Provider[]}` |
| GET | `/policies` | – | `Policy` |
| PUT | `/policies` | `Policy` (partial ok) | `Policy` |
| POST | `/ingest` | multipart `file` (.pcap .pcapng .har .json .jsonl .log .txt) | `IngestResult` |
| POST | `/scan` | `{text, source?: "playground"|"extension"|"api", context?: {provider?, url?}}` | `ScanResult` |
| POST | `/observations` | `Observation` or `Observation[]` (localhost only — simulator & tests) | `{accepted: number, event_ids: string[]}` |
| GET | `/scenarios` | – | `{items: Scenario[]}` |
| POST | `/simulate` | `{scenario_id, intensity?: 1-3}` | `{run_id, started: true}` |
| GET | `/report` | `?window=7d` | `ComplianceReport` |
| GET | `/report/export` | `?format=json|csv` | file download |
| POST | `/extension/event` | `ExtensionEvent` | `{event_id, findings: Finding[]}` |
| WS | `/ws/stream` | – | stream of `StreamMessage` |

### StreamMessage
```json
{ "type": "event" | "finding" | "stats" | "agent" | "collector", "data": { ... } }
```
`stats` data = `{risk_score, risk_grade, totals}` (subset of Overview) every 3 s.

## 6. DATA MODELS (TypeScript notation — Python uses identical keys, snake_case)

```ts
type Severity = "critical" | "high" | "medium" | "low" | "info";
type Source = "live_conn" | "dns_sni" | "loopback" | "gateway" | "pcap" | "har" | "log" | "extension" | "simulator";
type ProviderCategory = "cloud_llm" | "local_llm" | "ai_saas" | "ai_coding" | "unknown";

interface Provider { id: string; name: string; category: ProviderCategory; hosts: string[]; ports: number[]; paths: string[]; logo?: string; }

interface ProcessInfo { pid: number | null; name: string; exe: string | null; user: string | null; parent: string | null; cmdline_hint: string | null; }

interface AIEvent {
  id: string; ts: string; source: Source;
  process: ProcessInfo;
  provider: { id: string; name: string; category: ProviderCategory } | null;
  dest: { host: string; ip: string | null; port: number; path: string | null; protocol: "https" | "http" | "tls" | "tcp" };
  method: string | null; model: string | null;
  bytes_out: number; bytes_in: number;
  payload_visible: boolean;            // did we see plaintext?
  payload_preview: string | null;      // REDACTED, max 500 chars
  sanctioned: boolean;
  risk_score: number;                  // 0-100
  finding_ids: string[];
  tags: string[];                      // e.g. ["shadow-ai","agent","tool-call","burst"]
}

interface Evidence { redacted_snippet: string; match_redacted: string; entropy: number | null; line: number | null; offset: number | null; fingerprint: string | null; } // fingerprint = sha256(match)[:12]

interface Finding {
  id: string; ts: string; event_id: string | null;
  type: "secret" | "pii" | "source_code" | "agent_action" | "shadow_ai" | "canary" | "policy" | "exfil_volume";
  subtype: string;                     // see §8
  severity: Severity; confidence: number; // 0..1
  title: string; description: string;
  evidence: Evidence;
  detector: "regex" | "entropy" | "heuristic" | "validator" | "llm" | "process" | "anomaly";
  provider_id: string | null; process_name: string | null;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  compliance: string[];                // ["DPDP","GDPR","SOC2","PCI-DSS","ISO27001"]
  remediation: string[];               // rule-based steps
  triage: TriageResult | null;
}

interface TriageResult {
  verdict: "true_positive" | "likely_false_positive" | "needs_review";
  sensitivity: Severity; reasoning: string;
  remediation_steps: string[]; policy_suggestion: string;
  engine: "featherless" | "groq" | "ollama" | "rules"; model: string; latency_ms: number;
  redacted_input_preview: string;      // proves nothing raw was sent
}

interface AgentAction { ts: string; kind: "shell_exec" | "file_read" | "file_write" | "http_request" | "code_exec" | "tool_call"; detail: string; severity: Severity; verified: boolean; tool_name: string | null; }

interface AgentSession {
  id: string; process_name: string; pid: number | null;
  framework: "langchain" | "autogpt" | "crewai" | "cursor" | "claude_code" | "aider" | "open_interpreter" | "custom" | "unknown";
  provider_id: string | null; started: string; last_seen: string;
  requests: number; tools_used: { name: string; count: number; severity: Severity }[];
  actions: AgentAction[];
  permissions: { shell: boolean; filesystem_read: boolean; filesystem_write: boolean; network: boolean; internal_api: boolean; code_exec: boolean };
  autonomy_score: number; risk_score: number; status: "active" | "idle" | "blocked";
}

interface InventoryItem {
  id: string; process_name: string; exe: string | null; category: ProviderCategory;
  provider_ids: string[]; first_seen: string; last_seen: string;
  request_count: number; bytes_out: number; sanctioned: boolean;
  risk_score: number; findings_count: number; is_agent: boolean;
}

interface Overview {
  risk_score: number; risk_grade: "A" | "B" | "C" | "D" | "F";
  risk_trend: { ts: string; score: number }[];                  // 24 points
  totals: { events: number; ai_requests: number; findings_open: number; critical: number; secrets: number; pii: number; agent_actions: number; shadow_tools: number; bytes_out: number };
  by_provider: { provider_id: string; name: string; count: number; bytes_out: number }[];
  by_severity: Record<Severity, number>;
  by_type: Record<string, number>;
  timeline: { ts: string; requests: number; findings: number }[]; // 24 buckets
  top_processes: { name: string; count: number; risk_score: number }[];
  compliance: { DPDP: number; GDPR: number; SOC2: number; "PCI-DSS": number; ISO27001: number }; // 0-100, higher = better
  collectors: { name: string; running: boolean }[];
}

interface GraphData {
  nodes: { id: string; label: string; kind: "process" | "provider" | "host" | "agent"; risk: number; size: number }[];
  links: { source: string; target: string; weight: number; risk: number }[];
}

interface Policy {
  sanctioned_providers: string[]; sanctioned_processes: string[]; blocked_providers: string[];
  canary_tokens: string[];             // org honeytokens — any appearance = critical
  entropy_threshold: number;           // default 4.0
  alert_min_severity: Severity;
  redact_in_storage: true;             // always true
  llm_triage: { enabled: boolean; engine: "auto" | "featherless" | "groq" | "ollama" | "rules"; model: string | null };
  self_exclude: true;                  // ShadowScope's own LLM calls are never flagged
}

interface ScanResult { findings: Finding[]; risk_score: number; redacted_text: string; stats: { chars: number; lines: number; entropy_max: number; flagged_tokens: number; duration_ms: number } }

interface IngestResult { file_name: string; format: "pcap" | "har" | "jsonl" | "json" | "log"; events_created: number; findings_created: number; ai_requests: number; duration_ms: number; warnings: string[] }

interface Scenario { id: string; name: string; description: string; icon: string; severity: Severity; tags: string[] }

interface Observation {               // raw input to the pipeline (collectors, gateway, simulator, ingest)
  source: Source; ts?: string;
  process?: Partial<ProcessInfo>;
  dest: { host: string; ip?: string | null; port: number; path?: string | null; protocol?: "https" | "http" | "tls" | "tcp" };
  method?: string | null; headers?: Record<string, string>;
  body_text?: string | null; response_text?: string | null;
  bytes_out?: number; bytes_in?: number;
  meta?: { scenario_id?: string; run_id?: string; [k: string]: unknown };
}

interface ExtensionEvent { site: string; url: string; kind: "paste" | "submit" | "file_drop"; text: string; ts: string; browser: "chrome" | "edge" | "other" }

interface ComplianceReport {
  generated_at: string; org: string; window: { from: string; to: string };
  overall: { score: number; grade: string; summary: string };
  frameworks: { id: string; name: string; score: number; controls: { id: string; name: string; status: "pass" | "warn" | "fail"; evidence: string }[] }[];
  top_findings: Finding[]; inventory: InventoryItem[]; agents: AgentSession[];
  recommendations: { priority: "P0" | "P1" | "P2"; title: string; detail: string }[];
  stats: Overview["totals"];
}
```
