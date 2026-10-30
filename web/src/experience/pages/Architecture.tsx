import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Cpu,
  Layers,
  Lock,
  Zap,
  ExternalLink,
  ChevronRight,
  Laptop,
} from "lucide-react";

interface NodeDetail {
  id: string;
  title: string;
  layer: string;
  file: string;
  badge: string;
  description: string;
  privilege: string;
  details: string[];
}

const NODES_DATA: Record<string, NodeDetail> = {
  process_conn: {
    id: "process_conn",
    title: "Process Map Collector",
    layer: "Layer 1: Telemetry Collectors",
    file: "backend/app/collectors/process_conn.py",
    badge: "Passive Host Inspection",
    description: "Periodically polls OS socket tables via psutil or lsof every 2 seconds to correlate running process PIDs and executable names with destination remote socket addresses.",
    privilege: "User level (own processes) or Root/Admin (system-wide)",
    details: [
      "No kernel drivers or invasive proxies required",
      "Maps python3, node, curl, or IDE processes directly to AI endpoints",
      "Correlates PID lineage with command-line arguments and parent process",
    ],
  },
  ip_cache: {
    id: "ip_cache",
    title: "Active IP Cache Resolver",
    layer: "Layer 1: Telemetry Collectors",
    file: "backend/app/collectors/ip_cache.py",
    badge: "DNS Background Worker",
    description: "Maintains an in-memory IP-to-Provider routing cache by continuously resolving the 30+ canonical AI provider hostnames every 5 minutes.",
    privilege: "No privileges required (standard user DNS)",
    details: [
      "Instant O(1) provider lookups on inbound raw socket events",
      "Supports wildcard subdomains (*.openai.azure.com, *.cursor.sh)",
      "Zero network latency overhead on monitored applications",
    ],
  },
  dns_sni: {
    id: "dns_sni",
    title: "DNS & TLS SNI Sniffer",
    layer: "Layer 1: Telemetry Collectors",
    file: "backend/app/collectors/dns_sni.py",
    badge: "Passive Network Sniffing",
    description: "Inspects plaintext DNS request queries and TLS ClientHello Server Name Indication (SNI) packets on external network interfaces before encryption begins.",
    privilege: "Promiscuous mode / Root / Npcap",
    details: [
      "Zero SSL/TLS decryption: reads plaintext SNI in TLS handshake packet 1",
      "Discovers shadow AI tools instantly on connection initiation",
      "Gracefully disables with health indicator when run without raw packet privileges",
    ],
  },
  loopback: {
    id: "loopback",
    title: "Loopback HTTP Reassembler",
    layer: "Layer 1: Telemetry Collectors",
    file: "backend/app/collectors/loopback.py",
    badge: "Local LLM Telemetry",
    description: "Passively monitors the loopback interface (127.0.0.1) on ports 11434 (Ollama), 1234 (LM Studio), and 8788 for unencrypted local AI inference calls.",
    privilege: "Loopback socket access / Root / Npcap",
    details: [
      "Reassembles chunked HTTP requests and responses in real time",
      "Captures full prompts sent to local workstation LLMs without TLS",
      "Pairs prompt and completion streams with millisecond latency",
    ],
  },
  gateway: {
    id: "gateway",
    title: "Local Gateway Proxy Tap",
    layer: "Layer 1: Telemetry Collectors",
    file: "backend/app/gateway/tap.py",
    badge: "Opt-in Reverse Proxy (:8789)",
    description: "High-performance streaming reverse proxy on port 8789. Developers and agent scripts point their base_url to it for real-time blocking of critical secrets.",
    privilege: "Standard user (binds 127.0.0.1:8789)",
    details: [
      "Zero certificate requirements — client talks standard HTTP/HTTPS upstream",
      "Hardware-speed streaming pass-through for OpenAI, Anthropic, Ollama",
      "policy.block_on_critical: returns instant HTTP 403 when critical leak detected",
    ],
  },
  extension: {
    id: "extension",
    title: "Shadow Sensor Browser Extension",
    layer: "Layer 1: Telemetry Collectors",
    file: "extension/src/background.js",
    badge: "DOM Pre-flight Sensor",
    description: "Manifest V3 Chrome/Edge extension that catches user paste and submit actions inside web AI interfaces (ChatGPT, Claude.ai, Gemini, Perplexity) before browser TLS encryption.",
    privilege: "Browser Extension (DOM API)",
    details: [
      "Evaluates prompts locally with embedded JavaScript parity scanner",
      "Shows instant visual toast notification when credit cards or keys are pasted",
      "Ships masked findings directly to localhost daemon via POST /api/extension/event",
    ],
  },
  ingest: {
    id: "ingest",
    title: "Forensic Evidence Ingest Engine",
    layer: "Layer 1: Telemetry Collectors",
    file: "backend/app/ingest/parser.py",
    badge: "Offline Forensic Ingestion",
    description: "Parses forensic artifacts including Wireshark PCAP/PCAPNG, Chrome/Edge DevTools HAR, JSONL agent transcripts, and raw application log files.",
    privilege: "Standard file upload (POST /api/ingest)",
    details: [
      "Full TCP stream reassembly and HTTP/1.1 chunk decoding",
      "Reconstructs historical sessions and flags telemetry retroactively",
      "Processes 25MB captures in under 200 milliseconds",
    ],
  },
  pipeline: {
    id: "pipeline",
    title: "Central Telemetry Pipeline",
    layer: "Layer 2: Event Normalization",
    file: "backend/app/pipeline.py",
    badge: "Core Orchestrator",
    description: "Ingests normalized Observation objects from all collectors, deduplicates events within a 10-minute sliding window, and enforces security guardrails.",
    privilege: "Internal engine thread",
    details: [
      "Self-exclusion gate: drops ShadowScope's own LLM triage calls (X-ShadowScope-Self)",
      "Applies real-time policy overrides (canary honeytokens, blocked providers)",
      "Correlates raw sockets to registered provider identities",
    ],
  },
  detector: {
    id: "detector",
    title: "High-Throughput Detection Engine",
    layer: "Layer 3: Cryptographic Scanner",
    file: "detector/shadowscope_detect/scanner.py",
    badge: "Pure Python / 5.5 MB/s",
    description: "Executes 32+ vulnerability heuristics across secrets, high-entropy tokens, personal identification numbers, proprietary code, and autonomous agent loops.",
    privilege: "In-memory sandboxed execution",
    details: [
      "Verhoeff (Aadhaar) and Luhn (Credit Cards incl. RuPay) mathematical validation",
      "Shannon entropy analysis with sliding window (H >= 4.0 threshold)",
      "Parses OpenAI, Anthropic, Ollama, LangChain ReAct, and AutoGPT tool call JSON",
    ],
  },
  redactor: {
    id: "redactor",
    title: "Deterministic Redaction Engine",
    layer: "Layer 4: Data Protection Gate",
    file: "detector/shadowscope_detect/redact.py",
    badge: "One-Way Privacy Shield",
    description: "Transforms sensitive strings into irreversibly masked tokens (first 4 + last 2 visible, or 1 + 1 for short values). Raw values never touch persistent storage.",
    privilege: "Internal cryptographic utility",
    details: [
      "Guarantees redacted text re-scans 100% clean across all 32 detector rules",
      "Preserves context prefix and suffix so humans can identify key identities",
      "Masks entire private key bodies and PEM certificates",
    ],
  },
  triage: {
    id: "triage",
    title: "Multi-Tier AI Analyst Triage",
    layer: "Layer 4: Intelligence Gate",
    file: "detector/shadowscope_detect/triage/",
    badge: "Air-Gapped Privacy Chain",
    description: "Cascades triage queries through Featherless → Groq → local Ollama → local deterministic rules. Strict gate ensures zero unmasked secrets ever leave the machine.",
    privilege: "External API or Local Ollama socket",
    details: [
      "Triple-pass redaction re-scan: aborts transmission if any match survives",
      "Generates human-readable remediation steps and regulatory impact summary",
      "Full rules fallback operates with 100% fidelity without any external LLM keys",
    ],
  },
  sqlite: {
    id: "sqlite",
    title: "SQLite Database & Event Bus",
    layer: "Layer 5: Storage & Messaging",
    file: "backend/app/db/session.py",
    badge: "WAL Mode / Keyset Paging",
    description: "Persists redacted events, findings, agent sessions, and minute-by-minute risk metrics with keyset pagination and thread-safe publishing.",
    privilege: "Local file I/O (backend/data/shadowscope.db)",
    details: [
      "Write-Ahead Logging (WAL) ensures zero blocking between reads and writes",
      "Auto-pruning policy prevents disk bloat during high-throughput packet bursts",
      "Publishes reactive messages to WebSocket stream in under 2ms",
    ],
  },
  console: {
    id: "console",
    title: "Forensic Experience & Dashboard",
    layer: "Layer 6: Visualization Layer",
    file: "web/src/experience/ & web/src/dashboard/",
    badge: "React 19 / 3D Constellation",
    description: "Real-time reactive console providing live packet telemetry feeds, 3D WebGL threat constellation, interactive threat playground, and one-click PDF compliance reports.",
    privilege: "Client browser (Port 5173 / Production dist)",
    details: [
      "WebSocket streaming connection with automatic reconnect and backpressure",
      "Awwwards-grade 3D WebGL orbital topology with 2D SVG fallback",
      "Executive compliance attestation reports for DPDP, GDPR, SOC 2, PCI-DSS",
    ],
  },
};

