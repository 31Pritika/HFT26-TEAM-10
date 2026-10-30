# PROMPTS — Part C · Command Console · Kevin's Windows · Antigravity

**Repo:** https://github.com/31Pritika/HFT26-TEAM-10 (team fork — never push to upstream `cbitosc/HFT26-TEAM-10`)

### One-time branch setup on this laptop (Windows — PowerShell or Git Bash)
Run once after Vishwak says "bootstrap pushed":
```bash
cd $HOME\Desktop
git clone https://github.com/31Pritika/HFT26-TEAM-10.git     # skip if already cloned
cd HFT26-TEAM-10
git checkout main && git pull origin main
git config user.name  "Kevin Tejas"
git config user.email "<email of your GitHub account>"
git checkout -b kevin/dashboard
git push -u origin kevin/dashboard
cd web
npm install
npm run dev            # open http://localhost:5173 — leave this running
```
Then: Antigravity → File → Open Folder → `HFT26-TEAM-10` → open the Agent panel.
Every phase ends with `git push origin kevin/dashboard`. PRs go to **`31Pritika/HFT26-TEAM-10` main** — on GitHub's
"Open pull request" page change the *base repository* away from `cbitosc/...`.

Branch `kevin/dashboard`. Open the repo folder in Antigravity. For each phase start a **new agent
conversation** and paste the prompt. Use the strongest model available in Antigravity for Phase 1 & 3.
Let the agent use Antigravity's built-in browser to check the UI at 375px, 768px and 1440px after each page.
Run the app with `cd web && npm run dev` (it works on mock data — no backend needed).

---

## Phase 1 — Shared layer, App Shell, Overview (H0:25 → H4:00)
```
You are a senior product engineer + motion designer building Part C (Command Console) of ShadowScope,
an "AI Shadow IT & Agentic Data Exfiltration Scanner", in a 16-hour hackathon judged on innovation, UI/UX,
completeness and presentation. Read, in order: docs/specs/00_MASTER_SPEC.md (especially §5, §6, §9, §10,
§12), docs/specs/03_SPEC_C_dashboard_kevin.md, docs/progress/kevin.md, then explore web/.

STRICT RULES: edit ONLY web/src/app/, web/src/dashboard/, web/src/shared/, web/package.json (+lock),
web/vite.config.ts, web/index.html, web/src/index.css, docs/progress/kevin.md. Never touch
web/src/experience/ (another teammate owns it). Stack is fixed: React + Vite + TS, Tailwind v4, Motion for
React (import from "motion/react"), Three.js via @react-three/fiber/drei, recharts, lucide-react, sonner, cmdk,
zustand, TanStack Query — all already installed. 100% free/open-source. Must work in Chrome and Edge and
be fully responsive (375px → 1920px). Commit after every finished sub-feature with messages like
"feat(dashboard): ..." and push to origin kevin/dashboard at the end of the phase.

Design direction: premium futuristic security command center, dark "obsidian + signal" palette, glass
panels with gradient hairline borders, subtle noise + animated grid background, cyan/violet glows,
Space Grotesk headings, Inter body, JetBrains Mono numbers. Awwwards-level motion but fast and tasteful.
Use the exact tokens and motion values in master §10.

Phase 1 tasks:
1. src/shared/: complete types.ts (master §6), api.ts (every endpoint, engine probe + automatic demo-mode
   fallback with randomized mock data, simulated latency, in-memory mutations), ws.ts + mock/stream.ts
   (realistic stream: event every 1–3 s, finding every ~6 s, stats every 3 s), store.ts (zustand), and ui/
   primitives: GlassCard, Badge, SeverityPill (color + icon + text), Stat, Button (magnetic variant), Drawer
   (bottom sheet on mobile), Tabs (layoutId underline), Skeleton (shimmer), EmptyState, CountUp, Sparkline,
   RiskGauge (animated radial with grade letter and glow). Keep exports stable — a teammate imports them.
2. src/app/: AppShell with collapsible glass sidebar (≥1024px), icon rail (768–1023px), bottom tab bar +
   "More" sheet (<768px); top bar with breadcrumb, global risk pill, engine pill (LIVE ENGINE / DEMO DATA),
   live pulse dot, ⌘K button, notifications bell. PageTransition with AnimatePresence. Command palette (cmdk)
   for navigation, alert jump, scenario launch, demo toggle. Toaster for critical findings. Animated grid
   background. Reduced-motion support.
3. Overview page (/app) exactly as spec C2: risk gauge hero, 8 KPI cards (count-up + sparkline), timeline area
   chart, provider donut, severity bars, compliance rings (DPDP, GDPR, SOC2, PCI-DSS, ISO27001), Live Threat
   Feed from the stream (new items slide in with severity glow), collectors status strip. Staggered entrance.
4. Verify in the browser at 375 / 768 / 1440 widths, fix overflow, then `npm run build` must pass.
Update docs/progress/kevin.md (Done / Next / Issues). Commit and push.
```

