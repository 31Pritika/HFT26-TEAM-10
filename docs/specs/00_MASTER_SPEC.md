# 00 — MASTER SPEC · ShadowScope

> **AI Shadow IT & Agentic Data Exfiltration Scanner**
> Team **git push n pray** · Hacktoberfest @ CBIT · 16-hour build
> Tagline: *"See every AI your company talks to — without breaking TLS."*

Every AI coding tool on every laptop MUST read this file first, then its own part spec.
This file is the **single source of truth** for: product scope, folder ownership, API contracts,
data models, detection rules, design system and Git workflow. If a part spec disagrees with this
file, **this file wins**.

---

## 1. Problem (one paragraph)

Employees paste source code, credentials and customer PII into unmonitored AI tools (ChatGPT, Claude,
Gemini, Cursor, Copilot, local Ollama), and developers wire autonomous agents (LangChain, AutoGPT,
CrewAI, Cursor agent mode) to shells, file systems and internal APIs with zero governance.
This traffic is spread across browsers, desktop apps, CLIs and localhost servers, much of it over
TLS — so a single guardrail LLM sitting at one chokepoint cannot see it.

## 2. What we build

A **non-invasive endpoint + network auditing engine** and a **local, privacy-first dashboard**:

1. **Discover** every process talking to an AI provider (cloud or local) — no SSL decryption.
2. **Inspect** every payload we can legitimately see (localhost LLM traffic, HAR/PCAP/log uploads,
   opt-in local gateway, browser-extension paste events) for secrets, PII, proprietary code.
3. **Flag** risky agent behaviour: shell execution, sensitive file reads, unverified tool calls,
   machine-speed autonomous loops, process trees that spawn shells.
4. **Triage** flagged snippets with an LLM (Featherless → Groq → Ollama → rules fallback) —
   **always redacted before sending**.
5. **Score & report**: org risk score (0–100, grade A–F), compliance mapping (India DPDP Act 2023,
   GDPR, SOC 2, PCI-DSS, ISO 27001), printable report.

### 2.1 How we see traffic WITHOUT SSL decryption (say this in demo + README)

| Source | What we get | Mechanism |
|---|---|---|
| Process↔socket map | process, PID, remote IP, port, bytes | `psutil.net_connections()` + `lsof` fallback (macOS) |
| IP-cache resolution | provider for a remote IP | resolve all known AI hostnames every 5 min → IP→provider map |
| DNS / TLS-SNI sniff | hostname being contacted | scapy on UDP 53 + TLS ClientHello SNI (plaintext in handshake) |
| Loopback sniff | **full plaintext payloads** | local LLM servers (Ollama :11434 etc.) speak plain HTTP on localhost |
| Opt-in Local Gateway ("Tap") | full payloads | app → `http://localhost:8789` (plain) → provider (TLS). No root CA, no MITM |
| Browser extension | prompt text pasted/typed into ChatGPT/Claude/Gemini | MV3 content script, reports to localhost |
| Uploads | full payloads | HAR (Chrome/Edge DevTools export), PCAP, JSON/JSONL logs |
| Simulator | realistic leaks & rogue agents | generates real localhost traffic + sample files |

## 3. Team, laptops, tools, ownership

| Part | Owner laptop | Tool | Branch | Folders OWNED (only this person edits) | Load |
|---|---|---|---|---|---|
| **A · Core Engine** | Vishwak's Mac | Claude Code | `vishwak/core-engine` | `backend/`, `scripts/`, `docs/backend.md` | ★★★★★ |
| **B · Detection, Intelligence & Simulator** | Aaraadhyaa's Mac | Claude Code | `aaraadhyaa/detection-intel` | `detector/`, `simulator/`, `extension/`, `docs/detector.md`, `docs/simulator.md` | ★★★★☆ |
| **C · Command Console (dashboard)** | Kevin's Windows | Antigravity | `kevin/dashboard` | `web/src/app/`, `web/src/dashboard/`, `web/src/shared/`, `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/src/index.css` | ★★★★ |
| **D · Experience Layer** | Pritika's Windows | Antigravity | `pritika/experience` | `web/src/experience/` (incl. `constellation/` for `/app/graph`), `web/public/experience/`, `README.md` (root), `docs/DEMO_SCRIPT.md`, `docs/architecture.md` | ★★★½ |

