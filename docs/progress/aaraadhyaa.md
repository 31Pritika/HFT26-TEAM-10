# Progress — aaraadhyaa

## Done
- **Phase 1: `scan_text()` and `redact()` are real.** 32 subtypes from master §8.1 + §8.2 plus `bulk_pii`.
  `analyze_agent_payload`, `classify_process` and `triage` are still bootstrap stubs. Public signatures unchanged.
- Modules: `types.py`, `patterns/{secrets,pii}.py`, `validators.py`, `entropy.py`, `redact.py`, `scanner.py`.
- 636 pytest cases green (`pytest detector`). Includes a seeded property test: `redact()` output re-scans clean.
- Speed: about 100 ms per MB on prose/code/logs (budget 400 ms). No quadratic regexes on 1 MB adversarial inputs.

## Next
- Phase 2: `code_detect.py`, canary tokens, agent analyzer, `classify.py`, `remediation.py`, LLM triage.
  `context` is accepted by `scan_text` but unused until then.

## Issues
- `python3` on this Mac is the system 3.9, which the package rejects (needs 3.11+). The venv was made with
  `/opt/homebrew/bin/python3.11 -m venv .venv`.
- Worst cases, both linear: 1 MB of nothing but emails takes about 570 ms (46k findings); 1 MB of repeated
  `BEGIN PRIVATE KEY` headers with no END takes about 1.3 s, because each header searches a 64 KB window.
- Truncated private keys: a one-word line right after the key body is masked along with it. Deliberate: it could
  be the last line of the key.
- Hex digests with no commit/hash word before them are flagged `high_entropy_string` (medium), per §8.1.

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
**Part A:** `evidence.offset` is a raw-text offset; it does not index into `redacted_text`.
