# Progress — vishwak

## Done
Phase 1 complete on `vishwak/core-engine`. `pytest` in `backend/`: all green.
- Config, pydantic models (§6), SQLite in WAL mode with keyset pagination and pruning, thread-safe event bus.
- `fingerprints/providers.yaml` (all 30 §7 providers) and matcher: exact and wildcard hosts, IP cache, local ports, path signatures, confidence.
- Detect adapter with built-in fallback. All detector output is re-checked before storage (see Issues).
- Risk (§9 event and org score, decay, grades), compliance scores and report, agent sessions and autonomy score.
- Pipeline per spec A2: redaction, self-exclusion, 10-minute dedupe, shadow_ai and policy findings, bus publish.
- Every §5 endpoint on real data, plus `/api/ws/stream` and dev-only `POST /api/admin/reset`.
- Ingest: HAR, JSON, JSONL, text logs, PCAP/PCAPNG (TCP reassembly, chunked HTTP, TLS SNI).
- Seed through the pipeline on an empty DB: 1,500 events, 120 findings, 6 agents, 12 inventory items, about 0.2 s.

Run: `cd backend && .venv/bin/uvicorn app.main:app --port 8787`. Re-seed: `.venv/bin/python -m app.seed`.

Phase 2 complete on `vishwak/core-engine`, except the with-sudo check (see Issues).
- Collector framework: each runs on its own thread, and failures or missing permissions become a `reason` in `/health` and `collector` stream messages. All start in the FastAPI lifespan. `SHADOWSCOPE_COLLECTORS=0` turns them off.
- `ip_cache`, `process_conn` (psutil, then `lsof` fallback), `dns_sni`, `loopback` (live HTTP reassembly and request/response pairing), `agent_watch`.
- Gateway on 127.0.0.1:8789 (spec §A5): streaming pass-through, one event per request, `block_on_critical` returns 403. It shows in `/health` as a sixth collector.
- `/observations`, `/scenarios` and `/simulate` checked against §A6, with tests for the subprocess path.

| Collector | Without sudo | With sudo |
|---|---|---|
| ip_cache | Runs (verified) | Should run the same (run the script to confirm) |
| process_conn | Runs via lsof, this user's processes only (verified) | psutil, all processes (run the script to confirm) |
| agent_watch | Runs, this user's processes only (verified) | All processes (run the script to confirm) |
| gateway | Runs (verified with a local fake upstream) | Should run the same (run the script to confirm) |
| dns_sni | Disabled, with reason (verified) | Run the script to confirm |
| loopback | Disabled, with reason (verified) | Run the script to confirm |

Check capture with `sudo scripts/verify_capture.sh`. Results go to `backend/data/verify_capture.txt`.

## Next
- Run `sudo scripts/verify_capture.sh` and review the output.
- Phase 3: risk, compliance and report polish, anomaly detection, end-to-end with Part B's simulator and real detector.

