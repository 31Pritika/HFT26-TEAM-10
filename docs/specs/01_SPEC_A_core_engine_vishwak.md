# 01 — PART A SPEC · Core Engine
**Owner:** Vishwak's Mac · **Tool:** Claude Code · **Branch:** `vishwak/core-engine`
**Owns:** `backend/`, `scripts/`, `docs/backend.md`, `docs/progress/vishwak.md`  (`simulator/` is Part B's)
**Read first:** `docs/specs/00_MASTER_SPEC.md` (contracts §5–§9 are binding).

You are the heart of ShadowScope: collectors, ingestion, event pipeline, storage, risk/compliance engine,
REST + WebSocket API, and the opt-in gateway. Part B (Aaraadhyaa) builds the detector package and the attack
simulator; you depend on them **only through an adapter with a built-in fallback and an HTTP/subprocess
contract (§A6, §A9)**, so you are never blocked.

---

## A1. Folder layout

```
backend/
├── requirements.txt
├── CLAUDE.md                     # short rules for Claude Code sessions in this folder
├── app/
│   ├── main.py                   # FastAPI app, CORS, lifespan (start/stop collectors)
│   ├── config.py                 # env + defaults (ports, db path, demo flags)
│   ├── models.py                 # pydantic models mirroring master §6 exactly
│   ├── db.py                     # sqlite3 (WAL), schema, repository functions
│   ├── bus.py                    # in-process async pub/sub → WebSocket fan-out
│   ├── pipeline.py               # raw observation → AIEvent → findings → risk → store → publish
│   ├── fingerprints/
│   │   ├── providers.yaml        # master §7 table
│   │   └── matcher.py            # host/ip/port/path → Provider (+confidence)
│   ├── collectors/
│   │   ├── base.py               # Collector ABC: start/stop/status, graceful degrade
│   │   ├── process_conn.py       # psutil (+ lsof fallback on macOS) socket→process map
│   │   ├── ip_cache.py           # resolve provider hostnames every 5 min → IP→provider
│   │   ├── dns_sni.py            # scapy: DNS queries + TLS ClientHello SNI
│   │   ├── loopback.py           # scapy on lo0/lo: plaintext HTTP to local LLM ports + mock provider
│   │   └── agent_watch.py        # process tree: AI process → shell children / sensitive open files
│   ├── ingest/
│   │   ├── har.py  pcap.py  jsonl.py  textlog.py
│   │   └── router.py             # sniff file type → parser → pipeline
│   ├── engine/
│   │   ├── detect_adapter.py     # import shadowscope_detect; fallback mini-detector if missing
│   │   ├── risk.py               # event risk, org risk, grade, decay (master §9)
│   │   ├── compliance.py         # framework scores + controls + report builder
│   │   ├── anomaly.py            # bytes_out z-score per process, burst detection
│   │   └── agents.py             # AgentSession aggregation, autonomy score
│   ├── gateway/
│   │   └── tap.py                # opt-in local AI gateway on :8789 (plain HTTP in, TLS out)
│   ├── api/
│   │   ├── routes_*.py           # one file per resource group
│   │   └── ws.py                 # /api/ws/stream
│   └── seed.py                   # `python -m app.seed` → realistic demo dataset
└── tests/
scripts/
├── start.sh                      # mac/linux: venv, install, run backend (sudo optional) + web
├── start.ps1                     # windows equivalent
└── demo.sh / demo.ps1            # calls `python -m simulator.demo_sequence` (Part B) for the video
```

## A2. Pipeline (core concept)

```
Observation (from any collector / ingest / gateway / extension)
  { source, ts, process?, dest{host,ip,port,path,protocol}, method?, headers?, body_text?, response_text?, bytes_out, bytes_in }
        │
        ▼  fingerprints.match()  → provider (+ sanctioned? from Policy)
        ▼  skip if not AI-related (unless body has findings from /scan or extension)
        ▼  self-exclusion: drop ShadowScope's own LLM triage calls (marker header X-ShadowScope-Self: 1)
        ▼  detect_adapter.scan_text(body_text) + analyze_agent_payload(body/response)
        ▼  redact → payload_preview (≤500 chars)   ← NEVER store raw secrets
        ▼  risk.event_score()
        ▼  db.insert(event, findings)  → agents.update() → anomaly.update()
        ▼  bus.publish({type:"event"}), bus.publish({type:"finding"}) ...
```
- Dedupe findings by `evidence.fingerprint` + subtype within 10 minutes (increment a counter instead).
- Shadow-AI finding: first time an **unsanctioned** process talks to a provider → `type: "shadow_ai"`,
  subtype `new_unsanctioned_tool`, severity high (cloud) / medium (local).
- Blocked provider seen → `type: "policy"`, subtype `blocked_provider_contacted`, critical.

## A3. Collectors — must degrade gracefully
Every collector reports `{enabled, running, reason}` in `/health` and `collector` stream messages.
- **process_conn**: poll every 2 s. macOS needs root for other users' sockets → if `AccessDenied`, fall back to
  `lsof -i -n -P` parsing; if that fails too, mark degraded with reason. Bytes per connection: use
  `psutil.Process.io_counters()` deltas where available (approximate is fine; label it).
- **ip_cache**: `socket.getaddrinfo` for every provider host (no wildcards) every 5 min; map IP → provider id.
  Mark matches through shared CDN IPs with confidence 0.6.
- **dns_sni**: scapy sniff `udp port 53 or tcp port 443`; parse DNS qname and TLS SNI (`load_layer("tls")`).
  Needs sudo on macOS / Npcap on Windows → disabled with reason otherwise.
- **loopback**: scapy on `lo0` (macOS) / `lo` (linux); filter `tcp port 11434 or 1234 or 8080 or 8000 or 5000 or 7860 or 1337 or 4891 or 8788`.
  Reassemble HTTP requests/responses per TCP stream (simple buffer by 4-tuple, parse `Content-Length`/chunked).
  If sniffing unavailable: the **gateway** + simulator fallback still provide payloads.
- **agent_watch**: every 2 s, for each process seen talking to an AI provider in the last 10 min: list
  `children(recursive=True)`; shell names → `shell_spawn` finding; `open_files()` matched against sensitive
  paths (master §8.4) → `sensitive_file_read`. Record into AgentSession.actions.

## A4. Ingestion
- **HAR** (Chrome/Edge DevTools "Save all as HAR with content"): for each entry → observation with
  `request.postData.text`, response content text, url → host/path, `serverIPAddress`. Source `har`.
- **PCAP/PCAPNG** (scapy `rdpcap`/`PcapReader`): HTTP on plaintext ports → full payload; TCP/443 → SNI only.
- **JSONL / JSON log**: each line `{ts?, process?, method, url, headers?, body}` (be lenient with key names:
  `request_body`, `prompt`, `messages`, `input`).
- **.log / .txt**: scan whole text as one observation (source `log`, provider unknown).
- Limit 25 MB; return `IngestResult` with warnings (e.g. "443 traffic: hostnames only, payload encrypted").

## A5. Opt-in Local AI Gateway ("Tap") — :8789
Reverse proxy: `http://localhost:8789/{provider_id}/...` → forwards to the real provider over HTTPS (httpx, streaming
supported), observing request + response. E.g. set `OPENAI_BASE_URL=http://localhost:8789/openai/v1`.
Optional `block_on_critical` policy flag: return 403 JSON `{error:"blocked by ShadowScope: <finding title>"}`
instead of forwarding — **great demo moment** ("we stopped the leak before it left").

## A6. Simulator integration (Part B — Aaraadhyaa — builds `simulator/`; you only call it)
- `POST /api/observations` — accepts a master §6 `Observation` (or a list) and runs it through the pipeline.
  Used by the simulator's guaranteed fallback path and by tests. Localhost-only (reject non-loopback clients
  unless `SHADOWSCOPE_ALLOW_REMOTE=1`).
