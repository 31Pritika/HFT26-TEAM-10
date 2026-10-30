# PROMPTS — Part D · Experience Layer · Pritika's Windows · Antigravity

**Repo:** https://github.com/31Pritika/HFT26-TEAM-10 (team fork — never push to upstream `cbitosc/HFT26-TEAM-10`)

### One-time branch setup on this laptop (Windows — PowerShell or Git Bash)
Run once after Vishwak says "bootstrap pushed":
```bash
cd $HOME\Desktop
git clone https://github.com/31Pritika/HFT26-TEAM-10.git     # skip if already cloned
cd HFT26-TEAM-10
git checkout main && git pull origin main
git config user.name  "Pritika Agarwal"
git config user.email "<email of your GitHub account>"
git checkout -b pritika/experience
git push -u origin pritika/experience
cd web
npm install
npm run dev            # open http://localhost:5173 — leave this running
```
Then: Antigravity → File → Open Folder → `HFT26-TEAM-10` → open the Agent panel.
Every phase ends with `git push origin pritika/experience`. PRs go to **`31Pritika/HFT26-TEAM-10` main** — on GitHub's
"Open pull request" page change the *base repository* away from `cbitosc/...`.

Branch `pritika/experience`. Open the repo in Antigravity, new agent conversation per phase, paste the prompt.
Run with `cd web && npm run dev` (works without backend). Let the agent use the built-in browser to check
375px, 768px and 1440px after every section.

---

## Phase 1 — Cinematic Landing page (H0:25 → H4:00)
```
You are an award-winning creative developer building Part D (Experience Layer) of ShadowScope, an
"AI Shadow IT & Agentic Data Exfiltration Scanner", in a 16-hour hackathon judged on innovation, UI/UX
and presentation. Read, in order: docs/specs/00_MASTER_SPEC.md (especially §2, §10, §12),
docs/specs/04_SPEC_D_experience_pritika.md, docs/progress/pritika.md, then explore web/ (note
src/app/routes.tsx already points to your page files and src/shared/ has types, api and UI primitives you
may IMPORT but must NOT edit).

STRICT RULES: edit ONLY web/src/experience/, web/public/experience/, README.md, docs/DEMO_SCRIPT.md,
docs/architecture.md, docs/progress/pritika.md. Do not add npm packages (everything needed is installed:
motion ("motion/react"), three, @react-three/fiber, @react-three/drei, lenis, lucide-react, recharts).
Free/open-source only. Must work in Chrome + Edge and be fully responsive 375px → 1920px. Respect
prefers-reduced-motion. Commit after each section ("feat(experience): ...") and push to origin
pritika/experience at the end of the phase.

Phase 1: build the Landing page (/) per spec D2 — a cinematic scroll story with Awwwards-level polish:
1. Hero: lazy-loaded react-three-fiber scene — glass point-cloud sphere/network, laptop nodes emitting
   glowing packets toward labeled AI-provider orbs (OpenAI, Anthropic, Ollama, Hugging Face), a cyan scanning
   ring that sweeps and intercepts packets which flash red ("secrets"). Mouse parallax, dpr [1,1.5], pause
   when off-screen. Mobile/no-WebGL/reduced-motion fallback: animated CSS/SVG gradient + particles.
   Headline + sub + two magnetic CTAs (/app, /playground) + animated counters strip from api overview.
2. Sections: The problem (scroll-revealed stats + a typed leaky prompt that gets redacted live), How it
   works without SSL decryption (sticky scroll, animated SVG pipeline lighting up per step from master §2.1),
   Features bento grid (8 tiles, hover tilt + glow), Rogue agent terminal (pinned horizontal scroll on
   desktop, stacked on mobile), Privacy promise, Final CTA, footer (team "git push n pray", Hacktoberfest @ CBIT).
3. Lenis smooth scroll (landing only), scroll progress bar, split-text blur reveals, cursor glow (desktop).
4. Verify 375/768/1440 in Chrome, Lighthouse perf sanity, `npm run build` passes.
Update docs/progress/pritika.md (Done / Next / Issues). Commit and push.
```

