# 🏛️ ShadowScope — System Architecture & Technical Specifications

> **Document Version:** 2.0.0  
> **Team:** git push n pray (`TEAM-10`) · CBIT Hacktoberfest '26  
> **Target System:** ShadowScope AI Shadow IT & Agentic Data Exfiltration Scanner

---

## 1. Executive Summary & Problem Space

Enterprise software development and white-collar workflows have fundamentally transformed around Generative AI. Engineering teams configure autonomous agent loops (Cursor, Claude Code, Aider, LangChain, AutoGPT) that possess shell command execution, filesystem write, and network permissions. Employees paste database queries, customer spreadsheets, and proprietary code into browser-based chatbots.

For fifteen years, enterprise security organizations tackled data loss prevention (DLP) using **SSL/TLS Decryption Proxies** (MITM proxying with enterprise root certificate authorities). In the modern AI era, that paradigm has broken down completely:

1. **Developer Tooling Breaks on Certificate Pinning**: Command-line interfaces (`curl`, `gh`, `aws`, Python `requests`, Ollama, IDE extensions) hardcode trusted root stores or utilize pinned certificates. MITM decryption proxies cause immediate, catastrophic TLS handshake failures (`CERTIFICATE_VERIFY_FAILED`).
2. **Severe Privacy & Compliance Liabilities**: Decrypting all outbound traffic indiscriminately captures personal banking transactions, healthcare records, and employee passwords, creating massive regulatory non-compliance under the **India DPDP Act 2023** and **EU GDPR**.
3. **Total Blindness to Localhost AI**: Workstations running local models via Ollama or LM Studio communicate over `127.0.0.1:11434`, bypassing enterprise firewalls and network perimeters entirely.
4. **Autonomous Machine-Speed Exfiltration**: Unlike human browsing, rogue agentic loops can execute multi-step shell recon, extract SSH private keys, and exfiltrate database contents within sub-second intervals.

**ShadowScope** is an enterprise-grade, zero-decryption cybersecurity platform that discovers, monitors, and blocks AI shadow IT and agentic data exfiltration without installing custom root certificates, without decrypting TLS payloads, and with a verifiable mathematical zero-knowledge privacy model.

---

## 2. The Zero-Decryption Philosophy

ShadowScope achieves complete visibility into AI egress traffic through **telemetry correlation across four orthogonal planes**:

```
[OS Socket Lineage]       psutil / lsof polls correlate PID, binary, user, and parent process
          +
[Unencrypted Handshakes]  DNS queries & TLS ClientHello Server Name Indication (SNI) reveal destination
          +
[Loopback Sniffing]       Unencrypted HTTP reassembly on 127.0.0.1:11434 captures local LLM calls
          +
[DOM Pre-Flight Sensor]   Browser extension catches paste events in the DOM before browser TLS
          =
═════════════════════════════════════════════════════════════════════════════════════════════════
          COMPLETE VISIBILITY WITH ZERO CERTIFICATE TAMPERING
```

### Comparative Analysis: ShadowScope vs. Legacy MITM Proxies

| Dimension | Traditional SSL MITM Proxy | ShadowScope Passive Architecture |
| :--- | :--- | :--- |
| **Certificate Requirements** | Custom root CA installed on every endpoint OS | **Zero root certificates**; operates on standard OS socket APIs |
| **CLI & Agent Compatibility** | Breaks Python `requests`, Git, Curl, Ollama, Cursor | **100% compatible**; traffic passes through unmodified |
| **Localhost LLM Telemetry** | 100% blind to loopback ports | **Native loopback sniffer** on ports 11434, 1234, 8788 |
| **Data Privacy Stance** | Decrypts and exposes personal passwords & banking | **Passive filtering**; only inspects verified AI provider signatures |
| **Agent Behavior Tracking** | Disconnected HTTP requests | **Deep correlation** of child shells, tool calls, and file reads |
| **Endpoint Performance** | Significant latency overhead (crypto termination) | **Zero inline latency** (passive sniffing & async processing) |

