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

## Next
Phase 2: collectors (process_conn, ip_cache, dns_sni, loopback, agent_watch), gateway tap and block mode, real simulator wiring.

## Issues
- **Collectors are not running yet.** `/health` and Overview report all five as stopped, with the reason. No live traffic is captured.
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

**Part C (Kevin)**
- While the backend is partial, a laptop running it alongside the web app sees the engine as live, so set `VITE_DEMO_MODE=true` in the root `.env` if you see errors. All §5 endpoints exist on this branch now, so this stops mattering after the checkpoint merge.
- `/health` has an extra `detector` key. `next_cursor` is an opaque string.
- `/report/export` also accepts `?window=`.
- Events from a simulator run carry a `run:<run_id>` tag, for the filtered mini-feed.
- WebSocket keep-alive uses protocol-level pings, so no `ping` message type reaches `ws.ts`. Foreign origins are refused, so a deployed frontend needs `SHADOWSCOPE_FRONTEND_ORIGIN` set on the engine.

**Team (contracts are frozen, flagging only)**
- `contracts/mock/findings.json` tags `source_code`, `canary`, `policy` and `exfil_volume` findings with SOC2, which §9 doesn't map. The engine follows §9, so live SOC2 scores won't match the mock's logic.
- `/scan` events use source `log` (or `extension`), because §6 `Source` has no `playground` value.
