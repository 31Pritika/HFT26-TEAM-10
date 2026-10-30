# 🎬 ShadowScope — 3-Minute Video Demo Script

> **Team:** git push n pray (`TEAM-10`)  
> **Event:** CBIT Hacktoberfest '26  
> **Track:** AI Shadow IT & Agentic Data Exfiltration Scanner  
> **Target Duration:** 2 minutes 55 seconds (< 3:00)

---

## ⏱️ Video Timeline Overview

| Timestamp | Phase | Key Feature / Screen | Core Message |
| :---: | :--- | :--- | :--- |
| **0:00 – 0:15** | The Hook | Landing Page Hero (`/`) | Real-time 3D telemetry catching secrets in flight |
| **0:15 – 0:30** | The Problem | The Problem Section (`/`) | 74% of developers paste secrets; MITM proxies break tools |
| **0:30 – 0:45** | Executive Posture | Console Overview (`/app`) | Enterprise AI visibility, risk grades, active collectors |
| **0:45 – 1:15** | Live Attack Demo | Simulation & Live Telemetry (`/app/simulate` → `/app/live`) | 9 live attack scenarios streaming with zero packet loss |
| **1:15 – 1:40** | Triage & Privacy | Alert Detail & AI Analyst (`/app/alerts/:id`) | True positive verdict with cryptographic redaction proof |
| **1:40 – 2:00** | Autonomous Threat | Rogue Agent Sandbox (`/app/agents`) | 92% autonomy score, dangerous bash commands & Kill Switch |
| **2:00 – 2:20** | Active Defense | Gateway Block & Browser Sensor | HTTP 403 local blocking & pre-flight DOM extension toast |
| **2:20 – 2:45** | Playground & Audit | Threat Playground (`/playground`) → Report (`/report`) | Interactive scanning & one-click DPDP / GDPR PDF report |
| **2:45 – 3:00** | Architecture Close | Architecture Internals (`/architecture`) | Zero SSL decryption; pure host & network intelligence |

---

## 📜 Scene-by-Scene Script

---

### Scene 1: The Hook (0:00 – 0:15)
- **On-Screen Action:**
  - Start on `http://localhost:5173/`.
  - Mouse moves across the Hero 3D glass point-cloud sphere.
  - Camera tilts dynamically via mouse parallax.
  - Point to laptop nodes emitting glowing data packets toward labeled AI provider orbs (OpenAI, Anthropic, Ollama).
  - The cyan scanning ring sweeps down and intercepts an outbound packet, which flashes crimson red (`#FF3B5C`).
- **Narration:**
  > *"Every single day, your engineering team sends your proprietary code, customer PII, and API keys straight to cloud AI providers. And your security team is completely blind to it.  
  > This is **ShadowScope** — the world's first passive, zero-decryption AI shadow IT and agentic data exfiltration scanner."*

---

### Scene 2: The Problem (0:15 – 0:30)
- **On-Screen Action:**
  - Smooth-scroll down using Lenis scroll to "The Problem" section.
  - Reveal stats: 74% unapproved AI adoption, $4.88M average breach cost.
  - Focus on the `TypedLeakyPrompt` widget: watch an employee prompt type out live with an AWS IAM key, and immediately watch ShadowScope apply real-time cryptographic redaction with threat warning pills.
- **Narration:**
  > *"Why can't companies just use traditional SSL decryption proxies? Because developer tools like Cursor, Python, and CLI agents use certificate pinning — enterprise MITM proxies break them completely. ShadowScope solves this without breaking TLS, inspecting unencrypted ClientHello SNI headers, host sockets, and loopback traffic."*

---

### Scene 3: Console Overview (0:30 – 0:45)
- **On-Screen Action:**
  - Click the magnetic CTA button **"Launch Console"** to transition to `/app`.
  - Point to the Hero Risk Gauge (Score 63/100, Grade D).
  - Hover over the 24-hour timeline AreaChart, provider donut chart, and compliance posture bars.
  - Hover over the bottom Collectors status strip showing 6 active collectors running concurrently.
- **Narration:**
  > *"Welcome to the ShadowScope Forensic Console. Immediately, security teams get an executive posture score, real-time egress volume, and a complete breakdown of every unsanctioned model talking to external infrastructure across the enterprise."*

---

### Scene 4: Run Demo Sequence & Live Telemetry (0:45 – 1:15)
- **On-Screen Action:**
  - Click `/app/simulate` in the sidebar.
  - Click the glowing primary button **"Run Full Demo Sequence"**.
  - Show the 9-scenario progress stepper lighting up (`env_file_leak`, `customer_pii_dump`, `rogue_agent`, `gateway_block`...).
  - Rapidly switch to `/app/live`: watch live events populate with streaming highlight animations.
  - Click on a row to slide open the Inspection Drawer: show the process lineage (`python3` PID 2841), provider target, and masked payload preview.
- **Narration:**
  > *"Let's fire up our built-in attack simulator. In seconds, nine real attack scenarios generate localhost traffic. Over our thread-safe WebSocket bus, events stream into the live console at sub-2-millisecond latency. Notice how our inspection drawer correlates the operating system PID and binary directly to the remote AI destination."*

