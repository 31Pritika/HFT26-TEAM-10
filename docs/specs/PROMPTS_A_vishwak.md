# PROMPTS — Part A · Core Engine · Vishwak's Mac · Claude Code

**Repo:** https://github.com/31Pritika/HFT26-TEAM-10 (team fork — never push to upstream `cbitosc/HFT26-TEAM-10`)

### One-time branch setup on this laptop (Mac)
Your branch is created at the end of the bootstrap (MASTER_PROMPT step 10). If it isn't:
```bash
git clone https://github.com/31Pritika/HFT26-TEAM-10.git     # skip if already cloned
cd HFT26-TEAM-10
git checkout main && git pull origin main
git config user.name  "Vishwak Boddukuri"
git config user.email "<email of your GitHub account>"
git checkout -b vishwak/core-engine
git push -u origin vishwak/core-engine
```
Every phase ends with `git push origin vishwak/core-engine`. PRs go to **`31Pritika/HFT26-TEAM-10` main** — on GitHub's
"Open pull request" page change the *base repository* away from `cbitosc/...`.

Branch `vishwak/core-engine`. Start each phase in a **fresh session** (`/clear`) from the repo root.
Use Sonnet for most work; switch to Opus (`/model`) only for tricky parts (TCP reassembly, risk engine).
Phase 0 is `MASTER_PROMPT.md` (run it first, on `main`).

---

## Phase 1 — API, pipeline, storage, ingest (H0:25 → H4:00)
```
You are building Part A (Core Engine) of ShadowScope in a 16-hour hackathon. Read, in order:
docs/specs/00_MASTER_SPEC.md, docs/specs/01_SPEC_A_core_engine_vishwak.md, docs/progress/vishwak.md,
contracts/API.md. Obey master §3.1 golden rules: you may ONLY edit backend/, scripts/,
docs/backend.md, docs/progress/vishwak.md. Work on branch vishwak/core-engine.

Phase 1 goal: a complete, runnable FastAPI backend on :8787 serving every endpoint in master §5 from a real
SQLite database, fed by the pipeline in spec A2, with ingest working. Do in this order, committing after each
step with conventional commits (feat(core): ...):
1. app/config.py, app/models.py (pydantic v2, keys identical to master §6), app/db.py (sqlite3 WAL, schema,
   repository helpers, pruning), app/bus.py (async pub/sub).
2. fingerprints/providers.yaml (master §7 complete) + matcher.py (host incl. wildcard, ip via cache, port,
   path signatures, confidence) + unit tests.
3. engine/detect_adapter.py: try `import shadowscope_detect`; otherwise built-in fallback (spec A9). Log active
   detector in /health.
4. engine/risk.py (master §9 event + org score, decay, grade) and a first version of engine/compliance.py
   (framework scores) and engine/agents.py (AgentSession upsert from findings/actions, autonomy score).
5. pipeline.py exactly as spec A2 (redaction, self-exclusion header, dedupe, shadow_ai/policy findings,
   publish to bus).
6. API routes for every endpoint (events, findings + PATCH, triage via adapter, inventory, agents, graph,
   providers, policies GET/PUT, scan, extension/event, report, report/export, overview with window param,
   scenarios list) and WebSocket /api/ws/stream with stats every 3 s + heartbeat.
7. ingest/: har.py, jsonl.py, textlog.py, pcap.py (scapy; plaintext HTTP payloads + TLS SNI) + router; POST /ingest.
8. app/seed.py: ~48 h of realistic history (≈1,500 events, ≈120 findings, 6 agent sessions, 12 inventory
   items) generated THROUGH the pipeline so all derived data is consistent. Run seed on startup if DB empty.
9. tests/: API shape tests comparing responses' keys/types against contracts/mock/*.json; ingest tests.
Run the server, curl every endpoint, open a WebSocket test (python websockets or `wscat` via npx) and fix
until green. Update docs/progress/vishwak.md (Done/Next/Issues). Push: git push origin vishwak/core-engine.
Finish with a summary table: endpoint → status.
```

## Phase 2 — Live collectors, simulator hooks, gateway (H4:00 → H8:00)
```
Continue Part A of ShadowScope. Re-read docs/specs/00_MASTER_SPEC.md §2.1, §5, §7, §8.4 and
docs/specs/01_SPEC_A_core_engine_vishwak.md §A3, §A5, §A6, plus docs/progress/vishwak.md. Same ownership rules —
note that simulator/ belongs to Part B (Aaraadhyaa); you integrate with it only via HTTP/subprocess (spec §A6).

Phase 2 goal: real passive monitoring on this Mac + the hooks the demo simulator needs + the gateway.
1. collectors/base.py: Collector ABC with start/stop/status and graceful degradation (never crash the app;
   report reason in /health and as {type:"collector"} stream messages). Start all in FastAPI lifespan.
2. ip_cache.py (resolve every provider host every 5 min), process_conn.py (psutil every 2 s; on macOS
   AccessDenied fall back to parsing `lsof -i -n -P`; map to provider via matcher + ip_cache; emit observations
   for new/active AI connections with process info), dns_sni.py (scapy DNS qname + TLS ClientHello SNI;
   disabled with reason if no permission), loopback.py (scapy on lo0/lo for local-LLM ports + 8788; per-stream
   HTTP reassembly incl. Content-Length and chunked; request+response pairing; feed full plaintext to pipeline),
   agent_watch.py (process tree shells + sensitive open_files for recently AI-active processes).
3. POST /api/observations (single or list, localhost-only) → pipeline. GET /api/scenarios and POST /api/simulate
   via `python -m simulator.run` subprocess exactly as spec §A6, with the built-in fallback (canned observations
   per scenario id, scenario list from contracts/mock/scenarios.json) while simulator/ doesn't exist yet.
4. gateway/tap.py on :8789 (spec §A5): http://localhost:8789/{provider_id}/... → real provider over HTTPS with
   streaming pass-through, observes request + response; `block_on_critical` policy flag returns 403 JSON.
   Start it from the FastAPI lifespan (or as a second uvicorn app) — must not block the main API.
5. Test with sudo AND without sudo: `sudo .venv/bin/uvicorn app.main:app --port 8787` vs normal. Send a real
   Ollama request (curl localhost:11434/api/generate with a fake email + "AKIAFAKEFAKEFAKE1234") and confirm it
   appears as an event with payload_visible=true and findings. POST a few observations with curl and confirm the
   WebSocket streams them.
Commit per collector. Update progress log. Push. Summarize which collectors run with/without sudo.
```