## Phase 2 — Threat Playground (H4:00 → H8:00)
```
Continue Part D of ShadowScope. Re-read master §8 (detection rules — your scanner must implement them)
and spec D3, plus docs/progress/pritika.md. Same rules.

Build /playground — the interactive feature judges will play with on the deployed link:
1. web/src/experience/lib/scanner.ts — TypeScript port of master §8.1–§8.4: every secret and PII rule with
   validators (Luhn + IIN incl. RuPay, Verhoeff for Aadhaar, PAN 4th char, JWT decode for alg/exp), Shannon
   entropy pass, source/proprietary code heuristic, agent dangerous commands + sensitive paths, overlap
   resolution, redaction (first 4 + last 2 visible), risk score with master §9 weights. Add a small
   self-test function (dev only) that runs fixtures and logs pass/fail.
2. UI: split layout (stacked on mobile) — editor with line numbers and a highlight overlay (severity-colored
   underline sweep animations), findings panel (cards grouped by type, hover ↔ highlight linking), animated
   risk meter, stats (chars, entropy max, scan time).
3. Preset chips with fake-but-valid data: .env file, Customer CSV (India: names, Aadhaar, PAN, +91, UPI,
   emails), Proprietary code (CONFIDENTIAL header + JWT), Rogue agent ReAct transcript, OpenAI tool-call JSON,
   Clean text.
4. Debounced live scan (250 ms), Redacted view toggle with character-morph animation, copy redacted text,
   export JSON.
5. "Scan with engine" when backend reachable (api.scan from src/shared/api.ts) with a diff badge;
   otherwise show "Running 100% in your browser".
6. "Simulate sending to ChatGPT" microinteraction: packet flies toward an AI orb; if risk ≥ high the
   scope ring intercepts it with a red flash and a "Blocked by ShadowScope" stamp.
Verify 375/768/1440; build passes; commit; update progress log; push.
```

## Phase 3 — Threat Constellation, Compliance Report, 404 (H8:15 → H12:00)
```
Continue Part D of ShadowScope. First run `git fetch origin && git merge origin/main` and make sure
`npm install && npm run build` pass. Read docs/progress/*.md for requests addressed to Part D.
Re-read spec D4, D5b and D6.

Build:
1. /app/graph — Threat Constellation (spec D5b) in web/src/experience/constellation/ThreatConstellation.tsx:
   lazy-loaded react-force-graph-3d, nodes = processes/providers/agents/hosts colored by risk and sized by
   volume, directional link particles flowing to providers, glowing sprites, slow auto-rotate, hover tooltips,
   click → glass side panel (risk, bytes out, findings, link to /app/alerts), search that flies the camera to a
   node, legend; data from api.getGraph() refreshed every 10 s; 2D SVG fallback on <768px / no WebGL / reduced
   motion. It renders inside the dashboard shell (Kevin's AppShell), so match its look and don't add a sidebar.
2. /report — Compliance Report from api report data (mock fallback automatic): executive cover with huge
   animated grade ring, summary, framework scorecards (DPDP Act 2023, GDPR, SOC 2, PCI-DSS, ISO 27001) with
   pass/warn/fail controls, top findings table, Shadow AI inventory, agents, prioritized recommendations
   (P0/P1/P2). Print stylesheet (white, no motion, page breaks, readable tables) + "Download PDF"
   (window.print) + Export JSON/CSV. Check print preview in Chrome and Edge.
3. NotFound — glitch 404 "this endpoint isn't in our fingerprint DB".
Verify 375/768/1440, build passes, commit, update progress log, push.
```