Rule of thumb: **Macs + Claude Code = logic** (backend, detection, simulator, extension); **Windows + Antigravity
= frontend** (console, landing, playground, report, 3D graph). Macs carry the heavier load.

**Shared / frozen after bootstrap** (nobody edits without telling the team in chat):
`contracts/` (API contract + mock data), `docs/specs/`.

**Progress logs:** each owner's AI keeps `docs/progress/<name>.md` (vishwak/kevin/aaraadhyaa/pritika)
up to date after every task: what's done, what's next, known issues. New AI sessions read it first.

### 3.1 Golden rules for every AI agent
1. Never edit files outside your ownership list. Need a change elsewhere? Write it in your progress
   log under `## Requests to other parts` and continue with a local workaround.
2. Never block on another part. Code against the contracts in §5 and the mock data in `contracts/mock/`.
3. Commit small and often (every working sub-feature), conventional commits:
   `feat(core): ...`, `fix(detector): ...`, `feat(dashboard): ...`, `feat(experience): ...`.
4. Push to your own branch at the end of every phase (and ideally every ~45 min).
5. Never commit real secrets. `.env` is git-ignored. Test fixtures use **obviously fake** keys that
   still match patterns (e.g. `AKIAFAKEFAKEFAKE1234`). Never send fake-secret payloads to real
   external AI providers — only to localhost.
6. Free & open-source only. No paid APIs, no premium libraries.
7. Must work on Chrome + Edge, desktop + mobile (375px → 1920px).

## 4. Repository layout (created by bootstrap — MASTER_PROMPT)

Repo: https://github.com/31Pritika/HFT26-TEAM-10 (root folder `HFT26-TEAM-10/`).

```
HFT26-TEAM-10/
├── README.md                  # D owns (final) — keep organizers' team-info + rules sections
├── LICENSE                    # MIT
├── .gitignore  .editorconfig  .env.example
├── contracts/                 # FROZEN
│   ├── API.md                 # copy of §5 + §6
│   └── mock/                  # overview.json events.json findings.json agents.json
│                              # inventory.json graph.json policies.json report.json providers.json
│                              # scenarios.json  + generate.py
├── docs/
│   ├── specs/                 # these spec + prompt files
│   └── progress/              # per-owner progress logs
├── backend/                   # A — FastAPI engine (Python 3.11+)
├── simulator/                 # B — traffic generator, mock AI provider, sample PCAP/HAR
├── scripts/                   # A — start.sh, start.ps1, demo helpers
├── detector/                  # B — python package `shadowscope_detect` + CLI + tests
├── extension/                 # B — Chrome/Edge MV3 extension
└── web/                       # React app
    ├── src/app/               # C — shell, router, layout, transitions
    ├── src/dashboard/         # C — /app/* pages
    ├── src/shared/            # C — api client, types, mock stream, design primitives
    └── src/experience/        # D — /, /playground, /report, /architecture, 404, constellation/ (/app/graph)
```

### Ports
| Service | Port |
|---|---|
| Backend API + WebSocket | **8787** |
| Web (Vite dev) | **5173** |
| Mock AI provider (simulator, Part B) | **8788** |
| Local Gateway / Tap (opt-in) | **8789** |
| Ollama (real, local) | 11434 |

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

## 7. AI PROVIDER FINGERPRINTS (canonical list)