- `GET /api/scenarios` → run `python -m simulator.run --list --json` (subprocess, cached 60 s); if the simulator
  isn't there yet, serve `contracts/mock/scenarios.json`.
- `POST /api/simulate {scenario_id, intensity}` → spawn `python -m simulator.run <id> --intensity N` as a
  background subprocess (from repo root, same venv), return `{run_id, started:true}`; if the simulator is missing,
  run a tiny built-in fallback that posts 2–3 canned observations for that scenario id so the UI still reacts.
- Mock provider (:8788) and real Ollama (:11434) traffic produced by the simulator is captured by your loopback
  collector. `scripts/start.sh` starts the mock provider (`python -m simulator.mock_provider`) if present.

## A7. Storage
SQLite `backend/data/shadowscope.db` (git-ignored), WAL mode. Tables: `events`, `findings`, `agents`,
`agent_actions`, `inventory`, `policies` (single row JSON), `metrics_minute` (for timeline/trend).
Indexes on ts, severity, provider_id, process_name. Keep last 50k events (prune job).
`python -m app.seed` produces ~48 h of history (≈1,500 events, ≈120 findings, 6 agents) so the dashboard
looks alive from minute one. `/api/admin/reset` (dev only) clears and re-seeds.

## A8. API implementation notes
- Implement every endpoint in master §5 with exact shapes. Validate against `contracts/mock/*.json` in tests
  (same keys, same types).
