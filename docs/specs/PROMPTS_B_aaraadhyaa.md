# PROMPTS — Part B · Detection, Intelligence & Simulator · Aaraadhyaa's Mac · Claude Code

**Repo:** https://github.com/31Pritika/HFT26-TEAM-10 (team fork — never push to upstream `cbitosc/HFT26-TEAM-10`)

### One-time branch setup on this laptop (Mac)
Run once after Vishwak says "bootstrap pushed":
```bash
cd ~/Desktop
git clone https://github.com/31Pritika/HFT26-TEAM-10.git     # skip if already cloned
cd HFT26-TEAM-10
git checkout main && git pull origin main
git config user.name  "Aaraadhyaa Reddy"
git config user.email "<email of your GitHub account>"
git checkout -b aaraadhyaa/detection-intel
git push -u origin aaraadhyaa/detection-intel
```
Then: VS Code → File → Open Folder → `HFT26-TEAM-10` → Terminal → New Terminal → `claude`.
Every phase ends with `git push origin aaraadhyaa/detection-intel`. PRs go to **`31Pritika/HFT26-TEAM-10` main** — on
GitHub's "Open pull request" page change the *base repository* away from `cbitosc/...`.

Start each phase in a **fresh session** (`/clear`). Use Sonnet by default; Opus only for tricky parts.

---

## Phase 1 — Core scanner (H0:25 → H4:00)
```
You are building Part B (Detection, Intelligence & Attack Simulator) of ShadowScope in a 16-hour hackathon.
Read, in order: docs/specs/00_MASTER_SPEC.md (especially §6 and §8),
docs/specs/02_SPEC_B_detection_intel_aaraadhyaa.md, docs/progress/aaraadhyaa.md, and the current
detector/shadowscope_detect/__init__.py stub (its public function signatures are a FROZEN contract used by
Part A — keep them identical).
Golden rules (master §3.1): you may ONLY edit detector/, simulator/, extension/, docs/detector.md,
docs/simulator.md, docs/progress/aaraadhyaa.md. Branch aaraadhyaa/detection-intel. Keep the detector pure
Python (stdlib + httpx) so it installs on Mac and Windows.

Phase 1 goal: a fast, accurate, well-tested scan_text().
1. Create a venv (python3 -m venv .venv) and `pip install -e detector pytest`.
2. types.py with TypedDicts for DetFinding, Evidence, AgentAction, TriageResult (keys = master §6).
3. patterns/secrets.py and patterns/pii.py as DATA tables: every row of master §8.1 and §8.2 with id, compiled
   regex, severity, validator name, title template, compliance tags, remediation steps.
4. validators.py: luhn + IIN prefixes (incl. RuPay), verhoeff (Aadhaar), PAN entity char, JWT decode
   (base64url header/claims, no signature verify), stripe live/test, sk- vs sk-ant- disambiguation.
5. entropy.py: Shannon entropy, charset classifier (hex/base64/alnum), tokenizer, thresholds from policy.
6. redact.py: masking rules from spec B1; overlapping spans; property: redact(text) re-scanned yields zero
   critical findings.
7. scanner.py: scan_text per spec B2 (overlap resolution, bulk_pii, context snippets ±40 chars redacted,
   fingerprint = sha256(match)[:12], risk_score, stats incl. duration_ms). Compile regexes once.
8. tests/fixtures: fake-but-valid data for every subtype (marked FAKE/EXAMPLE where the format allows) + clean
   negative texts (README prose, UUIDs, git SHAs, base64 images, lorem ipsum). tests/: positive + negative per
   subtype, validator tests, redaction property test.
Run pytest until green. Commit per step (feat(detector): ...). Update docs/progress/aaraadhyaa.md. Push:
git push origin aaraadhyaa/detection-intel. Finish with a table: subtype → tests passing.
```

## Phase 2 — Agents, code, canaries, LLM triage (H4:00 → H8:00)
```
Continue Part B of ShadowScope. Re-read master §8.3–§8.5, spec B3–B4, and docs/progress/aaraadhyaa.md.
Same ownership rules; public API signatures frozen. Push before H8 — Part A integrates your package at
checkpoint #1, so prioritise a stable, tested API over extras.

1. code_detect.py: source_code + proprietary_code heuristics with tests (Python, JS, Java, SQL, C; prose negatives).
2. Canary tokens: scan_text honours policy["canary_tokens"] → critical canary finding.
3. patterns/agent.py + agent_analyzer.py: parsers for OpenAI tool_calls, Anthropic tool_use, Ollama tool_calls,
   LangChain ReAct text, AutoGPT JSON; framework guess; declared tools → permissions; command/path
   classification → AgentAction + findings (all §8.4 subtypes); scan tool arguments with scan_text. Fixtures for
   all 5 formats incl. a rogue agent reading ~/.ssh/id_rsa and running curl|sh. Helper autonomy_score().
4. classify.py: classify_process using master §7 process signatures + cmdline keywords.
5. remediation.py: remediation steps + compliance tags for EVERY subtype; scanner uses it.
6. triage/: prompts.py (strict-JSON analyst prompt + 2 few-shot examples), engine.py (async chain
   featherless → groq → ollama → rules from engine_cfg + env FEATHERLESS_API_KEY, FEATHERLESS_MODEL,
   GROQ_API_KEY, OLLAMA_URL; OpenAI-compatible /chat/completions via httpx; header X-ShadowScope-Self: 1;
   12 s timeouts; robust JSON extraction; validation; LRU cache; latency_ms; engine/model;
   redacted_input_preview), rules.py (deterministic results + false-positive heuristics).
   HARD RULE: redact before sending and re-scan the outgoing text; add a unit test with mocked httpx proving
   no raw fixture secret ever reaches the HTTP layer.
7. Quick manual triage test with Ollama (llama3.2:3b is installed on this Mac) and with a Groq/Featherless key
   from .env if present.
Run pytest (target ≥ 60 tests). Commit, update progress log, push, and tell me it's ready for checkpoint #1.
```