---

## 3. Six-Layer System Topology

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Telemetry Collection (Host, Network, Loopback, DOM, Ingest)             │
│   ├─ process_conn.py   (psutil / lsof socket table poller)                       │
│   ├─ ip_cache.py       (5-minute O(1) provider DNS resolver)                    │
│   ├─ dns_sni.py        (Passive TLS ClientHello SNI packet sniffer)              │
│   ├─ loopback.py       (Localhost chunked HTTP stream reassembler)               │
│   ├─ gateway/tap.py    (Opt-in reverse proxy on port 8789 with block_on_critical)│
│   ├─ extension/        (Manifest V3 Shadow Sensor for Chrome & Edge DOM)        │
│   └─ ingest/           (Forensic parser for PCAP, HAR, JSONL, log files)        │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Layer 2: Core Ingestion Pipeline (app/pipeline.py)                              │
│   ├─ Self-Exclusion Gate (X-ShadowScope-Self: 1 filter)                         │
│   ├─ Provider Matcher (30+ canonical fingerprints in providers.yaml)            │
│   └─ Sliding Window Deduplication (10-minute duplicate suppression)             │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Layer 3: Cryptographic Detection Engine (shadowscope_detect)                    │
│   ├─ Secrets Heuristics (20+ rules: AWS, OpenAI, Anthropic, GCP, Private Keys)   │
│   ├─ PII Validators (Verhoeff for Aadhaar, Luhn + RuPay for Cards, PAN entity)  │
│   ├─ Shannon Entropy Scanner (H >= 4.0 threshold sliding window)                │
│   ├─ Proprietary Code Classifier (5+ lines code signals + copyright markers)    │
│   └─ Agent Action Analyzer (ReAct, OpenAI, Anthropic, AutoGPT, Shell Spawns)    │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Layer 4: Deterministic Redaction & Air-Gapped Triage Gate                       │
│   ├─ One-Way Redaction Engine (First 4 + Last 2 visible; 1 + 1 under 12 chars)  │
│   ├─ Re-Scan Cleanliness Gate (Guarantees masked text triggers 0 detector rules)│
│   └─ Multi-Tiered AI Analyst Triage (Featherless → Groq → Ollama → Rules)       │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Layer 5: Storage & Threat Risk Scoring (backend/app/db/)                         │
│   ├─ SQLite in WAL Mode (Thread-safe, keyset pagination, auto-pruning)          │
│   ├─ Risk Scoring Engine (Master Spec §9 weights + exponential decay)           │
│   ├─ Anomaly Detector (z-score > 3 baseline, burst 5MB in 60s trigger)          │
│   ├─ Regulatory Compliance Evaluator (DPDP 2023, GDPR, SOC 2, PCI-DSS, ISO27001)│
│   └─ Thread-Safe In-Memory Event Bus (p50 2ms latency)                          │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Layer 6: Real-Time Experience Layer (web/src/)                                  │
│   ├─ FastAPI REST & WebSocket Streaming Service (/api/ws/stream)                │
│   ├─ 3D Threat Constellation (WebGL orbital topology via react-force-graph-3d)  │
│   ├─ 2D Concentric Topology Fallback (SVG radar layout for mobile & a11y)       │
│   ├─ Interactive Threat Playground (/playground with simulated packet flight)   │
│   ├─ Executive Compliance Report (/report with high-contrast print PDF layout)  │
│   └─ Real-Time Telemetry Console (/app with live inspection drawer & alerts)    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Deep Component Specifications

### 4.1 Layer 1: Telemetry Collection Framework

Each collector operates on an isolated background thread managed by FastAPI's application lifespan. If a collector lacks operating system privileges (e.g. non-root user running without raw packet permissions), it reports a structured `reason` in `/api/health` and continues operating in reduced mode without crashing the daemon.

