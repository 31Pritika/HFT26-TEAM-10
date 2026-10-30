# Progress — pritika

## Done
- **Phase 1: Cinematic Landing Page (`/`) completed per Spec D2**:
  - **Hero Scene (3D / WebGL)**: Lazy-loaded `@react-three/fiber` + `@react-three/drei` canvas featuring a glass point-cloud sphere network, floating laptop nodes emitting glowing data packets toward labeled AI provider orbs (OpenAI, Anthropic, Ollama, Hugging Face), a cyan scanning ring that sweeps and intercepts secret payloads (flashing red with glow), interactive mouse parallax, DPR [1, 1.5], and automatic pause when off-screen.
  - **Mobile / Reduced-Motion Fallback (`HeroFallback`)**: Pure CSS/SVG animated gradient sweep, floating glowing particles, and SVG connection lines for mobile (<768px), browsers without WebGL, or users with `prefers-reduced-motion`.
  - **Hero CTAs & Metrics**: Magnetic spring buttons for "Launch Console" (`/app`) and "Try the Playground" (`/playground`), plus an animated tabular count-up strip connected to `api.getOverview("24h")` with mock fallback.
  - **The Problem Section**: Scroll-triggered statistics grid and an interactive `TypedLeakyPrompt` simulating live prompt typing followed by automated redaction overlay and alert pills.
  - **How it Works Section**: Sticky-scrolling OS/network discovery pipeline featuring an animated SVG lighting up each stage from Master Spec §2.1 (Process Map, DNS/SNI, Loopback, Gateway, Detector, Risk Engine, Console).
  - **Features Bento Grid**: 8 distinct capability tiles with interactive 3D mouse tilt and dynamic accent radial glow.
  - **Rogue Agent Terminal (`RogueAgentTerminal`)**: Pinned horizontal scroll timeline on desktop tracking 4 attack stages (Recon, Sensitive File Read, RCE Exfil, Persistence/Priv Escalation) with telemetry and real-time ShadowScope interception; clean stacked cards on mobile.
  - **Privacy Promise & Final CTA**: Zero data exfiltration assurance and obsidian-styled high-contrast call-to-action.
  - **Footer**: Official branding, repository link, and team attribution: `git push n pray` · Hacktoberfest @ CBIT.
  - **Awwwards Polish**: Smooth scrolling via Lenis (landing only), gradient scroll progress bar, split-text blur animations, and desktop cursor glow.
  - **Verification**: `npm run build` succeeds cleanly; oxlint passes with 0 errors; responsive layout verified for 375px, 768px, and 1440px.

- **Phase 2: Threat Playground (`/playground`) completed per Spec D3**:
  - **Client-Side Scanner Engine (`web/src/experience/lib/scanner.ts`)**:
    - Comprehensive TypeScript port of master §8.1–§8.4 detection rules.
    - 20+ Secrets detectors: AWS IAM keys, AWS secret keys, OpenAI keys (`sk-...`), Anthropic keys (`sk-ant-...`), GitHub PATs, Google API keys, Slack tokens, Stripe keys (`live`/`test`), HuggingFace tokens, Groq keys, NPM tokens, SendGrid keys, asymmetric private keys, database connection URIs, Azure connection strings, GCP service account JSON, generic password assignments, and high-entropy token scans.
    - JWT claim decoder parsing base64url headers and payloads for algorithm (`alg`), expiry (`exp`), and subject (`sub`).
    - PII detectors: Email (bulk detection for >= 5 emails), Indian mobile (+91), international phone numbers, Aadhaar (12 digits with full Verhoeff checksum algorithm), PAN (with valid 4th entity character check), GSTIN, UPI Virtual Payment Addresses, IFSC codes, Indian Passports, Payment Cards (with Luhn algorithm + IIN prefixes for Visa, Mastercard, Amex, Discover, RuPay), US SSN, RFC1918 private IPs, and internal corporate FQDNs.
    - Heuristics for source code detection and proprietary confidentiality notices.
    - Agent behavior and dangerous command detection: `rm -rf`, `mkfs`, `dd`, `curl | bash`, `wget | sh`, `iex`, `sudo`, `chmod 777`, `crontab`, and sensitive file paths (`~/.ssh/id_rsa`, `.env`, `/etc/shadow`, etc.).
    - Overlap resolution algorithm prioritizing higher severity and specific match spans.
    - Redaction utilities (first 4 + last 2 visible) and full masked text generator.
    - Event risk scoring with Master Spec §9 weights (critical 60, high 40, medium 20, low 8, info 2) and grade assignment (A–F).
    - Built-in self-test suite (`runScannerSelfTests()`) verifying Verhoeff, Luhn, AWS, PAN, and agent rules.
  - **Preset Fixtures (`web/src/experience/lib/presets.ts`)**:
    - 6 rich fake-but-valid presets: `.env file`, `Customer CSV (India)`, `Proprietary code`, `Rogue agent transcript (ReAct)`, `OpenAI tool-call JSON`, and `Clean text`.
  - **Playground Workspace (`web/src/experience/pages/Playground.tsx`)**:
    - Split layout (7:5 desktop columns, stacked on mobile).
    - Synchronized line numbers and severity-colored underline highlight overlays (`critical`, `high`, `medium`, `low`).
    - Debounced live scanning (250 ms) with telemetry display (duration in ms, lines, chars, max entropy, flagged tokens).
    - Character-morphing Redacted View toggle with masked bullet text.
    - Hover ↔ highlight linking between editor marks and findings cards.
    - Animated SVG Risk Gauge (0–100) and grade badge.
    - Category filter tabs (`All`, `Secrets`, `PII`, `Agent Risks`, `Code`).
    - Detailed finding cards with severity badge, line/offset reference, evidence snippet with match highlighting, compliance mapping tags (`DPDP`, `GDPR`, `SOC2`, `PCI-DSS`, `ISO27001`), and rule-based remediation steps.
    - "Scan with Engine" integration with diff feedback badge against live backend engine.
    - "Copy Redacted" and "Export JSON" utility actions.
  - **Transmission Simulation Microinteraction (`web/src/experience/components/PacketFlightModal.tsx`)**:
    - "Simulate sending to ChatGPT" modal tracking packet flight toward an OpenAI orb.
    - If `risk_score >= 40`: Scanning ring intercepts packet midway with red flash shockwave, disintegrating the packet and stamping **BLOCKED BY SHADOWSCOPE**.
    - If clean: Packet safely glides through and delivers with a **CLEAN · TRANSMISSION OK** stamp.
  - **Verification**: `npm run build` succeeds cleanly in < 3.1s; oxlint passes with 0 errors; responsive layout verified for 375px, 768px, and 1440px.