export default function Architecture() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("detector");

  useEffect(() => {
    document.title = "Architecture & Engine Internals — ShadowScope";
  }, []);

  const activeNode = NODES_DATA[selectedNodeId] || NODES_DATA.detector;

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-primary/20 selection:text-primary">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-xl px-4 py-3 sm:px-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-xs font-mono text-muted hover:text-text rounded-md px-2.5 py-1.5 border border-border bg-surface transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Home</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-text text-base">ShadowScope</span>
              <span className="text-xs font-mono text-primary px-2 py-0.5 rounded border border-primary/30 bg-primary/10">
                Engine Architecture
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/app"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-mono text-primary font-semibold transition-colors"
            >
              <span>Threat Console</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="relative px-4 py-12 sm:px-8 sm:py-16 border-b border-border bg-bg-2/50 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.08)_0%,_transparent_70%)] pointer-events-none" />
        <div className="mx-auto max-w-5xl text-center space-y-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-mono text-primary">
            <Cpu className="h-3.5 w-3.5" />
            <span>Zero-Decryption Kernel & Network Architecture</span>
          </div>

          <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tight text-text">
            How ShadowScope Sees AI Exfiltration <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-danger">
              Without Breaking TLS Encryption
            </span>
          </h1>

          <p className="text-sm sm:text-base text-muted max-w-3xl mx-auto leading-relaxed font-sans">
            Traditional enterprise SSL proxies break developer CLI tools, trigger certificate pinning errors, and violate user privacy.
            ShadowScope fuses host socket metadata, unencrypted TLS handshakes, loopback sniffers, and DOM sensors into a unified real-time pipeline.
          </p>
        </div>
      </section>

      {/* SECTION 1: INTERACTIVE ANIMATED SVG PIPELINE DIAGRAM */}
      <section className="px-4 py-12 sm:px-8 mx-auto max-w-7xl">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-text flex items-center gap-2.5">
              <Layers className="h-5 w-5 text-primary" />
              Interactive Architectural Topology
            </h2>
            <p className="text-xs font-mono text-muted mt-1">
              Select any component to inspect its implementation, file path, privilege requirements, and telemetry model.
            </p>
          </div>
          <span className="text-xs font-mono text-primary px-3 py-1 rounded-full border border-primary/30 bg-primary/10">
            Click / Tap Node for Deep Inspection
          </span>
        </div>

        {/* Diagram + Node Explanation Card Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* SVG Diagram Canvas */}
          <div className="lg:col-span-8 rounded-2xl border border-border bg-bg-2 p-4 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            {/* Ambient Background Grid */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />

            <svg
              viewBox="0 0 880 560"
              className="w-full h-auto select-none"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="cyanLine" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.8" />
                </linearGradient>

                <linearGradient id="accentLine" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#FF3B5C" stopOpacity="0.8" />
                </linearGradient>

                <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Edge Connection Paths with Animated Packets */}
              <g className="edges opacity-40">
                {/* Collectors to Pipeline (x: 180 -> x: 270) */}
                {[55, 115, 175, 235, 295, 355, 415].map((y, i) => (
                  <path
                    key={`c-p-${i}`}
                    d={`M 180 ${y} C 220 ${y}, 230 250, 270 250`}
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Pipeline to Detector */}
                <path
                  d="M 390 250 L 460 250"
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth="2"
                />

                {/* Detector to Redactor (down) and Storage (right) */}
                <path
                  d="M 520 285 L 520 370"
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="1.8"
                  strokeDasharray="3 3"
                />
                <path
                  d="M 580 250 L 650 250"
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="2"
                />

                {/* Redactor to Triage */}
                <path
                  d="M 580 400 L 650 400"
                  fill="none"
                  stroke="#FF3B5C"
                  strokeWidth="1.5"
                />

                {/* Storage to Console */}
                <path
                  d="M 770 250 L 800 250"
                  fill="none"
                  stroke="#34D399"
                  strokeWidth="2"
                />
              </g>

              {/* Animated telemetry dots along pipeline */}
              <circle r="3" fill="#22D3EE" filter="url(#softGlow)">
                <animateMotion
                  path="M 180 115 C 220 115, 230 250, 270 250 L 460 250 L 650 250 L 800 250"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle r="3" fill="#FF3B5C" filter="url(#softGlow)">
                <animateMotion
                  path="M 180 295 C 220 295, 230 250, 270 250 L 520 250 L 520 370 L 650 400"
                  dur="3.2s"
                  repeatCount="indefinite"
                />
              </circle>

              {/* LAYER 1: COLLECTORS (Column 1) */}
              <text x="30" y="24" className="text-[10px] font-mono fill-muted uppercase tracking-wider">
                Telemetry Sources & Collectors
              </text>

              {[
                { id: "process_conn", label: "Process Map (psutil)", sub: "Correlates PID to socket", y: 35 },
                { id: "ip_cache", label: "IP Cache Resolver", sub: "Pre-resolved provider IPs", y: 95 },
                { id: "dns_sni", label: "DNS / TLS SNI Sniffer", sub: "Plaintext ClientHello", y: 155 },
                { id: "loopback", label: "Loopback HTTP (:11434)", sub: "Ollama / local LLMs", y: 215 },
                { id: "gateway", label: "Local Gateway (:8789)", sub: "Reverse proxy + block", y: 275 },
                { id: "extension", label: "Browser Extension", sub: "Chrome & Edge sensor", y: 335 },
                { id: "ingest", label: "Forensic Ingest", sub: "PCAP / HAR / JSONL", y: 395 },
              ].map((c) => {
                const isSelected = selectedNodeId === c.id;
                return (
                  <g
                    key={c.id}
                    transform={`translate(30, ${c.y})`}
                    onClick={() => setSelectedNodeId(c.id)}
                    className="cursor-pointer group"
                  >
                    <rect
                      width="150"
                      height="46"
                      rx="6"
                      fill={isSelected ? "#121622" : "#0B0D14"}
                      stroke={isSelected ? "#22D3EE" : "rgba(255,255,255,0.12)"}
                      strokeWidth={isSelected ? "1.8" : "1"}
                      className="transition-all"
                    />
                    <text x="12" y="20" className={`text-[11px] font-mono font-semibold ${isSelected ? "fill-primary font-bold" : "fill-text"}`}>
                      {c.label}
                    </text>
                    <text x="12" y="34" className="text-[9px] font-mono fill-muted">
                      {c.sub}
                    </text>
                  </g>
                );
              })}

              {/* LAYER 2: PIPELINE (Column 2) */}
              <g
                transform="translate(270, 215)"
                onClick={() => setSelectedNodeId("pipeline")}
                className="cursor-pointer"
              >
                <rect
                  width="120"
                  height="70"
                  rx="8"
                  fill={selectedNodeId === "pipeline" ? "#121622" : "#0B0D14"}
                  stroke={selectedNodeId === "pipeline" ? "#22D3EE" : "rgba(34,211,238,0.4)"}
                  strokeWidth={selectedNodeId === "pipeline" ? "2" : "1.2"}
                />
                <text x="15" y="28" className="text-[12px] font-mono font-bold fill-primary">
                  Pipeline.py
                </text>
                <text x="15" y="44" className="text-[9px] font-mono fill-text">
                  Dedupe & Matching
                </text>
                <text x="15" y="58" className="text-[9px] font-mono fill-muted">
                  Self-exclusion filter
                </text>
              </g>

              {/* LAYER 3: DETECTOR (Column 3) */}
              <g
                transform="translate(460, 215)"
                onClick={() => setSelectedNodeId("detector")}
                className="cursor-pointer"
              >
                <rect
                  width="120"
                  height="70"
                  rx="8"
                  fill={selectedNodeId === "detector" ? "#121622" : "#0B0D14"}
                  stroke={selectedNodeId === "detector" ? "#8B5CF6" : "rgba(139,92,246,0.5)"}
                  strokeWidth={selectedNodeId === "detector" ? "2" : "1.5"}
                />
                <text x="15" y="28" className="text-[12px] font-mono font-bold fill-accent">
                  Detector 0.2.0
                </text>
                <text x="15" y="44" className="text-[9px] font-mono fill-text">
                  Regex + Luhn/Verhoeff
                </text>
                <text x="15" y="58" className="text-[9px] font-mono fill-muted">
                  Agent Analyzer + Code
                </text>
              </g>

              {/* LAYER 4: REDACTOR & TRIAGE (Branch Down) */}
              <g
                transform="translate(460, 370)"
                onClick={() => setSelectedNodeId("redactor")}
                className="cursor-pointer"
              >
                <rect
                  width="120"
                  height="60"
                  rx="8"
                  fill={selectedNodeId === "redactor" ? "#121622" : "#0B0D14"}
                  stroke={selectedNodeId === "redactor" ? "#FF3B5C" : "rgba(255,59,92,0.4)"}
                  strokeWidth={selectedNodeId === "redactor" ? "2" : "1"}
                />
                <text x="15" y="25" className="text-[11px] font-mono font-bold fill-danger">
                  Redactor Gate
                </text>
                <text x="15" y="40" className="text-[9px] font-mono fill-text">
                  1-Way Masking
                </text>
                <text x="15" y="52" className="text-[9px] font-mono fill-muted">
                  Zero raw storage
                </text>
              </g>

              <g
                transform="translate(650, 370)"
                onClick={() => setSelectedNodeId("triage")}
                className="cursor-pointer"
              >
                <rect
                  width="130"
                  height="60"
                  rx="8"
                  fill={selectedNodeId === "triage" ? "#121622" : "#0B0D14"}
                  stroke={selectedNodeId === "triage" ? "#FF3B5C" : "rgba(255,59,92,0.4)"}
                  strokeWidth={selectedNodeId === "triage" ? "2" : "1"}
                />
                <text x="15" y="25" className="text-[11px] font-mono font-bold fill-amber-400">
                  LLM Triage Chain
                </text>
                <text x="15" y="40" className="text-[9px] font-mono fill-text">
                  Featherless → Groq
                </text>
                <text x="15" y="52" className="text-[9px] font-mono fill-muted">
                  Ollama → Local Rules
                </text>
              </g>

              {/* LAYER 5: STORAGE (Column 4) */}
              <g
                transform="translate(650, 215)"
                onClick={() => setSelectedNodeId("sqlite")}
                className="cursor-pointer"
              >
                <rect
                  width="120"
                  height="70"
                  rx="8"
                  fill={selectedNodeId === "sqlite" ? "#121622" : "#0B0D14"}
                  stroke={selectedNodeId === "sqlite" ? "#34D399" : "rgba(52,211,153,0.4)"}
                  strokeWidth={selectedNodeId === "sqlite" ? "2" : "1.2"}
                />
                <text x="15" y="28" className="text-[12px] font-mono font-bold fill-emerald-400">
                  SQLite (WAL)
                </text>
                <text x="15" y="44" className="text-[9px] font-mono fill-text">
                  Risk & Anomaly Engine
                </text>
                <text x="15" y="58" className="text-[9px] font-mono fill-muted">
                  Thread-safe Bus
                </text>
              </g>

              {/* LAYER 6: CONSOLE (Column 5) */}
              <g
                transform="translate(800, 215)"
                onClick={() => setSelectedNodeId("console")}
                className="cursor-pointer"
              >
                <rect
                  width="70"
                  height="70"
                  rx="8"
                  fill={selectedNodeId === "console" ? "#121622" : "#0B0D14"}
                  stroke={selectedNodeId === "console" ? "#22D3EE" : "rgba(34,211,238,0.5)"}
                  strokeWidth={selectedNodeId === "console" ? "2" : "1.2"}
                />
                <text x="10" y="32" className="text-[11px] font-mono font-bold fill-primary">
                  Console
                </text>
                <text x="10" y="48" className="text-[9px] font-mono fill-text">
                  Web & WS
                </text>
                <text x="10" y="60" className="text-[9px] font-mono fill-muted">
                  3D View
                </text>
              </g>
            </svg>
          </div>

          {/* Node Detail Explanation Card */}
          <div className="lg:col-span-4 rounded-2xl border border-border bg-bg-2/95 p-6 backdrop-blur-xl shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <span className="font-mono text-xs uppercase px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
                {activeNode.layer}
              </span>
              <span className="font-mono text-[10px] text-muted">Node ID: {activeNode.id}</span>
            </div>

            <h3 className="font-display text-xl font-bold text-text mb-1">{activeNode.title}</h3>
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {activeNode.badge}
              </span>
            </div>

            <p className="text-xs text-muted leading-relaxed mb-4">{activeNode.description}</p>

            <div className="space-y-3 pt-3 border-t border-border">
              <div>
                <span className="text-[10px] font-mono uppercase text-muted block mb-1">Source Code Location</span>
                <code className="text-xs font-mono text-primary bg-surface-solid px-2 py-1 rounded block truncate border border-border">
                  {activeNode.file}
                </code>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-muted block mb-1">Execution Privileges</span>
                <p className="text-xs text-text font-mono bg-surface/50 p-2 rounded border border-border/60">
                  {activeNode.privilege}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-muted block mb-1.5">Architectural Capabilities</span>
                <ul className="space-y-1.5">
                  {activeNode.details.map((detail, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-muted">
                      <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: WHY NO SSL DECRYPTION? */}
      <section className="px-4 py-16 sm:px-8 border-t border-border bg-bg-2/40">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="font-mono text-xs uppercase px-3 py-1 rounded-full border border-danger/30 bg-danger/10 text-danger">
              Architectural Paradigm
            </span>
            <h2 className="font-display text-2xl sm:text-4xl font-black text-text">
              Why Zero SSL Decryption is the Future of AI Security
            </h2>
            <p className="text-sm text-muted leading-relaxed font-sans">
              For 15 years, enterprise security relied on MITM proxies that decrypt every packet by installing corporate root certificates.
              In the modern AI and agentic software stack, that model is fundamentally broken.
            </p>
          </div>

          {/* 4 Pillars of Failure */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-surface/40 p-5 backdrop-blur-md">
              <div className="h-9 w-9 rounded-lg border border-danger/30 bg-danger/10 flex items-center justify-center text-danger mb-3">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h3 className="font-display font-bold text-text text-base mb-1.5">Certificate Pinning</h3>
              <p className="text-xs text-muted leading-relaxed">
                Developer tools, Python <code className="text-primary font-mono">requests</code>, Ollama, Cursor, and CLI clients hardcode their trust stores. MITM proxies break these tools with catastrophic TLS handshake failures.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface/40 p-5 backdrop-blur-md">
              <div className="h-9 w-9 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-display font-bold text-text text-base mb-1.5">Massive Privacy Exposure</h3>
              <p className="text-xs text-muted leading-relaxed">
                Decryption proxies inspect everything indiscriminately: employee banking, medical records, and private communications. Storing decrypted traffic creates an enormous regulatory compliance liability.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface/40 p-5 backdrop-blur-md">
              <div className="h-9 w-9 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-center text-primary mb-3">
                <Laptop className="h-5 w-5" />
              </div>
              <h3 className="font-display font-bold text-text text-base mb-1.5">Fragile Infrastructure</h3>
              <p className="text-xs text-muted leading-relaxed">
                Requires enterprise MDM software, root CA deployment across every machine, complex proxy pac scripts, and completely fails when developers connect from home networks or mobile hotspots.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface/40 p-5 backdrop-blur-md">
              <div className="h-9 w-9 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-display font-bold text-text text-base mb-1.5">ShadowScope Approach</h3>
              <p className="text-xs text-muted leading-relaxed">
                Passive correlation: matches OS processes with unencrypted TLS ClientHello SNI headers, monitors loopback ports, and catches DOM pastes before the browser encrypts. Fast, silent, and unbreakable.
              </p>
            </div>
          </div>

          {/* Comparison Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-border bg-bg-2 shadow-xl">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-surface/80 text-[10px] uppercase text-muted">
                  <th className="p-3.5">Security Dimension</th>
                  <th className="p-3.5 text-danger">Traditional Decryption Proxy (MITM)</th>
                  <th className="p-3.5 text-primary">ShadowScope Passive Egress Monitor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="p-3.5 font-bold text-text">Developer Tool Compatibility</td>
                  <td className="p-3.5 text-muted">❌ Breaks CLI tools, Python requests, Pip, Git, Ollama</td>
                  <td className="p-3.5 text-emerald-400 font-semibold">✅ 100% compatible; zero TLS certificate tampering</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-text">Root Certificate Requirements</td>
                  <td className="p-3.5 text-muted">❌ Mandatory custom root CA deployed to every client OS</td>
                  <td className="p-3.5 text-emerald-400 font-semibold">✅ Zero root certificates; standard OS privileges</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-text">Localhost & Workstation LLMs</td>
                  <td className="p-3.5 text-muted">❌ Blind to Ollama, LM Studio, and local agent traffic</td>
                  <td className="p-3.5 text-emerald-400 font-semibold">✅ Dedicated loopback reassembler on ports 11434, 1234</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-text">User Privacy & Personal Data</td>
                  <td className="p-3.5 text-muted">❌ Indiscriminately decrypts personal banking and health</td>
                  <td className="p-3.5 text-emerald-400 font-semibold">✅ Only watches verified AI provider IP/SNI signatures</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-text">Autonomous Agent Loops</td>
                  <td className="p-3.5 text-muted">❌ Sees requests as disconnected HTTP calls</td>
                  <td className="p-3.5 text-emerald-400 font-semibold">✅ Correlates child shells, tool calls, and file access</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 3: PRIVACY & AIR-GAPPED SECURITY MODEL */}
      <section className="px-4 py-16 sm:px-8 mx-auto max-w-6xl">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 sm:p-10 relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-3xl space-y-4 relative z-10">
            <div className="flex items-center gap-2 text-primary font-mono text-xs">
              <ShieldCheck className="h-4 w-4" />
              <span>Cryptographic Privacy Guarantee</span>
            </div>

            <h2 className="font-display text-2xl sm:text-3xl font-black text-text">
              The Strict Redaction & Air-Gapped Intelligence Model
            </h2>

            <p className="text-sm text-muted leading-relaxed font-sans">
              ShadowScope is engineered under an immutable security covenant: <strong>raw credentials and personal identification numbers never reach persistent disk storage or external network LLMs.</strong>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="rounded-xl border border-border bg-bg-2 p-4">
                <div className="font-mono text-xs font-bold text-text mb-1">1. In-Memory Sanitization</div>
                <p className="text-[11px] text-muted">
                  All 32 regex rules, Luhn, and Verhoeff passes run locally in Python. SQLite only stores masked text.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-bg-2 p-4">
                <div className="font-mono text-xs font-bold text-text mb-1">2. LLM Triage Gate</div>
                <p className="text-[11px] text-muted">
                  Triple-pass redaction re-scan verifies context snippet is 100% clean. If any token survives, transmission aborts.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-bg-2 p-4">
                <div className="font-mono text-xs font-bold text-text mb-1">3. Air-Gapped Operation</div>
                <p className="text-[11px] text-muted">
                  Can run 100% offline using local Ollama (<code className="text-primary">llama3.2:3b</code>) or deterministic rules without internet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: TECH STACK BADGES */}
      <section className="px-4 py-12 sm:px-8 border-t border-border bg-bg-2/30">
        <div className="mx-auto max-w-6xl space-y-6">
          <h2 className="font-display text-xl font-bold text-text text-center">Engine Technology Stack</h2>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {[
              { name: "Python 3.11+", role: "Core Engine", bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
              { name: "FastAPI", role: "REST & WebSockets", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
              { name: "SQLite WAL", role: "Thread-Safe Storage", bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
              { name: "Scapy & psutil", role: "Telemetry Collectors", bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-400" },
              { name: "React 19 & Vite", role: "Experience UI", bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-400" },
              { name: "Three.js & R3F", role: "3D Constellation", bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
              { name: "react-force-graph-3d", role: "Orbital Topology", bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400" },
              { name: "Motion (framer-motion)", role: "Microinteractions", bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400" },
              { name: "Tailwind CSS", role: "Design Tokens", bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400" },
              { name: "Manifest V3", role: "Browser Sensor", bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
              { name: "Ollama & Groq", role: "AI Triage Chain", bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400" },
            ].map((tech) => (
              <span
                key={tech.name}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono ${tech.bg} ${tech.border} ${tech.text}`}
              >
                <span className="font-bold">{tech.name}</span>
                <span className="text-[10px] text-muted border-l border-border pl-1.5">{tech.role}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5: TEAM CREDITS */}
      <section className="px-4 py-16 sm:px-8 border-t border-border mx-auto max-w-6xl">
        <div className="text-center space-y-3 mb-10">
          <span className="font-mono text-xs uppercase px-3 py-1 rounded-full border border-border bg-surface text-muted">
            Hacktoberfest @ CBIT
          </span>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-text">Team "git push n pray"</h2>
          <p className="text-xs font-mono text-muted">Architected, engineered, and shipped in 16 hours</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              name: "Vishwak Boddukuri",
              role: "Part A: Core Engine & Collectors",
              focus: "FastAPI daemon, SQLite WAL, packet collectors, risk & anomaly engine, gateway proxy tap",
            },
            {
              name: "Aaraadhyaa Reddy",
              role: "Part B: Detection Intel & Attack Simulator",
              focus: "shadowscope_detect library, 32+ validators, attack simulator, Chrome/Edge extension",
            },
            {
              name: "Kevin",
              role: "Part C: Dashboard Console & Telemetry",
              focus: "AppShell, Live Traffic stream, Alerts Center, AI Analyst triage UX, forensic ingest",
            },
            {
              name: "Pritika Agarwal",
              role: "Part D: Experience Layer & 3D Visuals",
              focus: "Cinematic Landing with 3D hero, Threat Constellation, Threat Playground, Compliance Report PDF",
            },
          ].map((m) => (
            <div key={m.name} className="rounded-xl border border-border bg-bg-2 p-5 backdrop-blur-md flex flex-col justify-between">
              <div>
                <h3 className="font-display font-semibold text-text text-base">{m.name}</h3>
                <div className="font-mono text-xs text-primary mt-0.5 mb-2.5">{m.role}</div>
                <p className="text-xs text-muted leading-relaxed font-sans">{m.focus}</p>
              </div>
              <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between text-[11px] font-mono text-muted">
                <span>git push n pray</span>
                <span className="text-emerald-400">Verified</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4 text-center text-xs font-mono text-muted">
        <div>ShadowScope Engine Architecture & Telemetry Specification v0.2.0</div>
        <div className="mt-1">Built with precision for Hacktoberfest @ CBIT · 2026</div>
      </footer>
    </div>
  );
}