## Phase 4 — Architecture page, polish, README, demo script (H12:15 → H14:15)
```
Continue Part D of ShadowScope. First `git fetch origin && git merge origin/main`. Read every
docs/progress/*.md and docs/backend.md / docs/detector.md / docs/simulator.md (if present) so the README is accurate.

Tasks:
0. /architecture — interactive animated SVG architecture diagram per spec D5 with packets flowing along edges,
   hover/tap node → explanation card, "Why no SSL decryption?" section, privacy model, tech stack badges,
   team credits.
1. Polish all my pages: transitions, hover/focus states, mobile QA at 375px (no horizontal scroll), Edge
   test, reduced motion, per-page document.title, Lighthouse fixes.
2. Create favicon (SVG scope ring) and an OG image (1200×630 SVG/PNG) in web/public/experience/ and add a
   "Requests to other parts" note asking Part C to link them in index.html.
3. Root README.md (spec D7) — KEEP the organizers' starter sections (team table, submission workflow,
   rules); set Problem Track to "AI Shadow IT & Agentic Data Exfiltration Scanner"; then add: banner, pitch, problem statement, features, Mermaid architecture diagram,
   "How we see traffic without SSL decryption" table, screenshots placeholders in docs/media/, tech stack,
   setup for macOS and Windows (prereqs, scripts/start.sh, scripts\start.ps1, sudo/Npcap optional, Ollama,
   extension load-unpacked, .env keys), demo-mode deployment, team table (Vishwak, Aaraadhyaa, Kevin, Pritika
   + GitHub handles placeholders), license.
4. docs/DEMO_SCRIPT.md: a < 3 minute video script with timestamps, narration lines and on-screen actions:
   0:00 hook (landing hero) → 0:15 problem → 0:30 console overview → 0:45 run demo sequence (live alerts
   flowing) → 1:15 alert detail + AI Analyst triage with redaction proof → 1:40 rogue agent permissions →
   2:00 gateway block + browser extension catching a paste → 2:20 playground + compliance report PDF →
   2:45 architecture + "no SSL decryption" close.
5. docs/architecture.md: longer write-up matching the /architecture page.
Commit, update progress log, push, open PR pritika/experience → main.
```

---

## Integration prompt (after any `git merge origin/main`)
```
I just merged origin/main into pritika/experience. Run npm install and npm run build, open /, /playground,
/report, /architecture and one /app page to make sure nothing broke. Handle "Requests to other parts" for
Part D in docs/progress/*.md. Edit only my folders. Commit and push.
```

## Final submission (H15:30, after the final merge into the fork's main) — Pritika does this by hand
1. On GitHub open https://github.com/31Pritika/HFT26-TEAM-10 → **Contribute → Open pull request**.
2. Base: `cbitosc/HFT26-TEAM-10` `main` ← Head: `31Pritika/HFT26-TEAM-10` `main`.
3. Title: `[SUBMISSION] TEAM-10 - git push n pray - AI Shadow IT & Agentic Data Exfiltration Scanner`
4. Description — paste the output of this prompt (run it in Antigravity):
```
Read README.md, docs/DEMO_SCRIPT.md and docs/progress/*.md. Write a GitHub PR description in Markdown
with exactly these sections: 📌 Solution Overview & Approach · 🏗️ Architecture & Tech Stack Details ·
🚀 Local Setup & Installation Instructions (Mac + Windows) · 🎥 Demo Video Link / Live Deployment URL
(placeholders <VIDEO_URL> and <VERCEL_URL>) · 📸 Key Screenshots & Visuals (links to docs/media/*).
Keep it under 500 words, crisp and judge-friendly. Output only the Markdown.
```
5. Replace the placeholders with the real video + Vercel links and submit **before code freeze**.

## Rescue prompts
- **3D too heavy:** `Cut particle counts by half, clamp dpr to 1.25, pause the canvas when not in view, and fall back to the CSS hero below 1024px. Keep the visual idea.`
- **Looks generic:** `Push the design to Awwwards level per master §10: bolder type scale, layered glass depth, ambient glows, choreographed scroll reveals, and one memorable signature interaction per section.`
- **Lost context:** `Re-read docs/specs/00_MASTER_SPEC.md, docs/specs/04_SPEC_D_experience_pritika.md and docs/progress/pritika.md, check git log, tell me where we are, continue.`