---

### Scene 5: Alert Detail & AI Analyst Triage (1:15 – 1:40)
- **On-Screen Action:**
  - Navigate to `/app/alerts` and click on a Critical alert: `fnd_0001` (*"Agent read a private SSH key"*).
  - In the Alert Detail view, show the Shannon entropy meter, redacted snippet (`read_file ~/.ssh/id_rsa`), and rule remediation checklist.
  - Click **"Ask AI Analyst"**: a cyan scanning shimmer appears, followed by a typewriter reveal of the verdict: `TRUE POSITIVE`.
  - Expand the collapsible box: **"Privacy Proof: What was sent to the LLM"**.
  - Highlight that all token keys were pre-redacted before leaving the host.
- **Narration:**
  > *"When we inspect a critical alert, our AI Analyst triage chain investigates the event. But look at this privacy proof: before anything reaches Groq or local Ollama, our triple-pass redaction engine strips every credential. No raw customer secret ever leaves your perimeter — even during triage."*

---

### Scene 6: Rogue Agent Sandbox & Permissions (1:40 – 2:00)
- **On-Screen Action:**
  - Click `/app/agents` in the sidebar.
  - Select the active LangChain agent session.
  - Point to the **Autonomy Score of 92%**, the red-highlighted permission matrix (Shell: `YES`, FS Write: `YES`, Network: `YES`).
  - Scroll through the action timeline showing an 8-step ReAct loop reading `id_rsa` and attempting to pipe to `sh`.
  - Click the glowing red **"Kill Switch"** button: watch the status instantly morph to `BLOCKED`.
- **Narration:**
  > *"Autonomous agents are the new frontier of data exfiltration. ShadowScope tracks multi-step agent loops, scores their autonomy, and flags unapproved shell executions. When an agent goes rogue, security operators hit the instant Kill Switch to revoke its permissions in real time."*

---

### Scene 7: Gateway Interception & Browser Sensor (2:00 – 2:20)
- **On-Screen Action:**
  - Show `/app/live` displaying the `gateway_block` event: an HTTP 403 Forbidden intercept on port 8789.
  - Switch briefly to a browser window with ChatGPT open:
  - Paste a test credit card and AWS secret into the prompt box.
  - The **Shadow Sensor** extension immediately displays a high-visibility toast alert: *"ShadowScope Intercept: Sensitive Credentials Detected Before Send"*.
- **Narration:**
  > *"For proactive prevention, developers can point their scripts to our Local Gateway on port 8789, which halts requests carrying critical leaks with a 403. And for browser users, our Shadow Sensor extension catches clipboard pastes right in the DOM before the browser can even encrypt the payload."*

---

### Scene 8: Threat Playground & Compliance PDF (2:20 – 2:45)
- **On-Screen Action:**
  - Navigate to `/playground`.
  - Select the **"Customer CSV (India)"** preset.
  - Point out real-time Verhoeff validation on Aadhaar numbers and Luhn checks on RuPay cards.
  - Click **"Simulate sending to ChatGPT"**: watch the packet fly toward the AI orb, get intercepted by the scanning ring, and get stamped **BLOCKED BY SHADOWSCOPE**.
  - Navigate to `/report`: show the executive cover with the animated grade ring and scorecards for DPDP Act 2023, GDPR, and SOC 2.
  - Click **"Download PDF"**: show the clean, monochrome print stylesheet preview in Chrome.
- **Narration:**
  > *"Judges can explore our interactive Threat Playground right in the browser, featuring pattern-valid India PII and animated packet interception. And with one click on our Compliance Report, organizations generate audit-ready PDF scorecards aligned with India's DPDP Act 2023, GDPR, and SOC 2."*

---

### Scene 9: Architecture & Zero-Decryption Close (2:45 – 3:00)
- **On-Screen Action:**
  - Navigate to `/architecture`.
  - Point to the animated SVG pipeline with data packets pulsing along connection paths from Collectors to the SQLite WAL storage and Console.
  - Hover over the **"Process Map"** and **"Zero Decryption"** comparison table.
  - Fade out on the team credits banner: Team **"git push n pray"** · CBIT Hacktoberfest '26.
- **Narration:**
  > *"No root certificates. No broken CLI pipelines. No employee privacy violations. Just mathematical detection, real-time agent containment, and complete enterprise peace of mind.  
  > We are Team **git push n pray**, and this is **ShadowScope**."*

---

## 💡 Presenter Tips & Checklist

1. **Local Setup Check**: Ensure `./scripts/start.sh` is running and `python -m simulator.make_samples` has been run.
2. **Resolution**: Record at **1920×1080** at **60fps** with full screen browser zoom at 100%.
3. **Pacing**: Keep mouse movements steady and fluid; hover over interactive elements for at least 1.5 seconds to let the camera catch animations.
4. **Audio**: Speak with high confidence, clear enunciation, and natural excitement during the packet interception microinteraction.