- WebSocket: `bus` keeps an `asyncio.Queue` per client; publish `stats` every 3 s; heartbeat ping 20 s.
- `/findings/{id}/triage` → `detect_adapter.triage(finding, context, engine_cfg)` (Part B); timeout 20 s;
  cache result in the finding row. Fallback adapter returns a rules-based TriageResult.
- `/report` → `compliance.build_report(window)`; `/report/export?format=csv` streams findings CSV.
- `/scan` and `/extension/event` go through the same pipeline (extension events become AIEvents with
  source `extension`, provider from site domain).

## A9. detect_adapter contract (Part B implements; you call)
```python
from shadowscope_detect import scan_text, analyze_agent_payload, classify_process, triage, redact
scan_text(text: str, *, context: dict | None = None, policy: dict | None = None) -> dict
  # {"findings":[DetFinding], "redacted_text": str, "risk_score": int, "stats": {...}}
  # DetFinding = Finding keys minus id/ts/event_id/status/triage/provider_id/process_name
analyze_agent_payload(payload: dict | str, *, direction: "request"|"response") -> dict
  # {"is_agent": bool, "framework": str, "tools_declared": [str], "actions": [AgentAction-like], "findings": [DetFinding]}
classify_process(name: str, cmdline: list[str] | None) -> dict
  # {"is_ai_tool": bool, "framework": str|None, "category": ProviderCategory|None, "confidence": float}
async triage(finding: dict, context_snippet: str, *, engine_cfg: dict) -> dict  # TriageResult
redact(text: str) -> str
```
Fallback (when import fails): small regex set (AWS, OpenAI, JWT, email, private key) + rules triage,
so the backend is always runnable. Log which detector is active in `/health`.

## A10. Performance & quality bars
- Pipeline latency observation → WS publish < 300 ms for a 50 KB payload.
- Backend starts with zero privileges (degraded collectors) and with sudo (all collectors).
- `pytest` for matcher, risk, ingest parsers, API shapes. Type hints everywhere.
- `docs/backend.md`: how collectors work, privilege matrix (mac/win/linux), gateway usage, API table.

## A11. Phase plan (prompts in `PROMPTS_A_vishwak.md`)
- **P0 (H0–0:25):** Bootstrap repo (MASTER_PROMPT).
- **P1 (→H4):** app skeleton, models, db, seed, fingerprints+matcher, detect_adapter w/ fallback, pipeline,
  all REST endpoints on DB data, WebSocket, ingest (HAR/JSONL/log/PCAP).
- **P2 (→H8):** collectors (process_conn, ip_cache, dns_sni, loopback, agent_watch), `/observations`,
  `/scenarios` + `/simulate` subprocess launcher with fallback, gateway tap + block mode.
- **P3 (→H12):** risk/compliance/report, anomaly, agent aggregation polish, policies effects, end-to-end with
  Part B's simulator, triage wiring with B's real package (after checkpoint #1 merge), dedupe.
- **P4 (→H14:15):** start scripts (mac + win), demo script, end-to-end test with real web app, hardening,
  docs/backend.md, deployable "cloud mode" (`SHADOWSCOPE_CLOUD=1` disables live collectors) for optional Render deploy.