- **Phase 3: Threat Constellation (`/app/graph`), Compliance Report (`/report`), and NotFound (`*`) completed per Spec D4, D5b, D6**:
  - **Threat Constellation (`web/src/experience/constellation/ThreatConstellation.tsx` + helpers)**:
    - Lazy-loaded `react-force-graph-3d` visualization integrated cleanly into Kevin's dashboard shell (`AppShell.tsx`) without duplicate sidebars.
    - Nodes represented by distinct 3D geometries and glowing meshes: AI providers (spheres with radiant halos), autonomous agents (octahedral diamonds), active processes (rounded tech cubes), and network hosts (icosahedrons).
    - Sized by communication volume and colored dynamically by threat risk (Cyan <20, Yellow 20-50, Orange 50-80, Red >80).
    - Directional particles streaming along graph edges toward AI providers with particle frequency, speed, and line thickness proportional to payload egress and risk.
    - Orbital auto-rotation with manual toggle.
    - Search bar with autocomplete dropdown and 3D camera fly-to transition (`cameraPosition`).
    - Filtering controls by entity kind (`All`, `Processes`, `Providers`, `Agents`, `Hosts`) and minimum risk threshold slider.
    - Slide-over obsidian glass detail panel (`NodeDetailPanel.tsx`) showing entity metrics, severity tier, traffic weight, active incoming/outgoing connections with click-to-focus navigation, and direct deep-links to `/app/alerts?process=...` or `/app/inventory`.
    - High-fidelity 2D SVG topology fallback (`Constellation2D.tsx`) with layered concentric layout, pulsing glowing filters, and interactive node selection for mobile (<768px), reduced-motion, WebGL-disabled environments, or manual view toggle.
    - Auto-refreshes data from `api.getGraph("24h")` every 10 seconds.
  - **Compliance Report (`web/src/experience/pages/Report.tsx`)**:
    - Executive cover displaying organization name, audit window, and large animated letter grade (A–F) surrounded by an SVG progress ring.
    - Telemetry metrics strip: Total Events, AI Invocations, Data Egress, Shadow Tools, Open Findings, and Critical Leaks.
    - Regulatory Framework Scorecards covering India DPDP Act 2023, EU GDPR, AICPA SOC 2, PCI-DSS v4.0, and ISO/IEC 27001:2022 with pass/warn/fail badges and live telemetry evidence.
    - Top Findings & Evidence Registry table with severity indicators, process/destination pairs, redacted code/secret snippets, compliance tags, and remediation guidance.
    - Shadow AI Inventory table auditing unapproved and approved tools, communication volume, and risk ratings.
    - Autonomous Agent Sessions audit table detailing permission matrices (Shell, FS Write, Network) and autonomy scores.
    - Prioritized Remediation Roadmap categorized into P0 (Immediate Containment / 24h), P1 (Architectural Guardrails / 7d), and P2 (Governance & Policy / 30d).
    - High-contrast, clean `@media print` stylesheet with white background, readable monochrome tables, page break rules, and hidden UI action bars.
    - Action handlers for "Download PDF" (`window.print()`), "Export JSON" (full report object), and "Export CSV" (controls and findings matrix).
  - **Glitch-Themed 404 Page (`web/src/experience/pages/NotFound.tsx`)**:
    - Cyber diagnostic terminal aesthetic displaying "404 — This endpoint isn't in our fingerprint DB".
    - Interceptor diagnostics block simulating eBPF scan across 22 canonical AI provider signatures.
    - Interactive "Re-run Diagnostic Probe" animation and quick recovery CTAs linking to Home (`/`), Threat Console (`/app`), and Playground (`/playground`).
  - **Verification**: `npm run build` succeeds cleanly in ~3.1s; oxlint passes with 0 errors; responsive design verified across 375px, 768px, and 1440px.