1. **`process_conn.py` (Process Connection Poller)**:
   - Queries kernel socket tables via `psutil.net_connections(kind="inet")` every 2 seconds.
   - On permission denial (e.g. unprivileged user on macOS), automatically falls back to parsing `lsof -i -P -n` for the user's active processes.
   - Resolves remote IP/port pairs to destination AI providers using the IP Cache.
   - Extracts process binary metadata: `pid`, `name`, `exe`, `user`, `parent_name`, and command-line hints.
2. **`ip_cache.py` (IP Cache Resolver)**:
   - Proactively resolves all hostnames from `providers.yaml` every 5 minutes into an in-memory reverse lookup map.
   - Supports exact hosts (`api.openai.com`) and wildcard domain patterns (`*.openai.azure.com`, `*.cursor.sh`).
   - Ensures incoming socket events require zero synchronous DNS lookups, maintaining sub-millisecond pipeline processing.
3. **`dns_sni.py` (DNS & TLS SNI Sniffer)**:
   - Uses Scapy in promiscuous mode to passively inspect UDP port 53 (DNS queries) and TCP port 443 (TLS ClientHello).
   - Extracts the plaintext Server Name Indication (SNI) extension byte buffer from TLS record layer handshake packet 1.
   - Operates completely out-of-band: zero latency impact on monitored applications.
4. **`loopback.py` (Loopback HTTP Reassembler)**:
   - Monitors `127.0.0.1` on ports 11434 (Ollama), 1234 (LM Studio), and 8788.
   - Reassembles TCP segments and parses chunked `Transfer-Encoding: chunked` HTTP/1.1 request bodies and streaming responses.
   - Flags prompt payloads and local model completions, tagging simulator events with `X-ShadowScope-Sim: 1`.
5. **`gateway/tap.py` (Local Gateway Reverse Proxy)**:
   - Binds to `127.0.0.1:8789`. Developer scripts and local agents configure `base_url="http://localhost:8789/{provider_id}/{path}"`.
   - Streaming pass-through proxy: client communicates over standard HTTP/HTTPS with zero certificate requirements.
   - When policy flag `block_on_critical: true` is active, evaluates request payloads before forwarding. Requests containing critical credentials (e.g. AWS secret keys) are terminated with an immediate `HTTP 403 Forbidden` (`{"error": "blocked by ShadowScope: AWS access key"}`).
6. **`extension/` (Shadow Sensor Chrome & Edge Sensor)**:
   - Manifest V3 browser extension monitoring web interactions on `chatgpt.com`, `claude.ai`, `gemini.google.com`, `perplexity.ai`, and `deepseek.com`.
   - Listens to clipboard `paste` and form `submit` events directly in the DOM.
   - Evaluates text using an embedded JavaScript port (`scanner.js`) matching the Python scanner with 100% parity across 340 test fixtures.
   - Renders instant visual toast alerts before submission and dispatches telemetry to `POST /api/extension/event`.
7. **`ingest/` (Forensic Upload Engine)**:
   - Supports offline ingestion of Wireshark `.pcap`/`.pcapng`, Chrome `.har`, `.jsonl` agent transcripts, and raw text logs.
   - Full TCP session reassembly, TLS SNI extraction, and HTTP decoding capable of parsing 25 MB captures in under 200 ms.

---

### 4.2 Layer 2 & 3: Detection Intelligence (`shadowscope_detect`)

The detection library is a zero-dependency, pure Python package engineered for high-throughput stream scanning (tested at **5.5 MB/s**, scanning 1 MB of prose in 110–160 ms).

#### 32+ Detection Rules Catalog