## Issues
- **Live capture under sudo is not verified yet.** It needs a password, so `dns_sni` and `loopback` have never run against real packets. `loopback` parsing was checked with real Ollama bytes recorded through a local relay, and the DB ownership fix for sudo has unit tests only.
- **The gateway has never forwarded to a real provider.** Tests and the live check use a local stand-in, so fake secrets never leave this machine. `SHADOWSCOPE_GATEWAY_UPSTREAM` is test-only and ignored unless it points at this machine.
- **`loopback` reports a request only when its response finishes**, so a slow model delays the event by the generation time.
- **Sniffing limits:** HTTP/3 (QUIC) and Encrypted ClientHello traffic hide the hostname. `open_files()` misses short reads. macOS has no per-process byte counters, so `live_conn` events show 0 bytes and carry the tag `bytes-unavailable`.
- **Shared CDN IPs can give false matches.** `process_conn` matches them at confidence 0.6, which is still reported.
- **`shell_spawn` fires on normal use of Cursor and Claude Code**, as §A3 specifies. It was seen on this machine. Repeats are limited by the 10-minute dedupe.
- **The seed scripts its detection step** (`app/seed_catalog.py`) because the detector stub only finds AWS keys and emails. Risk, dedupe, inventory and agents are computed by the real pipeline. Revisit once Part B's detector is merged.
- **`/simulate` uses canned observations** until `simulator/run.py` exists, then switches to the CLI automatically. `/scenarios` serves the contract mock until then.
- **Exfil findings are seed/canned only.** `engine/anomaly.py` is Phase 3.
- **§9 gives no scale for the org score components.** The saturation constants in `engine/risk.py` and the factors in `engine/compliance.py` are tuned by hand against the seed.
- **The API has no authentication**, so keep the default `127.0.0.1` bind. Using `--host 0.0.0.0` for Wi-Fi testing exposes it to the network. `/observations` and `/admin/reset` stay loopback-only. A web page could also POST a file to `/ingest` or `/extension/event` on a machine running the engine, because CORS does not stop those requests from being sent.
- **macOS can flag the editable-install `.pth` file as hidden, and Python then skips it silently**, so `import shadowscope_detect` fails even though pip lists it. The adapter falls back to the repo's `detector/` folder. `chflags nohidden` on the file fixes it for other tools.

## Requests to other parts
**Part B (Aaraadhyaa)**
- `scan_text` stub bug: `redacted_snippet` is cut before redaction, so a second secret on the edge of the ±40 char window comes out partly raw. Don't carry this into the real scanner. Slice from `redacted_text`, or widen the window so it never splits a match. The adapter rebuilds snippets from `redacted_text` as a workaround, which needs `evidence.match_redacted` to appear verbatim in `redacted_text`.
- `policy["canary_tokens"]` is passed to `scan_text`. The adapter adds canary findings the detector misses, and skips any whose `evidence.fingerprint` is `sha256(token)[:12]`, so please keep that fingerprint.
- Redaction must cover a private key's body, not only the `-----BEGIN` header.
- `analyze_agent_payload` only ever receives a dict or a str.
- When sniffing is on, simulator traffic to :8788 is seen twice: captured by `loopback` and reported through `/observations`. Findings dedupe, but events don't. Please send a marker header such as `X-ShadowScope-Sim: 1` on those requests so `loopback` can skip them.
- `gateway_block` must only send fake secrets that the detector rates critical. The gateway forwards anything else to the real provider, which would break golden rule 5. An AWS key is enough.

**Part C (Kevin)**
- While the backend is partial, a laptop running it alongside the web app sees the engine as live, so set `VITE_DEMO_MODE=true` in the root `.env` if you see errors. All §5 endpoints exist on this branch now, so this stops mattering after the checkpoint merge.
- `/health` has an extra `detector` key. `next_cursor` is an opaque string.
- `/report/export` also accepts `?window=`.
- Events from a simulator run carry a `run:<run_id>` tag, for the filtered mini-feed.
- WebSocket keep-alive uses protocol-level pings, so no `ping` message type reaches `ws.ts`. Foreign origins are refused, so a deployed frontend needs `SHADOWSCOPE_FRONTEND_ORIGIN` set on the engine.

- `Policy` has a new additive key, `block_on_critical` (default true). Toggle it with `PUT /policies`.
- `/health` and Overview now list six collectors (`gateway` is new). `reason` can be set while `running` is true, which means reduced mode, such as `process_conn` using lsof.
- New event tags: `blocked` (stopped by the gateway) and `bytes-unavailable` (byte counts unknown, don't show 0).

**Team (contracts are frozen, flagging only)**
- `contracts/mock/findings.json` tags `source_code`, `canary`, `policy` and `exfil_volume` findings with SOC2, which §9 doesn't map. The engine follows §9, so live SOC2 scores won't match the mock's logic.
- `block_on_critical` is additive to frozen §6 `Policy`, because spec §A5 asks for it as a policy flag.
- `/scan` events use source `log` (or `extension`), because §6 `Source` has no `playground` value.
