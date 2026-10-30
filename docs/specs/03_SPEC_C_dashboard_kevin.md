# 03 — PART C SPEC · Command Console (Dashboard)
**Owner:** Kevin's Windows · **Tool:** Antigravity · **Branch:** `kevin/dashboard`
**Owns:** `web/src/app/`, `web/src/dashboard/`, `web/src/shared/`, `web/package.json` (+lock),
`web/vite.config.ts`, `web/index.html`, `web/src/index.css`, `docs/progress/kevin.md`
**Read first:** `docs/specs/00_MASTER_SPEC.md` (§5 API, §6 models, §9 scoring, §10 design system, §12 demo mode).

You build the security console judges will spend most of the demo looking at. It must feel like a
premium, futuristic SOC — Awwwards-level motion — yet stay fast, readable and fully responsive.
You never wait for the backend: everything runs on `contracts/mock` data through the shared API layer,
and switches to the live engine automatically when `http://localhost:8787/api/health` responds.

---

## C1. Ownership inside `web/`
- `src/app/` — `App.tsx`, `routes.tsx` (all routes incl. Part D's pages, which live in `src/experience/`),
  `AppShell.tsx` (dashboard layout), `PageTransition.tsx`, providers (QueryClient, Toaster, theme).
- `src/shared/` — `api.ts`, `types.ts` (mirror master §6), `mock/` (JSON copies + `stream.ts`), `ws.ts`,
  `store.ts` (zustand: live feed buffer, engine status, filters), `ui/` primitives (GlassCard, Badge,
  SeverityPill, Stat, Button, Drawer, Tabs, Skeleton, EmptyState, CountUp, Sparkline, RiskGauge).
  **Part D may import from `src/shared/` but never edits it.** Keep exported names stable once pushed.
- `src/dashboard/` — every `/app/*` page and its components.

## C2. Routes you build (`/app/*`, inside `AppShell`)

| Route | Page | Must-have content |
|---|---|---|
| `/app` | **Overview** | Hero **Risk Gauge** (animated radial 0–100, grade letter, glow by grade); 8 KPI cards with count-up + sparkline; requests/findings timeline (area chart, 24 buckets); provider breakdown (donut + legend with provider chips); severity bars; compliance mini-scorecards (DPDP, GDPR, SOC2, PCI, ISO) as animated rings; **Live Threat Feed** (WS, new items slide in with severity glow); collectors status strip |
| `/app/live` | **Live Traffic** | streaming table of AIEvents (pause/resume, auto-scroll), filters (provider, source, process, min risk), row → right **Drawer** with dest, process, payload preview (redacted, mono), linked findings, tags; source badges (LIVE / SNI / LOOPBACK / HAR / PCAP / EXT / SIM) |
| `/app/alerts` | **Alerts Center** | findings list/grid toggle, filters (severity, type, status, search), bulk acknowledge/resolve, severity counters as tabs, keyboard nav (j/k, enter) |
| `/app/alerts/:id` | **Alert Detail** | title, severity hero band, evidence block with highlighted redacted match, entropy bar, timeline context, process + provider cards, compliance chips, rule-based remediation checklist (checkable), **"Ask AI Analyst"** button → `POST /findings/:id/triage` → animated streaming-style reveal (typewriter) of verdict, reasoning, steps, policy suggestion, engine/model/latency badge and a collapsible "**What was sent to the LLM (redacted)**" proof box; status actions |
| `/app/inventory` | **Shadow AI Inventory** | cards per discovered tool/process (icon, category, providers, first/last seen, req count, bytes out, risk) with **Sanctioned / Unsanctioned** toggle → `PUT /policies`; filter chips; "new this session" ribbon; summary bar: sanctioned vs shadow |
| `/app/agents` | **Agents & Permissions** | agent session list (framework logo/name, autonomy meter, risk), detail panel: **permission matrix** (shell, fs read, fs write, network, internal API, code exec — on/off with danger colors), tools-used chart, **action timeline** (vertical, each action with severity + command in mono), "Kill switch" button (marks status blocked via policy — UI only if API missing) |
| `/app/graph` | *(built by Part D — Pritika)* | Route renders `web/src/experience/constellation/ThreatConstellation.tsx` inside your AppShell. You only include it in the sidebar / bottom-bar "More" sheet and command palette. |
| `/app/simulate` | **Attack Simulator** | scenario cards from `/scenarios` (icon, severity, tags) with "Launch" → `POST /simulate`; launch animation (pulse ripple), then live mini-feed filtered to the run; "Run full demo sequence" button that fires all scenarios with 4 s gaps |
| `/app/ingest` | **Evidence Upload** | drag & drop (react-dropzone) for .har/.pcap/.jsonl/.json/.log; animated upload + parse progress; `IngestResult` summary with count-up; link to filtered alerts; "Load sample" buttons (samples served by backend or bundled small mock) + short "How to export a HAR from Chrome/Edge" helper |
| `/app/policies` | **Policies** | sanctioned providers/processes multi-select, blocked providers, canary tokens editor (add/remove, generator button), entropy threshold slider with live preview text, min alert severity, LLM triage engine select |
| `/app/settings` | **Settings & About** | engine connection status, API base URL override, demo-mode toggle, reduce-motion toggle, privacy statement ("all data stays on this machine, secrets are redacted before storage and before any LLM call") |

## C3. App shell & global UX
- **Desktop ≥1024px:** collapsible glass sidebar (icons + labels, active indicator with `layoutId` morph),
  top bar: breadcrumb, global **risk pill** (score + grade, color), engine pill (`LIVE ENGINE`/`DEMO DATA`),
  live pulse dot, search/⌘K button, notifications bell (critical findings).
- **Tablet 768–1023:** icon-only sidebar. **Mobile <768:** bottom tab bar (Overview, Live, Alerts, Agents, More sheet),
  cards stack, tables become card lists, drawers become bottom sheets.
- **Command palette** (`cmdk`, ⌘K / Ctrl+K): navigate pages, jump to alert by id, launch scenario, toggle demo mode.
- **Page transitions:** `AnimatePresence mode="wait"` keyed by pathname (master §10 spec).
- **Microinteractions:** magnetic primary buttons, hover tilt on cards (subtle, 4°), ripple on launch,
  shimmer skeletons, number count-ups, severity glow pulses for critical, toast (sonner) on new critical finding,
  optional browser `Notification` for criticals (ask permission once from Settings).
- **Background:** animated grid + slow drifting radial glows (CSS only) behind the shell; respects reduced motion.
- Empty states with illustrations made from SVG/CSS (no stock images), friendly copy.

## C4. Data layer (`src/shared/`)
- `api.ts`: typed functions for every endpoint in master §5; base URL `import.meta.env.VITE_API_BASE ??
  "http://localhost:8787/api"`; engine detection (health probe, 1.5 s timeout, re-probe every 15 s);
  demo mode returns mock JSON (with small randomization + simulated latency 150–400 ms) and implements
  mutating calls in-memory (status changes, policy edits, simulate → injects scripted events into the mock stream).
- `ws.ts`: connects to `ws://localhost:8787/api/ws/stream`, exponential backoff; in demo mode uses `mock/stream.ts`.
- TanStack Query for fetches (stale 10 s), WS messages update the zustand store + invalidate queries.
- `types.ts` must match master §6 exactly (Part D relies on it).

## C5. Performance
- Code-split every page (`React.lazy`). (The 3D graph page is Part D's and is lazy-loaded by them.)
- Live feed capped at 200 items in memory; table rows animated only for the newest 10.
- Lighthouse desktop ≥ 85 perf on `/app`. No layout shift on data load (skeletons with fixed heights).
- Test in **Chrome and Edge**, at 375 / 768 / 1280 / 1920 widths (use Antigravity's browser to screenshot).

## C6. Phase plan (prompts in `PROMPTS_C_kevin.md`)
- **P1 (→H4):** shared layer (types, api, mock stream, store, ui primitives), AppShell (sidebar/topbar/bottom bar),
  page transitions, command palette, **Overview** page complete.
- **P2 (→H8):** Live Traffic + drawer, Alerts Center, Alert Detail incl. AI Analyst triage UX.
- **P3 (→H12):** Inventory, Agents & Permissions, Simulator, Ingest, Policies, Settings.
- **P4 (→H14:15):** connect to the real engine (backend via `scripts\start.ps1` on this Windows laptop, or Vishwak's Mac over Wi-Fi) (after checkpoint merge), fix shape mismatches in `shared/`,
  microinteraction polish, mobile QA, accessibility, Lighthouse, Edge test.
