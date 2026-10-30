# ShadowScope backend

The engine watches AI traffic on a machine without breaking TLS, finds leaks and risky agent behaviour, and serves the results over REST and WebSocket. It runs on port 8787. Local data stays in `backend/data/shadowscope.db`.

## Quick start

| Platform | Command |
|---|---|
| macOS / Linux | `scripts/start.sh` |
| macOS / Linux, all collectors | `scripts/start.sh --sudo` |
| Reachable from other laptops | `scripts/start.sh --host` |
| Backend only | `scripts/start.sh --no-web` |
| Windows | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` |
| Windows, reachable from other laptops | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -BindHost 0.0.0.0` |
| Demo sequence (backend must be running) | `scripts/demo.sh` or `scripts\demo.ps1` |

The scripts need Python 3.11+ and Node.js. They create `backend/.venv`, install everything, start the mock provider if `simulator/mock_provider.py` exists, start the web app, and stop it all on Ctrl+C.

To use one laptop's backend from another, start it with `--host`, then on the other laptop run the web app with `VITE_API_BASE=http://<backend-ip>:8787/api`. **The API has no login**, so anyone on that network can reach it. Use this only on a network you trust.

Tests: `cd backend && .venv/bin/python -m pytest`. Load test: `scripts/load_test.py`. Packet capture check: `sudo scripts/verify_capture.sh`.

## Architecture

```
collectors ─┐
gateway ────┤
ingest ─────┼─→ pipeline ─→ SQLite ─→ REST API
extension ──┤      │
/scan ──────┤      └─────→ event bus ─→ WebSocket
/observations ┘
```

Every source produces an `Observation`, and `app/pipeline.py` handles them all the same way:

1. Drop ShadowScope's own LLM calls (header `X-ShadowScope-Self: 1`).
2. Match the destination to a provider (`app/fingerprints/matcher.py`). Most non-AI traffic stops here.
3. Scan the body and analyse agent behaviour through `app/engine/detect_adapter.py`.
4. Add policy and shadow-AI findings, and check for upload anomalies.
5. Redact, score, store, and publish to the stream.

**Raw secrets are never stored.** Only redacted text is written. `detect_adapter.harden` re-checks everything the detector returns, and response bodies are analysed but not kept. Identical findings within 10 minutes are counted, not duplicated.

| Path | Purpose |
|---|---|
| `app/pipeline.py` | The flow above, plus policy changes |
| `app/collectors/` | Live monitoring (below) |
| `app/gateway/tap.py` | Opt-in gateway on port 8789 |
| `app/ingest/` | HAR, PCAP, JSON, JSONL and text uploads |
| `app/engine/` | Detection adapter, risk, compliance, agents, anomaly, overview |
| `app/api/` | Routes, WebSocket, errors, request limits |
| `app/seed.py` | Demo history, generated through the pipeline |

## Collectors

Each runs on its own thread. A collector that fails or lacks permission reports why in `/api/health` and as a `collector` stream message, and the app keeps running.

| Collector | What it gives | How |
|---|---|---|
| `ip_cache` | IP → provider map | Resolves provider hosts every 5 minutes |
| `process_conn` | Which process talks to which provider | `psutil`, or `lsof` when access is denied, every 2 s |
| `dns_sni` | Hostnames being contacted | DNS queries and TLS ClientHello SNI, both plaintext |
| `loopback` | Full payloads to local LLMs | Plain HTTP on the loopback interface |
| `agent_watch` | Shells and sensitive files | Children and open files of recently active AI processes |
| `gateway` | Full payloads, with optional blocking | Apps opt in by changing their base URL |

### Privilege matrix

✅ tested on macOS for this release. ◻️ expected from the code and platform, not yet run.

| Collector | macOS | macOS + sudo | Windows | Windows + Admin + Npcap | Linux | Linux + sudo |
|---|---|---|---|---|---|---|
| `ip_cache` | ✅ runs | ◻️ runs | ◻️ runs | ◻️ runs | ◻️ runs | ◻️ runs |
| `process_conn` | ✅ via `lsof`, own processes | ◻️ all processes | ◻️ runs, some processes may be hidden | ◻️ all processes | ◻️ own processes | ◻️ all processes |
| `agent_watch` | ✅ own processes | ◻️ all processes | ◻️ own processes | ◻️ all processes | ◻️ own processes | ◻️ all processes |
| `gateway` | ✅ runs | ◻️ runs | ◻️ runs | ◻️ runs | ◻️ runs | ◻️ runs |
| `dns_sni` | ✅ off, reason shown | ◻️ runs | ◻️ off, reason shown | ◻️ runs | ◻️ off, reason shown | ◻️ runs |
| `loopback` | ✅ off, reason shown | ◻️ runs | ◻️ off, reason shown | ◻️ runs (Npcap loopback support needed) | ◻️ off, reason shown | ◻️ runs |

Without packet capture, the gateway and uploads still give full payloads.

**Limits:** HTTP/3 and Encrypted ClientHello hide the hostname from `dns_sni`. macOS has no per-process byte counts, so `live_conn` events show 0 bytes with the tag `bytes-unavailable`. `open_files()` misses short reads. Shared CDN IPs can give false matches, at confidence 0.6. `loopback` reports a request once its response finishes, so a slow model delays the event.

## Gateway

The gateway listens on `127.0.0.1:8789` only, because requests through it carry real API keys. Point an app at it, and it forwards over TLS:

