# Progress — aaraadhyaa

## Done
- **Phase 1:** `scan_text()` and `redact()`. 32 subtypes from master §8.1 + §8.2 plus `bulk_pii`.
- **Phase 2, ready for checkpoint #1 (package version 0.2.0).** No public signature changed.
  - `code_detect.py`: `source_code` and `proprietary_code`, also inside JSON request bodies.
  - Canary tokens from `policy["canary_tokens"]`, outranking every other rule.
  - `agent_analyzer.py`: OpenAI, Anthropic, Ollama, ReAct and AutoGPT formats; framework guess, permissions, all command
    and path rules, `autonomy_score()`. Tool arguments and results are scanned and redacted.
  - `classify.py`: master §7 process signatures, same meaning as Part A's fallback.
  - `remediation.py`: steps and compliance tags for every subtype, including the ones Part A emits.
  - `triage/`: Featherless → Groq → Ollama → rules, behind a redact-and-re-scan gate that sends nothing if a value survives.
- 1461 pytest cases green (`pytest detector`). One test checks the bytes on the wire for all 80 fixture samples.
- Checked against Part A's real code (`vishwak/core-engine` @ `569bf1b`): its 314 backend tests pass with this package,
  and a 20-point run through its real app passes: all demo-shaped payloads, one agent session, triage over a real socket
  to a local stub, no raw value in stored data or on the wire.
- Speed: 110-160 ms per MB on prose, code and logs (budget 400 ms). Non-agent text costs under 1 ms in the analyzer.

## Next
- Phase 3: simulator, `shadowscope-scan` CLI, samples. It includes the two Part A requests below.
  - Send `X-ShadowScope-Sim: 1` on simulator requests to :8788, so `loopback` can skip them.
  - `gateway_block` must send only fake secrets the detector rates critical (an AWS key is enough), because the gateway
    forwards anything else to the real provider.

## Issues
- `python3` on this Mac is the system 3.9, which the package rejects (needs 3.11+). The venv was made with
  `/opt/homebrew/bin/python3.11 -m venv .venv`.
- Worst cases, both linear: 1 MB of nothing but emails takes about 590 ms (46k findings); 1 MB of repeated
  `BEGIN PRIVATE KEY` headers with no END takes about 1.3 s, because each header searches a 64 KB window.
- Truncated private keys: a one-word line right after the key body is masked along with it. Deliberate: it could
  be the last line of the key.
- Hex digests with no commit/hash word before them are flagged `high_entropy_string` (medium), per §8.1.
- `redact(text)` takes no policy (frozen signature), so it cannot mask canaries. `scan_text(..., policy=...)` does, and
  Part A's `harden(text, canaries)` covers its own calls.
- Rules triage cannot see a test marker inside a masked value, only in the visible context. `sk_test_` keys are the
  exception, recognised from the mask prefix and title.
- Streaming tool calls: only whole `delta.tool_calls` objects are parsed. SSE text and fragmented arguments are not.
- Groq and Featherless have only been tested against a mock transport: no keys on this Mac. Their model IDs are unverified.

## Requests to other parts
**Part D (and the extension port):** `shadowscope_detect` differs from the §8 regexes where they gave wrong results.
Please copy these into the TS Playground scanner. Regexes are in `detector/shadowscope_detect/patterns/`.

| Subtype | Change from §8 | Why |
|---|---|---|
| private_key | Match extends to the END marker, or the end of the base64 body | §8 matches only the header, so the key itself stayed unredacted |
| aws_secret_key | Quotes optional | Unquoted `.env` lines were missed |
| generic_secret_assignment | Allows `DB_PASSWORD=`, `SECRET_KEY=`, `"password": "x"`, `:=`, `=>`, quoted values with spaces. Rejects `${VAR}`, `<your-key>`, `your_key_here`, code like `os.environ[...]`, URLs | `\bpassword\b` misses `_`-prefixed names and JSON keys |
| db_connection_url | Empty user allowed (`redis://:pw@host`), quotes end the match; placeholder passwords rejected | Common Redis form; closing quote was swallowed |
| azure_conn_string | `[^;]+` became `[^;\s'"]+` | Could run across lines to the next `;` |
| google_api_key, sendgrid_key | Trailing `\b` became `(?![\w-])` | Keys ending in `-` were missed |
| phone_in | Left boundary added; `98765 43210` form accepted | §8 matched the tail of 13-digit millisecond timestamps |
| phone_intl | Groups allowed (`+44 20 7946 0958`); left boundary added | Spaced numbers were missed; `a+1234567` was matched |
| email | Domain cannot end in `.`; rejects `react@18.2.0`, `logo@2x.png`, `git@github.com:org/repo` | False positives in code and lockfiles |
| aadhaar | Separator is space or `-`, not any whitespace | §8 could match across a line break |
| upi_id | Not when followed by `.tld` | `user@paytm.com` is an email |
| credit_card | Tries each group start and issuer length; rejects groups under 3 digits | `4111111111111111 12/26` failed Luhn as 18 digits |
| private_ip | Octets must be ≤ 255; no dotted suffix | `10.0.19041.1` is a Windows build number |
| internal_host | Full multi-label name; rejects `self.internal`, `threading.local()`, `settings.local.py` | §8 caught only the last two labels; false positives in code |

**Part D masking:** values under 12 characters keep first 1 + last 1 instead of first 4 + last 2 (spec B1), because
4 + 2 shows 6 of 8 characters of a password. `contracts/mock/` still shows the old form for PAN and passport.
**Part D, code detection (`code_detect.py`):** a line counts as code only at a line start or after code punctuation, so
"class of students" stays prose; a trailing `{` counts only after `)`, so pretty-printed JSON is not code; and five lines
are needed. Run it on the unescaped text, or code in a JSON body is missed.

**Part D, agent rules (`patterns/agent.py`):** `-F file=@x` counts as `data_exfil_command`; `curl x | sudo sh` as
`remote_code_exec`; `rm -fr` as destructive; `env` as recon only when it is a command (not `.env` or `env=`); `id_rsa.pub`
and `.env.example` are not sensitive.

**Part A:**
- All four requests addressed to Part B in your log are met or scheduled: snippets come from `redacted_text`,
  `match_redacted` is verbatim in it, the canary fingerprint is `sha256(token)[:12]`, and private key bodies are masked.
  The two simulator requests are in Next.
- `evidence.offset` is a raw-text offset; it does not index into `redacted_text`. It is `None` for `source_code` and
  agent findings.
- `analyze_agent_payload`: a JSON **request** returns findings but no actions, because its history repeats every earlier
  call. Actions come from the **response** that issued the call, so `body_text` alone gives none. Raw text always gives actions.
- It also returns a `permissions` dict (extra key). Action `ts` is `""`, so your `raw.get("ts") or ts` fills it in.
- `autonomous_loop` also comes from here, for 3+ round trips in one payload, which covers uploaded logs with no timing.
  Your `agents.py` emits it too, with a different fingerprint, so one session can show two.
- `shell_spawn` stays yours (it needs the process tree). `patterns.agent.SHELL_PROCESS_NAMES` has the shell list.
- Your behaviour findings pass `compliance: [], remediation: []`. `from shadowscope_detect.remediation import
  remediation_for, compliance_for` fills them, for all mock subtypes. Rules triage already falls back to that table.
- `triage` stops at 18 s overall so its own rules answer before your 20 s `wait_for`.
- The seed can drop `seed_catalog.py` now that the real detector finds everything.
