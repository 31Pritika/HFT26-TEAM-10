# Detector

`shadowscope_detect` is ShadowScope's detection library: a pure Python package (stdlib and httpx) that the engine imports. It finds
secrets, personal data, source code and risky agent behaviour, and triages findings with an LLM without ever sending raw values.

```python
from shadowscope_detect import scan_text, analyze_agent_payload, classify_process, triage, redact
```

| Function | Purpose |
|---|---|
| `scan_text(text, *, context=None, policy=None)` | Findings, redacted text, risk score and stats |
| `redact(text)` | The text with every detected value masked |
| `analyze_agent_payload(payload, *, direction)` | Tools, tool calls, permissions and findings for a request or response |
| `classify_process(name, cmdline)` | Whether a process is an AI tool, and which |
| `async triage(finding, context_snippet, *, engine_cfg)` | A `TriageResult`, from an LLM or from rules |

## Rules

Master spec §8 is the source of the rules. The tables below are what the code does, including corrections to §8 listed in
`docs/progress/aaraadhyaa.md`. `extension/src/scanner.js` is a JS port, and a parity test keeps the two identical.

### Secrets

| Subtype | Severity | Check beyond the regex |
|---|---|---|
| `aws_access_key`, `aws_secret_key` | critical | Secret key needs `aws` and `secret`/`private` nearby |
| `openai_key` | critical | Not `sk-ant-`, not a hyphenated word like `sk-learn-contrib` |
| `anthropic_key`, `github_token`, `azure_conn_string`, `gcp_service_account` | critical | |
| `private_key` | critical | Match covers the whole key body, not just the header |
| `db_connection_url` | critical | Password must not be a placeholder |
| `stripe_key` | critical live, medium test | Severity set from the key |
| `google_api_key`, `slack_token`, `hf_token`, `groq_key`, `npm_token`, `sendgrid_key` | high | |
| `jwt` | high, medium if expired | Header and claims decoded; `alg` and `exp` reported, `iss` and `sub` never echoed |
| `generic_secret_assignment` | high | Value needs entropy ≥ 3.0 or length ≥ 16, and must not be a placeholder |
| `high_entropy_string` | medium, info for a UUID in key context | Shannon ≥ 4.0, hex ≥ 3.0, confidence `clamp((H-3.5)/1.5)` |

### Personal data

| Subtype | Severity | Check beyond the regex |
|---|---|---|
| `credit_card` | critical | Luhn, issuer prefix and length, incl. RuPay |
| `aadhaar` | high | Verhoeff checksum |
| `pan` | high | Entity character |
| `us_ssn` | high | Invalid ranges excluded |
| `bulk_pii` | high | 5+ distinct emails, or 3+ distinct Aadhaar/PAN, added on top of the individual findings |
| `email`, `phone_in`, `gstin`, `upi_id` | medium | Email rejects file names, version pins and SSH remotes |
| `passport_in` | medium | The word "passport" within 30 characters |
| `phone_intl`, `ifsc`, `private_ip`, `internal_host` | low | IP octets ≤ 255; hostnames reject code like `self.internal` |

### Source code and canaries

| Subtype | Severity | Rule |
|---|---|---|
| `canary_token` | critical | Any `policy["canary_tokens"]` value, outranking every other rule |
| `proprietary_code` | high | Code, plus a Proprietary, Confidential, Internal use only or Copyright marker |
| `source_code` | medium | 5+ lines of code signals, in Python, JS, Java, SQL or C |

### Agent behaviour

Five formats are parsed: OpenAI, Anthropic and Ollama JSON, LangChain ReAct text, AutoGPT JSON.

| Subtype | Severity |
|---|---|
| `destructive_command`, `remote_code_exec` | critical |
| `sensitive_file_read` | critical for SSH keys, `/etc/shadow`, SAM; otherwise high |
| `data_exfil_command`, `privilege_escalation`, `persistence` | high |
| `recon`, `unverified_tool_call`, `autonomous_loop` | medium |

A JSON request repeats every earlier tool call in its history, so it yields findings but no actions. Actions come from the response
that issued each call. `shell_spawn` needs the process tree, so the engine raises it.