| id | name | category | hosts | ports / paths |
|---|---|---|---|---|
| openai | OpenAI API | cloud_llm | api.openai.com | /v1/chat/completions /v1/responses /v1/embeddings |
| chatgpt | ChatGPT | ai_saas | chatgpt.com, chat.openai.com | |
| anthropic | Anthropic API | cloud_llm | api.anthropic.com | /v1/messages |
| claude_web | Claude.ai | ai_saas | claude.ai | |
| gemini | Google Gemini API | cloud_llm | generativelanguage.googleapis.com | :generateContent |
| gemini_web | Gemini | ai_saas | gemini.google.com, aistudio.google.com | |
| azure_openai | Azure OpenAI | cloud_llm | *.openai.azure.com | |
| huggingface | Hugging Face | cloud_llm | api-inference.huggingface.co, router.huggingface.co, huggingface.co | |
| featherless | Featherless | cloud_llm | api.featherless.ai | /v1/chat/completions |
| groq | Groq | cloud_llm | api.groq.com | /openai/v1/chat/completions |
| mistral | Mistral | cloud_llm | api.mistral.ai, chat.mistral.ai | |
| cohere | Cohere | cloud_llm | api.cohere.ai, api.cohere.com | |
| together | Together AI | cloud_llm | api.together.xyz | |
| openrouter | OpenRouter | cloud_llm | openrouter.ai | /api/v1/chat/completions |
| perplexity | Perplexity | ai_saas | api.perplexity.ai, perplexity.ai | |
| deepseek | DeepSeek | cloud_llm | api.deepseek.com, chat.deepseek.com | |
| xai | xAI / Grok | cloud_llm | api.x.ai, grok.com | |
| replicate | Replicate | cloud_llm | api.replicate.com | |
| copilot | GitHub Copilot | ai_coding | api.githubcopilot.com, copilot-proxy.githubusercontent.com | |
| ms_copilot | Microsoft Copilot | ai_saas | copilot.microsoft.com | |
| cursor | Cursor | ai_coding | api2.cursor.sh, *.cursor.sh | |
| codeium | Codeium / Windsurf | ai_coding | server.codeium.com, *.codeium.com | |
| ollama | Ollama (local) | local_llm | localhost, 127.0.0.1 | 11434 · /api/generate /api/chat /api/embeddings /v1/chat/completions |
| lmstudio | LM Studio | local_llm | localhost | 1234 · /v1/* |
| llamacpp | llama.cpp server | local_llm | localhost | 8080 · /completion /v1/* |
| vllm | vLLM | local_llm | localhost | 8000 · /v1/* |
| textgen | text-generation-webui / Gradio | local_llm | localhost | 5000, 7860 |
| jan | Jan | local_llm | localhost | 1337 |
| gpt4all | GPT4All | local_llm | localhost | 4891 |
| mock_ai | ShadowScope Mock Provider | cloud_llm | localhost | 8788 (demo only, presents as "api.openai.com" via Host header) |

Generic AI path signatures (any host): `/v1/chat/completions`, `/v1/completions`, `/v1/messages`,
`/v1/embeddings`, `/v1/responses`, `/api/generate`, `/api/chat`, `:generateContent`.

**AI process signatures** (for inventory / agent detection): `Cursor`, `Cursor Helper`, `Windsurf`,
`ollama`, `LM Studio`, `Jan`, `gpt4all`, `ChatGPT`, `Claude`, `claude` (Claude Code CLI), `aider`,
`goose`, `interpreter` (Open Interpreter), and `python`/`node` processes whose cmdline contains
`langchain`, `langgraph`, `autogpt`, `crewai`, `llama_index`, `openai`, `anthropic`, `agent`.

## 8. DETECTION RULES (canonical — B implements in Python, D ports to TS for the Playground, B ports to JS for extension)

### 8.1 Secrets (type `secret`)
| subtype | regex (PCRE-ish) | severity |
|---|---|---|
| aws_access_key | `\b(AKIA|ASIA)[0-9A-Z]{16}\b` | critical |
| aws_secret_key | `(?i)aws.{0,20}(secret|private).{0,20}['"][0-9a-zA-Z/+]{40}['"]` | critical |
| openai_key | `\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b` (not `sk-ant-`) | critical |
| anthropic_key | `\bsk-ant-[A-Za-z0-9_-]{20,}\b` | critical |
| github_token | `\bgh[pousr]_[A-Za-z0-9]{36,}\b` · `\bgithub_pat_[A-Za-z0-9_]{22,}\b` | critical |
| google_api_key | `\bAIza[0-9A-Za-z_-]{35}\b` | high |
| slack_token | `\bxox[baprs]-[A-Za-z0-9-]{10,}\b` | high |
| stripe_key | `\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b` | critical (live) / medium (test) |
| hf_token | `\bhf_[A-Za-z0-9]{30,}\b` | high |
| groq_key | `\bgsk_[A-Za-z0-9]{40,}\b` | high |
| npm_token | `\bnpm_[A-Za-z0-9]{36}\b` | high |
| sendgrid_key | `\bSG\.[\w-]{22}\.[\w-]{43}\b` | high |
| jwt | `\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b` (decode header+claims for evidence: alg, exp, sub) | high |
| private_key | `-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----` | critical |
| db_connection_url | `\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp)://[^\s:@/]+:[^\s@/]+@[^\s/]+` | critical |
| azure_conn_string | `DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[^;]+` | critical |
| gcp_service_account | `"type"\s*:\s*"service_account"` | critical |
| generic_secret_assignment | `(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*['"]?([^\s'"]{8,})` — value must pass entropy ≥ 3.0 or len ≥ 16 | high |
| high_entropy_string | token len ≥ 20, base64/hex-ish charset, Shannon ≥ `entropy_threshold` (4.0; hex ≥ 3.0), not already matched | medium (conf = clamp((H-3.5)/1.5)) |

### 8.2 PII (type `pii`)
| subtype | rule | severity |
|---|---|---|
| email | RFC-ish `[\w.+-]+@[\w-]+\.[\w.-]+` | medium (≥5 in one payload → high "bulk_pii") |
| phone_in | `(?:\+91[\s-]?)?[6-9]\d{9}\b` | medium |
| phone_intl | `\+\d{1,3}[\s-]?\d{6,14}\b` | low |
| aadhaar | `\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b` **+ Verhoeff checksum** | high |
| pan | `\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b` | high |
| gstin | `\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b` | medium |
| upi_id | `\b[\w.-]{2,}@(okaxis|okhdfcbank|okicici|oksbi|ybl|paytm|upi|apl|ibl|axl)\b` | medium |
| ifsc | `\b[A-Z]{4}0[A-Z0-9]{6}\b` | low |
| passport_in | `\b[A-PR-WY][1-9]\d{6}\b` (context word "passport" within 30 chars) | medium |
| credit_card | `\b(?:\d[ -]?){13,19}\b` **+ Luhn** + IIN prefix (4,51-55,2221-2720,34,37,6011,65,60,81,82 RuPay) | critical |
| us_ssn | `\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b` | high |
| private_ip | `\b(10\.\d+|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d+\.\d+\b` | low ("internal_infra") |
| internal_host | `\b[\w-]+\.(internal|corp|intranet|local|lan)\b` | low |

### 8.3 Source code & canaries
- `source_code`: ≥ 5 lines matching code signals (`import `, `from x import`, `def `, `class `, `function `,
  `const `, `=>`, `#include`, `public static`, `package `, `SELECT .* FROM`, braces/semicolon density)
  → medium; if file also contains `Proprietary|Confidential|Internal use only|Copyright .* (Inc|Ltd|Pvt)`
  → high subtype `proprietary_code`.
- `canary`: any `policy.canary_tokens` string present → **critical**, confidence 1.0.

### 8.4 Agent behaviour (type `agent_action`)
Tool-call formats to parse: OpenAI (`tools[]`, `choices[].message.tool_calls[].function{name,arguments}`),
Anthropic (`tools[]`, `content[] type=tool_use {name,input}`), Ollama (`tools`, `message.tool_calls`),
LangChain ReAct text (`Action: <tool>\nAction Input: <...>`), AutoGPT JSON (`{"command":{"name":..,"args":..}}`).

Dangerous tool names: `/shell|bash|terminal|exec|run_command|execute|python_repl|code_interpreter|subprocess|powershell|cmd|read_file|file_read|write_file|fs_|delete/i`

| subtype | patterns | severity |
|---|---|---|
| destructive_command | `rm\s+-rf`, `mkfs`, `dd\s+if=`, `:\(\)\{`, `del\s+/s\s+/q`, `Remove-Item .* -Recurse .* -Force`, `format\s+[a-z]:` | critical |
| remote_code_exec | `curl[^|]*\|\s*(ba|z)?sh`, `wget[^|]*\|\s*sh`, `iex\s*\(\s*iwr`, `Invoke-Expression`, `python -c .*exec` | critical |
| data_exfil_command | `curl .*(-d|--data|-F|--upload-file)\s*@`, `scp `, `nc .* -e`, `base64 .*\|\s*curl` | high |
| privilege_escalation | `\bsudo\b`, `chmod\s+777`, `chown\s+root` | high |
| persistence | `crontab`, `launchctl`, `schtasks`, `reg\s+add`, `systemctl enable` | high |
| recon | `\bwhoami\b`, `\bprintenv\b`, `\benv\b`, `ifconfig`, `ipconfig`, `net\s+user` | medium |
| sensitive_file_read | paths: `~/.ssh/`, `id_rsa`, `id_ed25519`, `.env`, `/etc/passwd`, `/etc/shadow`, `.aws/credentials`, `.kube/config`, `.git-credentials`, `.npmrc`, `.docker/config.json`, `Login Data`, `Cookies`, `\config\SAM` | high (critical for keys/shadow/SAM) |
| unverified_tool_call | a dangerous tool call with no human-confirmation marker | medium |
| shell_spawn (process) | AI-connected process spawns `bash/sh/zsh/fish/cmd.exe/powershell.exe/pwsh` | high |
| autonomous_loop | ≥ 6 requests/min with mean gap < 2 s or ≥ 3 consecutive tool-call round trips | medium |

**Autonomy score (0–100)** = 35·rate_factor + 35·tool_loop_factor + 30·dangerous_tool_ratio.

### 8.5 Rule-based remediation (examples — B owns the full table)
- aws_access_key → "Deactivate key in IAM now", "Rotate & move to AWS Secrets Manager", "Add pre-commit secret scanning".
- aadhaar / pan → "Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system".
- shell_exec → "Run agent in sandbox/container", "Require human approval for shell tools", "Restrict tool allowlist".

## 9. RISK SCORING (A implements; C & D display/explain)

- Severity weights: critical 60, high 40, medium 20, low 8, info 2.
- **Event risk** = clamp(provider_base + max_finding_weight + 5·(n_findings−1) + agent_bonus, 0, 100)
  provider_base: unsanctioned cloud/saas 25, unsanctioned ai_coding 20, unknown 15, local_llm 5, sanctioned 0.
- **Org risk score** (higher = worse) = 0.40·Leak + 0.25·Shadow + 0.25·Agent + 0.10·Volume
  (each 0–100, open findings only, exponential time-decay half-life 6 h).
  Grade: A 0–20 · B 21–40 · C 41–60 · D 61–80 · F 81–100.
- **Compliance scores** (higher = better) = 100 − weighted sum of open findings mapped to that framework:
  DPDP ← pii/aadhaar/pan/phone; GDPR ← all pii; PCI-DSS ← credit_card; SOC2 ← secrets, shadow_ai, agent;
  ISO27001 ← everything (lower weight).

## 10. DESIGN SYSTEM (C & D must both follow — consistent look)

**Mood:** futuristic security command center · dark-first · Awwwards-grade motion · "obsidian + signal".

```css
--bg: #05060A;            --bg-2: #0A0D16;         --surface: rgba(17,22,39,0.72);
--surface-solid: #111627; --border: rgba(148,163,255,0.10); --border-strong: rgba(148,163,255,0.22);
--text: #E8ECF5;          --muted: #8A93A8;        --faint: #4B5368;
--primary: #22D3EE;  /* cyan signal */           --primary-2: #0EA5E9;
--accent: #8B5CF6;   /* violet */                --accent-2: #EC4899;
--critical: #FF3B5C; --high: #FF8A3D; --medium: #FACC15; --low: #34D399; --info: #60A5FA;
--glow-primary: 0 0 24px rgba(34,211,238,.35);   --glow-critical: 0 0 28px rgba(255,59,92,.45);
--radius-sm: 8px; --radius: 14px; --radius-lg: 22px;
```
- Fonts (Google Fonts): **Space Grotesk** (display/headings), **Inter** (body), **JetBrains Mono** (code, IDs, numbers).
- Surfaces: glass panels (`backdrop-blur-xl`, 1px gradient border), subtle noise overlay, dotted/grid backgrounds, radial glows.
- Motion (Motion for React, `import { motion } from "motion/react"`):
  ease `[0.22, 1, 0.36, 1]`; durations 0.18 (micro) / 0.4 (ui) / 0.8 (hero); stagger 0.05–0.08;
  springs `{type:"spring", stiffness: 260, damping: 26}`. Page transitions: fade + 12px y + blur(6px)→0.
- Must respect `prefers-reduced-motion` (disable parallax/3D, keep fades).
- 3D (Three.js via @react-three/fiber + drei): lazy-load with `React.lazy`, `dpr={[1, 1.5]}`, pause when off-screen,
  **static gradient fallback** on mobile < 768px or low-power / no WebGL.
- Breakpoints: 375 · 640 · 768 · 1024 · 1280 · 1536. Dashboard: sidebar ≥ 1024px, bottom tab bar < 768px.
- Icons: `lucide-react`. Charts: `recharts`. Toasts: `sonner`. Command palette: `cmdk`. Smooth scroll: `lenis` (landing only).
- Accessibility: focus rings (`--primary`), contrast ≥ 4.5:1 for text, all icons with aria-labels.
- Number style: tabular-nums, JetBrains Mono for metrics; count-up animation on mount.
- Severity is always shown with color **+ icon + text** (never color alone).

## 11. TECH STACK (all free / OSS)

- **Backend (A):** Python 3.11+, FastAPI, uvicorn[standard], pydantic v2, psutil, scapy, PyYAML, httpx,
  python-multipart, sqlite3 (stdlib). Optional: `dpkt` if scapy parsing is slow.
- **Detector (B):** pure Python 3.11+ (stdlib `re`, `math`, `hashlib`, `base64`, `json`), httpx for LLM calls, pytest.
- **Extension (B):** Manifest V3, vanilla JS/TS (no framework needed), works in Chrome + Edge.
- **Web (C, D):** React 19 + Vite + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), `motion`,
  `three`, `@react-three/fiber`, `@react-three/drei`, `react-router-dom`, `@tanstack/react-query`, `zustand`,
  `recharts`, `lucide-react`, `sonner`, `cmdk`, `lenis`, `react-dropzone`, `clsx`, `tailwind-merge`,
  `react-force-graph-3d` (graph page), `date-fns`.
- **LLM triage engines (free):** Featherless (if hackathon credits) → Groq free tier → Ollama local → rules.
  OpenAI-compatible base URLs: Featherless `https://api.featherless.ai/v1`, Groq `https://api.groq.com/openai/v1`,
  Ollama `http://localhost:11434/v1`.