```
┌─────────────────────────┬────────────────────────────────────────────────────────┐
│ Category                │ Subtypes & Algorithmic Validation Logic                │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ Cloud & API Secrets     │ aws_access_key (AKIA...), aws_secret_key (contextual), │
│                         │ openai_key (sk-...), anthropic_key (sk-ant-...),      │
│                         │ google_api_key (AIza...), github_token (ghp/gho/ghs),  │
│                         │ slack_token (xoxb/xoxp), stripe_key (live=crit, test), │
│                         │ hf_token (hf_...), groq_key (gsk_...), npm_token,      │
│                         │ sendgrid_key (SG...), azure_conn_string,               │
│                         │ gcp_service_account (JSON private_key_id parser)       │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ Cryptographic Keys      │ private_key (PEM/RSA/EC/OpenSSH full body mask),       │
│                         │ db_connection_url (URI parser rejecting placeholders), │
│                         │ jwt (Decodes alg and exp; never echoes iss or sub),    │
│                         │ generic_secret_assignment (Entropy >= 3.0 or len >= 16)│
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ Personal Data (PII)     │ credit_card (Luhn algorithm + IIN check incl. RuPay),  │
│                         │ aadhaar (Full Verhoeff checksum algorithm),            │
│                         │ pan (Permanent Account Number 4th entity char check),  │
│                         │ us_ssn (Area/group validation, excludes 000/666),      │
│                         │ bulk_pii (>= 5 emails or >= 3 Aadhaar/PAN threshold),  │
│                         │ email, phone_in (+91), upi_id, gstin, passport_in,     │
│                         │ ifsc, private_ip (RFC1918), internal_host (.local)    │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ Code & Canaries         │ canary_token (Matches policy canary honeytokens),       │
│                         │ proprietary_code (5+ lines code + Confidential header),│
│                         │ source_code (5+ lines Python/JS/Java/SQL/C signals)    │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ Agent Behavioral Risks  │ destructive_command (rm -rf, mkfs, dd, format),        │
│                         │ remote_code_exec (curl | bash, wget | sh, iex),        │
│                         │ sensitive_file_read (~/.ssh/id_rsa, /etc/shadow, SAM), │
│                         │ privilege_escalation (sudo, chmod 777, chown root),    │
│                         │ persistence (crontab, systemd, launchd, autorun),      │
│                         │ recon (whoami, ifconfig, netstat, env, ps aux),        │
│                         │ unverified_tool_call, autonomous_loop (>= 3 cycles)   │
└─────────────────────────┴────────────────────────────────────────────────────────┘
```

#### False-Positive Mitigation Heuristics
- **Overlap Resolution**: More specific rules always supersede generic rules (e.g. `api_key = "sk-..."` produces a single `openai_key` finding, not also a generic secret finding).
- **Placeholder Rejection**: Tokens like `${API_KEY}`, `<your-token>`, `your_key_here`, and `os.environ[...]` are detected and ignored.
- **Code Context Filtering**: Text strings like `password: str` or `search("what is rm -rf")` are recognized as syntax or queries and not flagged as destructive shell execution.

---

### 4.3 Layer 4: Mathematical Redaction & Air-Gapped AI Triage

#### Redaction Protocol
To prevent data exfiltration within the security monitoring tool itself, ShadowScope guarantees that **raw secrets are never written to disk or echoed in logs**:
- Values $\ge 12$ characters: Retain first 4 and last 2 characters (e.g., `sk-ant-•••••••••••••03`).
- Values $< 12$ characters: Retain first 1 and last 1 character (e.g., `p•••••d`).
- Emails: Transformed into `a••••@d••••.com`.
- Aadhaar Numbers: Formatted into `XXXX XXXX 1234`.
- Private Keys: Entire key bodies between PEM headers are fully masked.

#### The AI Analyst Privacy Gate
When an operator triggers triage analysis on an alert, ShadowScope routes the investigation through an **air-gapped privacy chain**:
1. Only allowlisted finding metadata fields enter the triage prompt (never full observation bodies).
2. The context snippet is redacted via `redact()`.
3. The prompt is re-scanned by `scan_text()` up to three successive times.
4. **Hardened Abort Circuit**: If any sensitive pattern or unmasked token survives the sanitization pass, **zero bytes are dispatched over the network**. Triage immediately falls back to the deterministic local rules engine.