## Phase 2 — Live Traffic, Alerts, Alert Detail + AI Analyst (H4:00 → H8:00)
```
Continue Part C of ShadowScope. Re-read docs/specs/03_SPEC_C_dashboard_kevin.md §C2–C3 and
docs/progress/kevin.md. Same ownership rules and design system.

Build:
1. /app/live — Live Traffic: streaming table (desktop) / card list (mobile) of AIEvents with pause/resume,
   auto-scroll, filters (provider, source, process, min risk slider), source badges (LIVE/SNI/LOOPBACK/HAR/
   PCAP/EXT/SIM/GATEWAY), new-row highlight animation (only newest 10 animate), row click → Drawer with
   destination, process card, redacted payload preview in mono with highlighted masked spans, linked findings,
   tags. Empty and loading states.
2. /app/alerts — Alerts Center: severity tabs with counts (animated layoutId indicator), list/grid toggle,
   filters (type, status, search), multi-select bulk acknowledge/resolve with optimistic updates, keyboard
   navigation (j/k/enter/x), critical items with a slow pulsing glow.
3. /app/alerts/:id — Alert Detail: severity hero band, title, metadata chips, evidence block (redacted
   snippet with the match highlighted, entropy bar, line/offset, fingerprint), process + provider cards,
   compliance chips, checkable rule-based remediation list, status actions. "Ask AI Analyst" button →
   api.triage(id) → cinematic reveal: scanning shimmer, then verdict badge, typewriter reasoning, steps
   appearing one by one, policy suggestion card, engine/model/latency badge, and a collapsible
   "What was sent to the LLM (redacted)" proof panel. In demo mode return a realistic canned triage.
4. Verify at 375 / 768 / 1440 in Chrome; `npm run build` passes. Commit per page, update progress log, push.
```

## Phase 3 — Inventory, Agents, Simulator, Ingest, Policies, Settings (H8:15 → H12:00)
```
Continue Part C of ShadowScope. First run `git fetch origin && git merge origin/main` (integration
checkpoint #1) and make sure `npm install && npm run build` still pass. Read docs/progress/*.md for
"Requests to other parts" addressed to Part C and handle them. Re-read spec C2.

Build, in this priority order (commit after each):
1. /app/agents — Agents & Permissions: session list with framework, autonomy meter (animated arc), risk;
   detail: permission matrix (shell, fs read, fs write, network, internal API, code exec) as glowing toggles
   with danger colors, tools-used bar chart, vertical action timeline with commands in mono + severity,
   "Kill switch" button (policy update; animate status to BLOCKED).
2. /app/simulate — Attack Simulator: scenario cards (from api.getScenarios) with launch ripple animation,
   per-run mini live feed, "Run full demo sequence" (all scenarios with 4 s gaps, progress stepper). In demo
   mode, launching injects scripted events/findings into the mock stream so the whole UI reacts.
3. /app/inventory — Shadow AI Inventory cards with sanctioned toggle (PUT policies, optimistic), filter
   chips, "new" ribbon, summary bar sanctioned vs shadow (animated split bar).
(/app/graph — Threat Constellation — is built by Pritika in web/src/experience/constellation/; just make
   sure your sidebar/bottom bar links to it.)
4. /app/ingest — drag & drop upload with animated progress, IngestResult count-up summary, "Load sample"
   buttons, collapsible "How to export a HAR from Chrome/Edge DevTools" guide.
5. /app/policies — sanctioned/blocked multi-selects (provider chips), canary token editor with generator,
   entropy threshold slider with live highlighted preview text, min severity, LLM engine select.
6. /app/settings — engine status, API base override, demo-mode toggle, reduce-motion toggle, notification
   permission button, privacy statement.
Verify every page at 375 / 768 / 1440; build passes; update progress log; push.
```