- **Deploy (free):** Vercel/Netlify for `web/` in DEMO MODE (mock data + client-side scanner);
  local full mode for the video.

## 12. DEMO MODE (deployed site must work with NO backend)

`web/src/shared/api.ts` checks `VITE_DEMO_MODE === "true"` **or** backend `/health` unreachable (1.5 s timeout)
→ serves data from `contracts/mock/*.json` (copied into `web/src/shared/mock/`) and a fake WebSocket stream
(`web/src/shared/mock/stream.ts`) that emits a realistic event every 1–3 s and a finding every ~6 s.
A small pill in the top bar shows `LIVE ENGINE` (green) or `DEMO DATA` (amber).

## 13. TIMELINE (16 h · H = hours from start)

| Window | Vishwak (A, Mac) | Aaraadhyaa (B, Mac) | Kevin (C, Windows) | Pritika (D, Windows) |
|---|---|---|---|---|
| H0:00–0:25 | **Bootstrap (MASTER_PROMPT)** → push `main` | clone prep, venv, read specs | read specs, Antigravity ready | read specs, Antigravity ready |
| H0:25–4:00 | Phase 1 | Phase 1 | Phase 1 | Phase 1 |
| H4:00–8:00 | Phase 2 | Phase 2 | Phase 2 | Phase 2 |
| **H8:00** | **Integration checkpoint #1** — PRs → main, everyone merges main back |
| H8:15–12:00 | Phase 3 | Phase 3 | Phase 3 | Phase 3 |
| **H12:00** | **Integration checkpoint #2** |
| H12:15–14:15 | Phase 4 | Phase 4 | Phase 4 | Phase 4 |
| **H14:15** | **Final merge** → full-stack run on Vishwak's Mac |
| H14:15–15:15 | full-stack bug bash + video prep | demo-sequence rehearsal, extension test in Chrome + Edge | mobile + Edge QA | README + video script + Vercel deploy (her account owns the repo) |
| H15:15–16:00 | **record video (< 3 min)**, final push | | | final merge to fork `main`, Vercel deploy check, **submission PR → upstream** |