## Phase 3 — Risk, compliance, triage wiring, simulator end-to-end (H8:15 → H12:00)
```
Continue Part A of ShadowScope. Integration checkpoint #1 just happened: first run
`git fetch origin && git merge origin/main` (Part B's real detector is now in detector/, maybe simulator/ too) and
`pip install -e detector`. Re-read master §9 and spec A5, A7, A8, and docs/progress/vishwak.md and
docs/progress/aaraadhyaa.md (check "Requests to other parts").

Phase 3 goals:
1. Switch detect_adapter to the real shadowscope_detect; run full test suite; fix any key mismatches on YOUR
   side (or note requests for Part B in your progress log).
2. engine/risk.py final: decay, components (Leak/Shadow/Agent/Volume), grade, risk_trend from metrics_minute.
3. engine/compliance.py: framework controls (≥5 controls per framework with pass/warn/fail + evidence text),
   recommendations P0/P1/P2 generated from open findings; /report and /report/export (json/csv) complete.
4. engine/anomaly.py: per-process bytes_out rolling mean/std z-score > 3 → exfil_volume finding; burst
   detection → autonomous_loop support data.
5. If simulator/ exists after the merge: run `python -m simulator.run --list --json` and each scenario through
   /api/simulate; confirm expected findings (spec 02 §B6 table) appear. Anything wrong on the simulator side →
   write it under "Requests to other parts" in your progress log for Aaraadhyaa; fix backend-side issues.
6. Triage: /findings/{id}/triage calls real triage with engine_cfg from Policy + env; store result; 20 s timeout.
   Verify self-exclusion: triage calls never create events.
7. Policies take effect immediately: sanctioning a process re-scores its open shadow_ai findings; canary tokens
   pushed into scan policy; blocked providers create policy findings.
8. Performance check: 200 observations/s for 30 s without falling behind; WS latency < 300 ms.
Commit, update progress log, push, summarize.
```

## Phase 4 — Scripts, end-to-end, hardening (H12:15 → H14:15)
```
Continue Part A of ShadowScope. First: `git fetch origin && git merge origin/main` (dashboard and experience
are now in web/). Read docs/progress/*.md for any requests addressed to Part A and handle them.

Phase 4 goals:
1. scripts/start.sh (macOS/Linux): create venv, pip install backend + -e detector, optional `--sudo` flag for
   full collectors, `--host` flag to bind 0.0.0.0 (so Kevin's Windows laptop can use this backend over Wi-Fi),
   start backend, start mock provider (`python -m simulator.mock_provider` if present), `npm install && npm run dev`
   in web/, print URLs. scripts/start.ps1 equivalent for Windows (no sudo; explain Npcap optional) — Kevin and
   Pritika will run it on Windows, so test its logic carefully. scripts/demo.sh / demo.ps1 call
   `python -m simulator.demo_sequence`.
2. Run the full stack (backend + web in live mode). Click through every dashboard page against the real
   API; any response-shape mismatch must be fixed on the backend side to match master §6.
3. Hardening: input size limits, consistent error JSON, CORS for the deployed frontend origin (env var
   SHADOWSCOPE_CORS_ORIGINS), `SHADOWSCOPE_CLOUD=1` mode (no live collectors; seed + ingest + scan + simulate
   with mock provider only) and a Dockerfile/render.yaml for optional free deploy.
4. docs/backend.md: architecture, collectors + privilege matrix (mac/win/linux, sudo/no sudo), gateway usage
   (OPENAI_BASE_URL example), API table, how to add a provider fingerprint.
5. pytest all green. Final commit + push. Then open a PR vishwak/core-engine → main.
```

---

## Integration prompt (use right after any `git merge origin/main`)
```
I just merged origin/main into vishwak/core-engine. Run backend tests, start the server, and verify every
endpoint still matches contracts/API.md. Read docs/progress/*.md "Requests to other parts" for items
addressed to Part A and do them. Fix only files I own. Commit "chore(core): integrate main" and push.
```

## Rescue prompts
- **Lost context:** `Re-read docs/specs/00_MASTER_SPEC.md, docs/specs/01_SPEC_A_core_engine_vishwak.md and docs/progress/vishwak.md, run git log --oneline -20, then tell me exactly where we are and continue the current phase.`
- **Stuck on permissions (scapy/psutil):** `Make this collector degrade gracefully instead of failing, report the reason in /health, and make sure the simulator fallback path still produces events. Move on.`
- **Running out of time:** `List remaining tasks in this phase ranked by demo impact; implement only the top 3 and stub the rest with clear TODOs.`