- **Phase 4: Architecture Page, Polish & Documentation completed per Spec D5, D7, D8**:
  - **Interactive Architecture Page (`web/src/experience/pages/Architecture.tsx`)**:
    - Multi-layer animated SVG pipeline topology featuring dynamic packet flow across all 6 collectors, central pipeline, detection engine, redaction gate, LLM triage chain, SQLite storage, and live console.
    - Interactive node selection with detailed inspection card: source file paths, privilege requirements, operational logic, and telemetry models.
    - "Why No SSL Decryption?" section detailing certificate pinning failure in CLI tools, regulatory privacy liabilities, and localhost model blindness, alongside a structured comparison matrix.
    - Strict redaction and air-gapped intelligence model explanation with triple-pass sanitization guarantees.
    - Complete technology stack badges and team attribution cards for Team "git push n pray".
  - **Page Polish & Quality Assurance**:
    - Fixed initial mount state flip in `Landing.tsx` (`useWebGL`, `useReducedMotion`, `useMobile` initialized synchronously) to resolve React root unmount warning during hydration.
    - Verified all pages on Chrome and Microsoft Edge with zero horizontal overflow at 375px, 768px, and 1440px.
    - Set custom `document.title` across all pages (`Landing`, `Playground`, `Report`, `Architecture`, `ThreatConstellation`, `NotFound`).
    - Respects `prefers-reduced-motion` everywhere (disables 3D canvas, smooth Lenis scroll, and auto-rotation).
  - **Favicon & OpenGraph Assets (`web/public/experience/`)**:
    - Created `favicon.svg`: crisp vector scope ring with cyan targeting reticle, purple center focal point, and red intercepted packet blip.
    - Created `og-image.svg`: high-resolution 1200×630 OpenGraph card with cyber grid, scope ring geometry, feature badges, and hackathon team attribution.
  - **Root Documentation (`README.md`)**:
    - Preserved all organizers' starter sections (Team Information table, members, submission workflow, rules).
    - Set Problem Track to "AI Shadow IT & Agentic Data Exfiltration Scanner".
    - Added banner, one-line pitch, problem statement, key features, Mermaid architecture diagram, "How we see traffic without SSL decryption" comparison table, screenshot placeholders (`docs/media/`), tech stack, macOS/Linux and Windows quickstart setup instructions, optional sudo/Npcap instructions, local Ollama setup, Chrome/Edge extension loading guide, `.env` keys, cloud demo mode (`SHADOWSCOPE_CLOUD=1`), team table with GitHub handles, and MIT License.
  - **Video Demo Script (`docs/DEMO_SCRIPT.md`)**:
    - Under-3-minute video presentation guide with timestamps from 0:00 to 2:55.
    - Exact on-screen actions and spoken narration lines covering hook, problem, console overview, attack simulation, AI analyst triage with redaction proof, rogue agent kill switch, local gateway 403 block, browser sensor paste toast, threat playground, compliance report PDF download, and zero-decryption architecture close.
  - **Long Architecture Write-Up (`docs/architecture.md`)**:
    - Comprehensive technical document detailing system architecture, zero-decryption mechanics, 6 collector specifications, 32+ detection rules catalog, mathematical redaction protocol, Master Spec §9 risk formula, and deployment topologies.

## Next
- Final team checkpoint and submission PR review. All Part D deliverables are 100% complete!

## Issues
- None.

## Requests to other parts
- **Part C (Kevin):** In `web/index.html`, please link the new favicon and OpenGraph metadata created in `web/public/experience/`:
  ```html
  <link rel="icon" type="image/svg+xml" href="/experience/favicon.svg" />
  <meta property="og:image" content="/experience/og-image.svg" />
  <meta property="og:title" content="ShadowScope — AI Shadow IT & Agentic Data Exfiltration Scanner" />
  <meta property="og:description" content="Passive zero-decryption scanner for shadow AI tools, unencrypted prompt leaks, and rogue autonomous agent exfiltration." />
  ```
