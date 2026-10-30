# Simulator

The demo engine, owned by Part B (spec 02 §B6): a mock AI provider, nine attack scenarios and sample files. It generates
real localhost traffic and reports each request to the backend over HTTP (`POST /api/observations`), so it never imports
backend code.

```bash
pip install -r simulator/requirements.txt

python -m simulator.run --list                # or --list --json
python -m simulator.run env_file_leak         # --intensity 1-3, --dry-run
python -m simulator.demo_sequence             # every scenario, 4 s apart
python -m simulator.mock_provider             # optional: keep the mock running on 127.0.0.1:8788
python -m simulator.make_samples              # rebuild samples/ (needs scapy)
python -m pytest simulator
```

- `SHADOWSCOPE_API` overrides `http://localhost:8787/api`, and `OLLAMA_URL` overrides `http://localhost:11434`.
- Nothing needs starting first: a run starts the mock for itself if port 8788 is closed.
- With the backend down, each observation is printed and the run carries on.
- `--dry-run` prints observations and touches no network.

## Safety

Fake secrets must never reach a real provider (golden rule 5). `client.py` is the only network path and enforces this:

- A request with a body can only go to this machine.
- The only traffic leaving this machine is `shadow_saas_sweep`: a keyless, bodyless `GET /v1/models` to five named hosts.
- Proxy environment variables are ignored, and redirects are not followed.
- `X-ShadowScope-Self` is refused, because it would make the gateway skip its scan.

`gateway_block` is the one risky scenario: Part A's gateway forwards to the real provider unless a critical finding
blocks the request. So nothing is sent unless the local detector rates the payload critical and the backend confirms
`block_on_critical` is on. Any doubt, including an unreachable backend, means nothing goes to the gateway.