---

### 4.4 Layer 5: Threat Scoring, Compliance & Storage

#### Master Spec §9 Risk Matrix
Every detected observation is scored from 0 to 100 based on finding severities:
- `critical`: **60 points** (AWS keys, private SSH keys, unencrypted credit cards, canary trips)
- `high`: **40 points** (Aadhaar, PAN, proprietary code, destructive shell commands)
- `medium`: **20 points** (Generic secrets, JWTs, single PII, source code)
- `low`: **8 points** (Internal IP addresses, company hostnames)
- `info`: **2 points** (UUID tokens, diagnostic telemetry)

Organization risk scores are computed per minute with exponential decay:
$$\text{Score}_{\text{org}} = \min\left(100, \sum_{\text{findings}} \text{Weight}_i \times \text{Decay}(t_i)\right)$$

Grade Assignment:
- **A** (0–20): Minimal exposure; fully sanctioned providers.
- **B** (21–40): Low risk; occasional unapproved AI tool usage.
- **C** (41–60): Moderate risk; unencrypted source code or high-entropy tokens.
- **D** (61–80): Elevated risk; unapproved shadow AI tools and multiple PII leaks.
- **F** (81–100): Critical exposure; exposed cloud keys, private keys, or rogue agent RCE.

#### Regulatory Mapping Frameworks
- **India DPDP Act 2023**: Mapped to Section 8 (Reasonable Security Safeguards) and Section 8.6 (Breach Readiness).
- **EU GDPR**: Mapped to Article 5 (Data Minimisation) and Article 32 (Security of Processing).
- **AICPA SOC 2**: Mapped to Trust Services Criteria CC6.1 (Logical Access) and CC7.2 (Anomaly Monitoring).
- **PCI-DSS v4.0**: Mapped to Requirement 3 (Account Data Protection) and Requirement 10 (Access Logging).
- **ISO/IEC 27001:2022**: Mapped to Control A.5.14 (Information Transfer) and Control A.8.12 (Data Leakage Prevention).

---

## 5. Security & Deployment Topologies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Local Workstation Mode (Default)                                         │
│    • Binds 127.0.0.1:8787 and 127.0.0.1:5173                                │
│    • Runs collectors for local developer processes                          │
│    • Local SQLite database in backend/data/shadowscope.db                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Team LAN / Headless Mode (--host)                                        │
│    • Start script: ./scripts/start.sh --host                                │
│    • Binds 0.0.0.0:8787 for team-wide telemetry aggregation                 │
│    • Client consoles connect via VITE_API_BASE=http://<host-ip>:8787/api   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Cloud / Demo Evaluation Mode (SHADOWSCOPE_CLOUD=1)                       │
│    • Read-only, zero-maintenance public hackathon deployment               │
│    • Packet sniffers and subprocesses disabled                              │
│    • Serves seeded compliance records and canned attack simulation streams │
│    • Uploads capped at 5 MB; administrative policy mutation endpoints locked │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Verification & Test Metrics

- **Detector Verification**: 1,492 unit and integration tests passing (`pytest detector`).
- **Simulator Verification**: 167 automated scenario execution tests passing (`pytest simulator`).
- **Backend Verification**: 359 FastAPI endpoint and collector pipeline tests passing (`pytest backend`).
- **Frontend Verification**: TypeScript typecheck (`tsc -b`), `oxlint` (0 errors), and automated headless Edge CDP test suite passing with 0 horizontal overflow across 375px, 768px, and 1440px viewports.
- **Wire Audit Test**: Byte-level network wire assertion tests verifying that zero raw secrets from 80 fixture payloads ever leak across external sockets during triage.

---

*Authored by Team **git push n pray** for **CBIT Hacktoberfest '26**.*