## False-positive guards

- **Overlaps:** the most specific rule wins, so `api_key = "sk-..."` is one `openai_key`, not also a generic secret.
- **Entropy:** UUIDs, digests after a word like `commit` or `sha256`, `data:image` payloads, plain numbers, paths and identifiers are skipped.
- **Placeholders:** `${VAR}`, `<your-key>`, `{{ var }}`, `your_key_here` and code like `os.environ[...]` are not secrets.
- **Keyword rules:** `password: str` and `web_search("what does rm -rf do")` are not flagged. Command rules only apply to shell tools.
- **FAKE and EXAMPLE markers stay flagged.** Telling test data apart is triage's job, not the scanner's.

## Redaction

Values keep their first 4 and last 2 characters, or 1 + 1 under 12 characters. Emails become `a•••@d•••.com`, and Aadhaar becomes
`XXXX XXXX 1234`. A key name stays readable: `password = "FAKE•••ss"`.

- Every candidate is masked, including ones that lost overlap resolution, so no tail stays raw.
- Snippets are cut from the redacted text, so a context window cannot split a secret and leak half of it.
- Redacted text re-scans clean. Part of the test suite checks this property on randomly mixed samples.

JSON request bodies are scanned through an unescaped view with the same offsets, so `\n` and `\"` hide nothing.

## LLM triage

`triage()` tries Featherless, Groq, Ollama and then rules, over OpenAI-compatible `/chat/completions`.

| Setting | Source |
|---|---|
| Featherless | `FEATHERLESS_API_KEY` and `FEATHERLESS_MODEL` (skipped without both) |
| Groq | `GROQ_API_KEY`, model `llama-3.1-8b-instant` |
| Ollama | `OLLAMA_URL`, `OLLAMA_MODEL` (default `llama3.2:3b`) |
| Choice | `engine_cfg`: `engine` is `auto` or a name, `model` applies to a named engine |

Each engine gets 12 s, and the chain stops at 18 s so rules can still answer before the engine's 20 s limit. Requests carry
`X-ShadowScope-Self: 1`, so ShadowScope never flags itself. Replies are parsed tolerantly, validated and redacted. LLM results are
cached by subtype, fingerprint, engine and model. The rules engine gives a verdict, reasoning, four steps and a policy suggestion, so
triage works with no LLM at all.

### Privacy guarantee

**No raw secret or personal value reaches an LLM.** One gate in `triage/engine.py` is the only path to the network:

1. Only allowlisted finding fields go into the prompt, never the whole finding.
2. The matched value is masked if a caller passed it unmasked.
3. The whole message is redacted and re-scanned, up to three times, then masked harder.
4. **If anything still survives, nothing is sent.** Rules answer instead.

Canary findings never reach an LLM. Nor does the context of a source code finding, because code has nothing for redaction to mask.
The payload is wrapped as untrusted data, so text in it cannot pose as instructions. `redacted_input_preview` shows exactly what was
sent. A test checks the bytes on the wire for all 80 fixture samples, with raw values planted in the finding.

## CLI

```bash
shadowscope-scan src/ .env "**/*.py"        # files, directories, globs
cat notes.txt | shadowscope-scan -          # stdin
shadowscope-scan . --json --fail-on critical
```

It skips binaries, files over 5 MB, `.git`, `node_modules`, `.venv` and similar. Exit codes are 0 for clean, 1 for findings at or
above `--fail-on` (default `high`), and 2 for bad usage. Output is always redacted.

`detector/.pre-commit-hooks.yaml` defines the hook. pre-commit reads that file from a repository root, so until it moves there, use
the `repo: local` snippet at the top of the file.

## Tests and speed

```bash
pip install -e "detector[dev]"
pytest detector
python detector/bench.py     # 5 MB mixed corpus: 5.5 MB/s, target 5 MB/s
```

Scanning takes 110-160 ms per MB on plain prose, code and logs, against a budget of 400 ms. No adversarial input tried shows quadratic
behaviour. The worst case tried is 1.3 s for 1 MB of repeated private key headers.