## Phase 3 — Attack simulator + CLI (H8:15 → H12:00)
```
Continue Part B of ShadowScope. First run `git fetch origin && git merge origin/main` and read
docs/progress/vishwak.md for "Requests to other parts" addressed to Part B — do those first.
Then re-read spec B5 and B6 carefully (the simulator ↔ backend contract is HTTP only:
POST http://localhost:8787/api/observations with master §6 Observation, source "simulator").

1. simulator/fakes.py: fake-but-valid AWS/OpenAI/Stripe/GitHub/JWT/DB URL (FAKE/EXAMPLE markers),
   Verhoeff-valid Aadhaar, valid-shape PAN, Luhn-valid test cards, Indian names/phones/UPI/emails.
   Reuse validators from shadowscope_detect.
2. simulator/mock_provider.py: FastAPI on :8788 implementing /v1/chat/completions, /v1/messages,
   /api/chat, /api/generate with plausible replies and tool calls for agent scenarios.
3. simulator/scenarios/: ALL scenarios in spec B6 with a registry (id, name, description, icon (lucide icon
   name), severity, tags). Each scenario sends real localhost traffic AND posts its Observation to
   /api/observations (graceful if backend is down). NEVER send fake secrets to real external hosts; the
   shadow_saas_sweep scenario only opens TLS connections / unauthenticated GET /v1/models with no body.
4. simulator/run.py: `python -m simulator.run <id> [--intensity 1-3] [--dry-run]` and `--list --json`.
   simulator/demo_sequence.py runs all scenarios with 4 s gaps. simulator/requirements.txt.
5. simulator/make_samples.py → samples/demo.har, samples/demo.pcap (scapy-crafted HTTP on loopback ports +
   TLS ClientHello with SNI), samples/agent_session.jsonl, samples/leaky.log. Commit the samples.
6. detector cli.py `shadowscope-scan` (console_scripts) + .pre-commit-hooks.yaml; ANSI table, --json, --fail-on.
7. Test: start the backend from main if it runs (see backend/ or scripts/), run every scenario, confirm events
   and findings appear via GET /api/findings. If the backend isn't ready, verify with --dry-run.
Commit per scenario, update progress log, push.
```

## Phase 4 — Browser extension "Shadow Sensor" + docs (H12:15 → H14:15)
```
Continue Part B of ShadowScope. First `git fetch origin && git merge origin/main`. Re-read spec B7,
master §10 (design tokens) and §6 ExtensionEvent.

1. extension/: Manifest V3 for Chrome AND Edge (minimal permissions: storage + host permissions for the AI sites
   in spec B7 and http://localhost:8787/*), background.js service worker, content.js, scanner.js (JS port of
   master §8 incl. Luhn/Verhoeff/PAN/entropy), popup.html/js, styles.css, icons (cyan scope-ring 16/32/48/128).
   extension/test.html with sample texts.
2. content.js: find the prompt box robustly (textarea / contenteditable, MutationObserver for SPAs); on paste and
   submit run the scanner; Shadow-DOM glass toast with findings + [Redact & paste] + [Paste anyway].
3. background.js: POST the REDACTED ExtensionEvent to /api/extension/event; queue in chrome.storage offline;
   per-site counters. Popup: toggle, today's counts, engine status, "Open dashboard".
4. extension/README.md: load unpacked in Chrome (chrome://extensions) and Edge (edge://extensions). Test on
   chatgpt.com and claude.ai in both browsers with fake data.
5. bench.py (5 MB mixed corpus, report MB/s). docs/detector.md (rule table, false-positive guards, triage design
   + privacy guarantee, CLI) and docs/simulator.md (scenarios, how to run, safety guarantees).
Final: pytest green, commit, update progress log, push, open PR aaraadhyaa/detection-intel → main (fork).
```

---

## Integration prompt (after any `git merge origin/main`)
```
I just merged origin/main into aaraadhyaa/detection-intel. Run detector tests, `pip install -e detector`, start
the backend (scripts/start.sh or backend README) and confirm /api/health shows the real detector, then run
`python -m simulator.run env_file_leak` and confirm findings appear. Read docs/progress/*.md "Requests to other
parts" addressed to Part B and do them. Edit only my folders. Commit "chore(detector): integrate main" and push.
```

## Rescue prompts
- **Lost context:** `Re-read docs/specs/00_MASTER_SPEC.md, docs/specs/02_SPEC_B_detection_intel_aaraadhyaa.md and docs/progress/aaraadhyaa.md, run git log --oneline -20, tell me where we are, continue.`
- **Too many false positives:** `Run scan_text over tests/fixtures/clean/* and README-style prose; list every false positive and tighten the rules (context words, validators, min lengths) without breaking positive tests.`
- **No LLM key works:** `Make the rules engine the default, keep the chain code, and make rules output rich enough (verdict, reasoning, 4 steps, policy suggestion) that the demo still looks great.`
- **Running out of time:** `List remaining tasks in this phase ranked by demo impact; implement only the top 3 and stub the rest with clear TODOs.`