## Phase 4 — Real engine integration + polish (H12:15 → H14:15)
```
Continue Part C of ShadowScope. First `git fetch origin && git merge origin/main`. This is a Windows laptop.
To test against the LIVE ENGINE, ask me which option to use, then configure it:
(a) run the backend here with `scripts\start.ps1` (live packet collectors are limited on Windows, but the API,
WebSocket, simulator scenarios, uploads and triage all work), or (b) point the app at Vishwak's Mac on the same
Wi-Fi by setting VITE_API_BASE=http://<mac-ip>:8787/api in web/.env.local (Vishwak runs the backend with
--host 0.0.0.0). Then switch the app to the LIVE ENGINE.

Tasks:
1. Click through EVERY /app page against the real API and WebSocket. Fix any shape mismatches inside
   src/shared/ (normalize defensively; never crash on missing fields). Fire simulator scenarios from
   /app/simulate and confirm the whole UI reacts live within ~2 s.
2. Link favicon/OG files from web/public/experience/ in index.html if they exist (title "ShadowScope —
   AI Shadow IT Scanner", meta description, theme-color).
3. Polish: consistent spacing, hover/focus/active states everywhere, magnetic buttons, card tilt, shimmer
   skeletons, empty states, toasts for criticals, smooth route transitions, no layout shift.
4. Accessibility: focus rings, aria-labels on icon buttons, contrast ≥ 4.5:1, keyboard navigation.
5. Performance: code-split pages, lazy-load 3D, memoize heavy lists; run Lighthouse on /app (desktop ≥ 85
   perf, ≥ 90 a11y) and fix the top issues.
6. Test in Chrome AND Edge; test on a real phone via `npm run dev -- --host` (same Wi-Fi).
7. `npm run build` passes with VITE_DEMO_MODE=true (for the deployed demo). Commit, update progress log,
   push, and open a PR kevin/dashboard → main.
```

---

## Integration prompt (after any `git merge origin/main`)
```
I just merged origin/main into kevin/dashboard. Run npm install and npm run build, open the app and
check every /app page plus that the experience pages (/, /playground, /report, /architecture) still render.
Handle any "Requests to other parts" for Part C in docs/progress/*.md. Edit only my folders. Commit and push.
```

## Rescue prompts
- **UI looks generic:** `Raise the visual bar to Awwwards level following master §10: stronger typographic hierarchy, glass depth layers, gradient hairline borders, ambient glows, meaningful motion (stagger, layoutId morphs, spring hover). Show me before/after screenshots at 1440px.`
- **Janky / slow:** `Profile with React DevTools/Performance tab; remove animation on large lists, use transform/opacity only, memoize, lazy-load heavy chunks. Target 60fps scroll on mobile.`
- **Lost context:** `Re-read docs/specs/00_MASTER_SPEC.md, docs/specs/03_SPEC_C_dashboard_kevin.md and docs/progress/kevin.md, check git log, tell me where we are, continue.`