## 14. GIT WORKFLOW

- **Team repo (origin):** https://github.com/31Pritika/HFT26-TEAM-10 — Pritika's fork of the official
  **upstream** https://github.com/cbitosc/HFT26-TEAM-10. Pritika's account owns it; Vishwak's, Aaraadhyaa's
  and Kevin's accounts are collaborators (Write). **Never push to the upstream.**
- Clone: `git clone https://github.com/31Pritika/HFT26-TEAM-10.git && cd HFT26-TEAM-10` (repo root = `HFT26-TEAM-10/`).
- The organizers' starter `README.md` (team info + submission rules) must be kept and extended, never replaced wholesale.
- Bootstrap commit on `main` → each person: `git checkout -b <branch>` from latest main → `git push -u origin <branch>`.
- Branches: `vishwak/core-engine`, `aaraadhyaa/detection-intel`, `kevin/dashboard`, `pritika/experience`.
- Each laptop commits with its own identity (`git config user.name/user.email` set per repo) and pushes with its own GitHub login.
- Checkpoints: each person opens a PR `<branch> → main` **inside the fork** (base repository = `31Pritika/HFT26-TEAM-10`,
  NOT cbitosc — GitHub defaults PRs on forks to the upstream, so change the base!). Pritika (repo owner) merges,
  Vishwak is backup, using **"Create a merge commit"** (preserves every individual commit for judging). Merge order: B → A → C → D.