```bash
export OPENAI_BASE_URL=http://localhost:8789/openai/v1
export ANTHROPIC_BASE_URL=http://localhost:8789/anthropic
```

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8789/openai/v1")
```

The address is `http://localhost:8789/{provider_id}/{path}`, using a cloud provider id from `app/fingerprints/providers.yaml`. Wildcard-only and local providers return 404.

Streaming passes through unchanged. API keys are forwarded but never stored or logged. Each request becomes one event, recorded when the response ends.

With the policy flag `block_on_critical` (on by default), a request with a critical finding is stopped before it leaves:

```json
{"error": "blocked by ShadowScope: AWS access key"}
```

Forwarding has only been tested against a local stand-in, not a real provider.

## API

Base URL `http://localhost:8787/api`. JSON throughout, timestamps are ISO-8601 UTC. Errors are always `{"error": {"code": "...", "message": "..."}}`. Shapes are in `contracts/API.md`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Status, collectors, detector, LLM engine |
| GET | `/overview` | `?window=1h\|6h\|24h\|7d` |
| GET | `/events` | `?limit&cursor&provider&process&source&min_risk&since` |
| GET | `/events/{id}` | Includes `findings` |
| GET | `/findings` | `?severity&type&status&limit&cursor&q` |
| GET | `/findings/{id}` | Includes `event`, which can be null |
| PATCH | `/findings/{id}` | `{status}` |
| POST | `/findings/{id}/triage` | `{engine?}`. Up to 20 s. A rules answer is retried next time |
| GET | `/inventory` | Tools seen |
| GET | `/agents`, `/agents/{id}` | Agent sessions |
| GET | `/graph` | `?window` |
| GET | `/providers` | Fingerprint list |
| GET, PUT | `/policies` | PUT is partial and applies at once. Cloud mode: PUT disabled |
| POST | `/ingest` | Multipart `file`, up to 25 MB |
| POST | `/scan` | `{text, source?, context?}`, up to 2 M characters |
| POST | `/observations` | One or a list. This machine only |
| GET | `/scenarios` | Simulator list, or the contract mock |
| POST | `/simulate` | `{scenario_id, intensity?}` |
| GET | `/report` | `?window` |
| GET | `/report/export` | `?format=json\|csv&window` |
| POST | `/extension/event` | Browser extension events, with the extension's own findings in an extra `findings` list. They are redacted again on arrival. Cloud mode: disabled |
| POST | `/admin/reset` | Dev only: wipe and re-seed. This machine only |
| WS | `/ws/stream` | Messages `event`, `finding`, `stats`, `agent`, `collector`. Other sites' origins are refused |

## Configuration

Environment variables, or a `.env` file in the repo root.

| Variable | Default | Purpose |
|---|---|---|
| `SHADOWSCOPE_CORS_ORIGINS` | none | Extra allowed origins, comma-separated. Applies to CORS and the WebSocket |
| `SHADOWSCOPE_CLOUD` | off | `1` turns on cloud mode |
| `SHADOWSCOPE_DB` | `backend/data/shadowscope.db` | Database path |
| `SHADOWSCOPE_SEED` | `1` | Seed an empty database on startup |
| `SHADOWSCOPE_COLLECTORS` | `1` | `0` turns off collectors and the gateway |
| `SHADOWSCOPE_ALLOW_REMOTE` | off | `1` lets other machines use `/observations` |
| `SHADOWSCOPE_GATEWAY_PORT` | `8789` | Gateway port |
| `FEATHERLESS_API_KEY`, `FEATHERLESS_MODEL`, `GROQ_API_KEY`, `OLLAMA_URL`, `OLLAMA_MODEL` | none | LLM triage engines. `/health` shows `ollama` only when `OLLAMA_MODEL` (default `llama3.2:3b`) is installed |

For local Ollama triage, set the policy `llm_triage` to engine `ollama` and an installed model. The first call after the model unloads can take over 12 s and fall back to rules, so warm it up first.

### Cloud mode

`SHADOWSCOPE_CLOUD=1` is for a public deployment: seed data, ingest, scan and canned simulate.

- No collectors or gateway, and the simulator CLI is never started.
- `/observations`, `/admin/reset`, `/extension/event` and `PUT /policies` return 403.
- Text sent to `/scan` isn't stored.
- Triage uses rules only, so a public caller can't spend LLM keys.
- Uploads are limited to 5 MB, and each client to 120 requests a minute.

Deploy with `Dockerfile` and `render.yaml`, and set `SHADOWSCOPE_CORS_ORIGINS` to the frontend's origin. The disk is temporary on the free plan, so data resets on each deploy.

## Adding a provider fingerprint

1. Add an entry to `backend/app/fingerprints/providers.yaml`:

   ```yaml
   - id: acme_ai
     name: "Acme AI"
     category: cloud_llm   # cloud_llm, local_llm, ai_saas or ai_coding
     hosts: ["api.acme.ai", "*.acme.ai"]
     ports: [443]
     paths: ["/v1/generate"]
   ```

   A wildcard host matches subdomains only. A `local_llm` entry matches on port instead of host. Avoid ports that ordinary dev servers use: 8000, 8080 and 5000 also need an AI path to match.

2. For a local provider, add its port to `WATCHED_PORTS` in `app/collectors/loopback.py`.
3. Add a case to `tests/test_matcher.py` and update the provider count in `test_providers_yaml_is_complete`.
4. Run `pytest`. `ip_cache` picks up new hosts on its next refresh.

`contracts/mock/providers.json` and master §7 are the team's shared copies, so tell the team when you add one.
