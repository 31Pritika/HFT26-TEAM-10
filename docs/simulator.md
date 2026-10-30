# Attack simulator

The simulator is ShadowScope's demo engine. It generates real localhost traffic for nine leak and rogue-agent scenarios, and
reports each request to the engine. It talks to the engine over HTTP only, and imports none of its code.

## Scenarios

| id | What it does | What the engine shows |
|---|---|---|
| `shadow_saas_sweep` | Real TLS connections to five AI providers: no key, no body | 5 shadow AI findings |
| `env_file_leak` | Sends a `.env` with fake AWS, OpenAI, Stripe and database secrets to the mock provider | 5 critical secrets |
| `customer_pii_dump` | Sends 20 fake Indian customers to Ollama if running, otherwise the mock | `bulk_pii`, Aadhaar, PAN, phone, UPI, email |
| `proprietary_code` | Sends a confidential Python module with a hardcoded JWT to the mock Anthropic API | `proprietary_code`, `jwt` |
| `rogue_agent` | An 8-step machine-speed agent loop that reads SSH keys and pipes a script to a shell | Agent session, autonomy 92, 9+ agent and secret subtypes, `shell_spawn` |
| `canary_trip` | Sends the first policy honeytoken to a provider | Critical canary finding |
| `gateway_block` | Sends the `.env` leak through the Local Gateway | 403 and critical findings |
| `exfil_spike` | Sends 40 rapid 200 KB payloads from one process | `exfil_volume` |
| `local_llm_chat` | A chat with real Ollama if running, otherwise the mock, with an email and internal hostname | Email and internal host |

## How to run

```bash
pip install -r simulator/requirements.txt

python -m simulator.run --list                  # or --list --json
python -m simulator.run rogue_agent             # --intensity 1-3, --dry-run, --run-id X
python -m simulator.demo_sequence               # all nine, 4 s apart: --gap, --intensity, --dry-run
python -m simulator.make_samples                # rebuild samples/
python -m pytest simulator
```

- A run needs nothing started first: it starts the mock provider itself if port 8788 is closed.
- `SHADOWSCOPE_API` overrides `http://localhost:8787/api`. `OLLAMA_URL` overrides `http://localhost:11434`.
- With the engine down, each observation is printed and the run carries on.
- `--dry-run` prints observations, opens no socket and spawns no process.

The engine's `/api/scenarios` and `/api/simulate` call this CLI as a subprocess.

## Sample files

`simulator/samples/` holds files for `POST /api/ingest`, built from what the scenarios really send. Rebuilding gives
byte-identical files.

| File | Contents |
|---|---|
| `demo.har` | 14 requests in Chrome's HAR format |
| `demo.pcap` | HTTP on ports 8788 and 11434, plus five TLS ClientHellos with SNI |
| `agent_session.jsonl` | The rogue agent's 9 requests |
| `leaky.log` | An application log with secrets and personal data |

## Safety guarantees

Fake secrets must never reach a real AI provider (master §3.1, rule 5). `simulator/client.py` is the only network path, and every
scenario goes through it:

- **Bodies stay on this machine.** A request with a body is refused unless its host is loopback.
- **One exception, with no data in it.** `shadow_saas_sweep` sends a keyless, bodyless `GET /v1/models` to five named hosts.
- **Proxies are ignored**, because one could carry a request for localhost off the machine. Redirects are not followed.
- **`X-ShadowScope-Self` is refused**, because it would make the gateway skip its scan.
- **Tool calls are never executed.** The rogue agent's results are canned. Its one real child process is
  `sh -c "echo shadowscope-demo; sleep 4"`.
- **The mock provider binds to `127.0.0.1` only.**

`gateway_block` is the one scenario with real risk: the gateway forwards to the real provider unless a critical finding blocks the
request. So nothing is sent to it unless the local detector rates the payload critical and the engine confirms `block_on_critical`
is on. If either check fails, or the engine cannot be reached, the scenario stops and says why.

Simulator traffic carries `X-ShadowScope-Sim: 1`, so the loopback sniffer can skip what the simulator also reports over HTTP.
