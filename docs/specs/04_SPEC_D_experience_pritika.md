# 04 — PART D SPEC · Experience Layer
**Owner:** Pritika's Windows · **Tool:** Antigravity · **Branch:** `pritika/experience`
**Owns:** `web/src/experience/`, `web/public/experience/`, root `README.md`, `docs/DEMO_SCRIPT.md`,
`docs/architecture.md`, `docs/progress/pritika.md`
**Read first:** `docs/specs/00_MASTER_SPEC.md` (§2.1 how we see traffic, §8 rules, §10 design system, §12 demo mode).

You own first impressions and the story: the cinematic landing page, the interactive Threat Playground
(the feature judges will *play* with on the deployed link), the Compliance Report, the Architecture
explainer, the 3D Threat Constellation page inside the console, and the README + demo script. Your pages are public routes outside the dashboard shell.

---

## D1. Ownership & integration rules
- All code lives in `web/src/experience/` (pages, components, hooks, 3D scenes, `lib/scanner.ts`).
- Routes are already registered by bootstrap in `src/app/routes.tsx` pointing to your files:
  `/` → `experience/pages/Landing.tsx`, `/playground` → `Playground.tsx`, `/report` → `Report.tsx`,
  `/architecture` → `Architecture.tsx`, `*` → `NotFound.tsx`, and **`/app/graph` →
  `experience/constellation/ThreatConstellation.tsx`** (rendered inside the dashboard's AppShell).
  **Fill those files; don't edit routes.tsx.**
- You may import from `src/shared/` (types, api, ui primitives) — read-only. If something you need is missing,
  build a local version in `experience/components/` and note it in your progress log.
- Do not add npm dependencies unless unavoidable (all needed libs are pre-installed by bootstrap). If you must,
  tell Kevin (Part C) in the team chat.

## D2. Landing page `/` — "cinematic scroll story"
1. **Hero (100vh):** Three.js scene (r3f): a dark glass "earth/network sphere" of points; data packets
   (glowing particles) stream from laptop nodes toward floating AI-provider nodes (OpenAI, Anthropic, Ollama,
   HF — rendered as labeled orbs, no logos needed); a cyan **scanning ring ("the scope")** sweeps and
   intercepts packets that turn red when they contain "secrets". Mouse parallax. Headline in Space Grotesk:
   **"Your company is talking to AI. Do you know what it's saying?"** Sub: "ShadowScope discovers shadow AI,
   catches leaked secrets & PII, and tames rogue agents — without breaking TLS." CTAs: **Launch Console**
   (`/app`), **Try the Playground** (`/playground`). Animated counters strip (from mock overview).
2. **The problem** — scroll-triggered stat reveals (use cautious phrasing like "most developers use AI tools
   their security team never approved") with animated typed "leaky prompt" example getting redacted.
3. **How it works (no SSL decryption)** — sticky scroll section: 4–6 steps from master §2.1 table, each
   lights up a node in an animated SVG pipeline (collectors → detector → risk engine → console).
4. **Features bento grid** — 8 tiles with hover 3D tilt + glow: Shadow AI Inventory, Secret & PII Detection
   (incl. Aadhaar/PAN), Agent Permission Tracking, AI Analyst triage (Featherless), Honeytoken canaries,
   Opt-in AI Gateway with block mode, Browser Sensor extension, Compliance (DPDP/GDPR/SOC2/PCI/ISO).
5. **Agent danger demo** — horizontally-scrolling (pinned) terminal animation of a rogue agent issuing
   `cat ~/.ssh/id_rsa`, `curl … | sh` with ShadowScope flags popping in.
6. **Privacy promise** — "Nothing leaves your machine. Secrets are redacted before storage and before any LLM."
7. **Final CTA + footer** — team "git push n pray", Hacktoberfest @ CBIT, GitHub link.
- Smooth scroll with `lenis` (landing only), scroll progress bar, section-in-view animations (`whileInView`),
  text split/blur reveals, magnetic CTA buttons, custom cursor glow (desktop only).
- **Mobile:** replace 3D hero with an animated CSS/SVG gradient + particles (no WebGL), shorter sections,
  no pinned horizontal scroll (stack instead). Respect `prefers-reduced-motion`.

## D3. Threat Playground `/playground` — the interactive star
- Split layout (stacked on mobile): left **editor** (textarea with line numbers + monospaced overlay for
  highlights), right **findings panel** + **risk meter**.
- Presets (chips): `.env file`, `Customer CSV (India)`, `Proprietary code`, `Rogue agent transcript (ReAct)`,
  `OpenAI tool-call JSON`, `Clean text`. All values fake but pattern-valid.
- **Client-side scanner** `experience/lib/scanner.ts`: TypeScript port of master §8.1–§8.4 (secrets, PII with
  Luhn + Verhoeff + PAN checks, entropy, code detection, agent commands/paths). Debounced live scan (250 ms).
- Highlights animate in (underline sweep, colored by severity); hovering a highlight focuses its finding card.
- Toggle **Redacted view** (smooth morph of characters into • ).
- If backend is reachable: "Scan with engine" button → `POST /api/scan` and shows a diff badge
  ("engine found 2 more"). Otherwise label "running 100% in your browser".
- "Simulate sending to ChatGPT" button → animated packet flies toward an AI orb and gets **intercepted** by
  the scope ring when risk ≥ high (fun microinteraction, judges love it).
- Export findings as JSON; copy redacted text.

## D4. Compliance Report `/report`
- Data: `api.getReport()` from `src/shared/api.ts` (mock fallback automatic).
- Executive cover: org name, period, overall grade (huge letter with animated ring), summary paragraph.
- Framework scorecards (DPDP Act 2023, GDPR, SOC 2, PCI-DSS, ISO 27001) with control rows pass/warn/fail.
- Top findings table, Shadow AI inventory table, agents table, prioritized recommendations (P0/P1/P2).
- **Print stylesheet** (`@media print`): white background, no animations, page breaks per section →
  "Download PDF" button calls `window.print()`. Also "Export JSON/CSV" via `/report/export` or client-side.

## D5. Architecture `/architecture`
- Interactive animated diagram (SVG + Motion): Collectors (process map, IP cache, DNS/SNI, loopback, gateway,
  extension, uploads) → Pipeline → Detector (regex/entropy/validators/agent analyzer) → Risk & Compliance →
  SQLite → API/WebSocket → Console; side branch: Redactor → LLM triage chain (Featherless → Groq → Ollama → rules).
  Hover/tap a node → explanation card. Animated packets along edges.
- "Why no SSL decryption?" section, privacy model, tech stack badges, team credits.

## D5b. Threat Constellation `/app/graph` (inside the dashboard shell)
- File: `web/src/experience/constellation/ThreatConstellation.tsx` (+ helpers in the same folder). Lazy-loaded.
- Data: `api.getGraph()` from `src/shared/api.ts` (GraphData, master §6); refresh every 10 s and on new
  `event` stream messages (use `src/shared/ws.ts` / store if exported, else poll).
- `react-force-graph-3d` (pre-installed): nodes = processes, providers, agents, hosts; color by risk
  (low → cyan, high → red), size by volume; link directional particles flowing toward providers (speed/width =
  traffic); bloom-like glow via sprite materials; slow auto-rotate; click node → glass side panel with details
  (risk, bytes out, findings count, link to `/app/alerts?process=...`); hover tooltips; legend; search box that
  flies the camera to a node.
- Fallback: 2D SVG force layout (or simple radial layout) on < 768px, no WebGL, or reduced motion.
- Must look at home in the dashboard: same tokens, glass panels, no own page header beyond a title row.

## D6. NotFound `*`
Playful glitch "404 — this endpoint isn't in our fingerprint DB" with link home.

## D7. README & docs (Phase 4)
- Root `README.md`: **keep the organizers' starter content** (Team Information table, members, submission
  workflow, rules) — update "Problem Track" and add our sections below it: banner, one-line pitch, problem statement, key features, **architecture diagram (Mermaid)**,
  "How we see traffic without SSL decryption" table, screenshots/GIF placeholders (`docs/media/`), tech stack,
  setup for **macOS** and **Windows** (prereqs, `./scripts/start.sh` / `scripts\start.ps1`, optional sudo/Npcap,
  Ollama, extension load-unpacked, API keys in `.env`), demo-mode deploy note, team table with GitHub handles,
  license. Coordinate facts with the other parts' `docs/*.md`.
- `docs/DEMO_SCRIPT.md`: a timed < 3 min video script (see master §13 / prompts).
- `docs/architecture.md`: longer architecture write-up.

## D8. Phase plan (prompts in `PROMPTS_D_pritika.md`)
- **P1 (→H4):** Landing page complete (hero 3D + mobile fallback, all sections, motion).
- **P2 (→H8):** Threat Playground incl. TS scanner + presets + highlight UX.
- **P3 (→H12):** Threat Constellation (`/app/graph`), Compliance Report (+print), NotFound.
- **P4 (→H14:15):** Architecture page, polish & mobile QA of all your pages, per-page `document.title`, favicon + OG image files in
  `web/public/experience/` (Kevin links them from `index.html`), README.md, DEMO_SCRIPT.md, architecture.md.