- **Final submission:** PR from fork `main` → upstream `cbitosc/HFT26-TEAM-10` `main`, title
  `[SUBMISSION] TEAM-10 - git push n pray - AI Shadow IT & Agentic Data Exfiltration Scanner`, description with:
  Solution Overview & Approach · Architecture & Tech Stack · Local Setup · Demo Video / Live URL · Key Screenshots.
- After each checkpoint everyone runs `git fetch origin && git merge origin/main` on their branch.
- Expected conflicts are ~zero because folders are disjoint. Only `web/package.json`/lockfile can clash:
  only C (Kevin) adds web deps; if D (Pritika) truly needs one, tell Kevin. Resolve lockfile conflicts by taking either side then `npm install`.

## 15. DEFINITION OF DONE (judge-facing)
- [ ] One command start on Mac (`./scripts/start.sh`) and Windows (`scripts\start.ps1`).
- [ ] Live detection of real Ollama traffic + simulator scenarios visible in dashboard within 2 s.
- [ ] Upload HAR/PCAP → events + findings appear.
- [ ] Playground detects all §8 types client-side, deployed demo works offline from backend.
- [ ] LLM triage returns structured remediation, shows "redacted input" proof.
- [ ] Agents page shows rogue agent with shell/file actions and permission matrix.
- [ ] Compliance report prints cleanly to PDF.
- [ ] Lighthouse (desktop) Performance ≥ 85, Accessibility ≥ 90; no horizontal scroll at 375px; works in Edge.
- [ ] README with architecture diagram, setup for Mac + Windows, screenshots, demo link/video (organizers' team-info section kept).
- [ ] Submission PR opened from `31Pritika/HFT26-TEAM-10:main` → `cbitosc/HFT26-TEAM-10:main` with the required title + checklist, before code freeze.
