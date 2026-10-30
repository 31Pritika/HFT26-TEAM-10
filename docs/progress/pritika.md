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

## Next
- **Phase 3: Threat Constellation (`/app/graph`), Compliance Report (`/report`), and NotFound (`*`) per Spec D4, D5b, D6**:
  - 3D Threat Constellation with `react-force-graph-3d`, directional particles, risk coloring, node inspection panel, and 2D fallback.
  - Compliance Report (`/report`) with DPDP, GDPR, SOC 2 scorecards and clean print-to-PDF stylesheet (`@media print`).
  - Glitch-themed NotFound page (`*`).

## Issues
- None.

## Requests to other parts
- None.
