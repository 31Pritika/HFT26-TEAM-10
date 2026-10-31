/**
 * Playground — "/playground"
 * Interactive Threat Playground for ShadowScope.
 *
 * Implements:
 * - Debounced client-side scanner (250 ms)
 * - 6 Preset fixtures (safe fake-but-valid data)
 * - Synchronized line-numbered editor with severity-colored underline highlights
 * - Character-morphing Redacted View toggle
 * - Hover ↔ highlight linking between editor and findings panel
 * - Animated Risk Meter & live telemetry stats
 * - "Scan with engine" fallback & diff badge
 * - "Simulate sending to ChatGPT" packet flight microinteraction
 * - Export JSON & Copy Redacted features
 * - Fully responsive (375px → 1920px) & prefers-reduced-motion compliant
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Download,
  Terminal,
  Send,
  Check,
  Cpu,
  Trash2,
  ChevronRight,
  Info,
  Sparkles,
} from "lucide-react";

import { scanText, runScannerSelfTests } from "../lib/scanner";
import type { ScannerResult, ScannerFinding } from "../lib/scanner";
import { PLAYGROUND_PRESETS } from "../lib/presets";
import { PacketFlightModal } from "../components/PacketFlightModal";
import { api, probeEngine } from "../../shared/api";
import type { Severity } from "../../shared/types";

// ── Colors & Themes ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  Severity,
  {
    bg: string;
    border: string;
    text: string;
    underline: string;
    badgeBg: string;
    icon: typeof ShieldAlert;
  }
> = {
  critical: {
    bg: "rgba(223,106,104,0.12)",
    border: "rgba(223,106,104,0.45)",
    text: "#df6a68",
    underline: "#df6a68",
    badgeBg: "rgba(223,106,104,0.2)",
    icon: ShieldAlert,
  },
  high: {
    bg: "rgba(212,145,90,0.12)",
    border: "rgba(212,145,90,0.45)",
    text: "#d4915a",
    underline: "#d4915a",
    badgeBg: "rgba(212,145,90,0.2)",
    icon: AlertTriangle,
  },
  medium: {
    bg: "rgba(201,180,103,0.1)",
    border: "rgba(201,180,103,0.45)",
    text: "#c9b467",
    underline: "#c9b467",
    badgeBg: "rgba(201,180,103,0.2)",
    icon: Info,
  },
  low: {
    bg: "rgba(134,182,154,0.1)",
    border: "rgba(134,182,154,0.4)",
    text: "#86b69a",
    underline: "#86b69a",
    badgeBg: "rgba(134,182,154,0.2)",
    icon: ShieldCheck,
  },
  info: {
    bg: "rgba(96,165,250,0.1)",
    border: "rgba(96,165,250,0.4)",
    text: "#8fb0d8",
    underline: "#8fb0d8",
    badgeBg: "rgba(96,165,250,0.2)",
    icon: Info,
  },
};

export default function Playground() {
  const [text, setText] = useState<string>(PLAYGROUND_PRESETS[0].text);
  const [selectedPreset, setSelectedPreset] = useState<string>(PLAYGROUND_PRESETS[0].id);
  const [redactedView, setRedactedView] = useState<boolean>(false);
  const [hoveredFindingId, setHoveredFindingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "secret" | "pii" | "agent_action" | "source_code">("all");
  const [copied, setCopied] = useState<boolean>(false);
  const [isFlightModalOpen, setIsFlightModalOpen] = useState<boolean>(false);

  // Engine state
  const [engineConnected, setEngineConnected] = useState<boolean>(false);
  const [engineScanning, setEngineScanning] = useState<boolean>(false);
  const [engineDiff, setEngineDiff] = useState<string | null>(null);

  // Sync scroll
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightOverlayRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Check engine connectivity & self test on mount
  useEffect(() => {
    document.title = "Threat Playground · ShadowScope";
    if (import.meta.env.DEV) {
      runScannerSelfTests();
    }
    probeEngine().then((up) => setEngineConnected(up));
  }, []);

  // Debounced client-side scan
  const [scanResult, setScanResult] = useState<ScannerResult>(() => scanText(text));

  useEffect(() => {
    const handler = setTimeout(() => {
      const res = scanText(text);
      setScanResult(res);
      setEngineDiff(null);
    }, 250);
    return () => clearTimeout(handler);
  }, [text]);

  // Synchronize textarea scroll to highlight overlay & line numbers
  const handleScroll = useCallback(() => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (highlightOverlayRef.current) {
      highlightOverlayRef.current.scrollTop = scrollTop;
      highlightOverlayRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  }, []);

  // Filter findings
  const filteredFindings = useMemo(() => {
    if (filterType === "all") return scanResult.findings;
    return scanResult.findings.filter((f) => f.type === filterType);
  }, [scanResult.findings, filterType]);

  // Calculate line numbers
  const lineCount = useMemo(() => {
    return Math.max(text.split("\n").length, 1);
  }, [text]);

  // Copy redacted text
  const handleCopyRedacted = async () => {
    try {
      await navigator.clipboard.writeText(scanResult.redacted_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Export JSON
  const handleExportJson = () => {
    const exportData = {
      scan_timestamp: new Date().toISOString(),
      stats: scanResult.stats,
      risk_score: scanResult.risk_score,
      risk_grade: scanResult.risk_grade,
      findings: scanResult.findings,
      redacted_text: scanResult.redacted_text,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shadowscope-playground-scan-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Scan with live backend engine (if reachable)
  const handleScanWithEngine = async () => {
    setEngineScanning(true);
    try {
      const res = await api.scan(text, "playground");
      const clientCount = scanResult.findings.length;
      const serverCount = res.findings.length;
      if (serverCount === clientCount) {
        setEngineDiff(`Engine matched client (${serverCount} findings)`);
      } else if (serverCount > clientCount) {
        setEngineDiff(`Engine found ${serverCount - clientCount} more`);
      } else {
        setEngineDiff(`Engine found ${serverCount} findings`);
      }
    } catch {
      setEngineDiff("Engine scan failed: using client scanner");
    } finally {
      setEngineScanning(false);
    }
  };

  // Load preset
  const handleSelectPreset = (preset: (typeof PLAYGROUND_PRESETS)[0]) => {
    setSelectedPreset(preset.id);
    setText(preset.text);
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-border bg-bg-2/80 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 group transition-opacity hover:opacity-80"
              aria-label="Back to home"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Eye className="w-4 h-4 text-primary" />
              </div>
              <span className="font-display font-bold text-base hidden sm:inline">
                Shadow<span className="text-primary">Scope</span>
              </span>
            </Link>
            <ChevronRight className="w-4 h-4 text-faint" />
            <span className="font-display font-semibold text-sm text-text flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Threat Playground
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Engine status indicator */}
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-mono border"
              style={{
                background: engineConnected ? "rgba(134,182,154,0.1)" : "rgba(186,215,247,0.08)",
                borderColor: engineConnected ? "rgba(134,182,154,0.3)" : "rgba(186,215,247,0.25)",
                color: engineConnected ? "var(--low)" : "var(--primary)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-sm"
                style={{
                  background: engineConnected ? "var(--low)" : "var(--primary)",
                }}
              />
              {engineConnected ? "Backend Engine Online" : "100% In-Browser Scanner"}
            </div>

            <Link
              to="/app"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-primary text-black font-semibold text-xs transition-all hover:bg-primary/90"
            >
              <Terminal className="w-3.5 h-3.5" />
              Open Console
            </Link>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Presets Bar */}
        <div className="flex flex-col gap-2">

          <div className="flex items-center gap-2 flex-wrap pb-1 scrollbar-none">
            {PLAYGROUND_PRESETS.map((p) => {
              const active = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  className={`px-3 py-2 rounded-[var(--radius-sm)] border text-xs font-medium whitespace-nowrap flex items-center gap-2 transition-all ${
                    active
                      ? "bg-primary/15 border-primary/50 text-text"
                      : "bg-surface border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  <span className="font-display font-semibold">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[var(--radius)] bg-surface-solid/60 border border-border">
          <div className="flex items-center gap-2">
            {/* Redacted View Toggle */}
            <button
              onClick={() => setRedactedView(!redactedView)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold border transition-all ${
                redactedView
                  ? "bg-critical/15 border-critical/40 text-critical"
                  : "bg-surface border-border text-muted hover:text-text"
              }`}
            >
              {redactedView ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  Redacted View (Masked)
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Raw Payload View
                </>
              )}
            </button>

            {/* Simulate Sending to ChatGPT */}
            <button
              onClick={() => setIsFlightModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 text-xs font-semibold transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              Simulate Sending to ChatGPT
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Engine Scan Button */}
            {engineConnected && (
              <button
                onClick={handleScanWithEngine}
                disabled={engineScanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-surface border border-border hover:border-primary/40 text-xs font-mono text-muted hover:text-text transition-all"
              >
                <Cpu className="w-3.5 h-3.5 text-primary" />
                {engineScanning ? "Engine Scanning…" : "Scan with Engine"}
              </button>
            )}

            {engineDiff && (
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-surface border border-primary/30 text-primary">
                {engineDiff}
              </span>
            )}

            {/* Copy Redacted */}
            <button
              onClick={handleCopyRedacted}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-surface border border-border text-xs text-muted hover:text-text transition-all"
              title="Copy Redacted Text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-low" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy Redacted"}
            </button>

            {/* Export JSON */}
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-surface border border-border text-xs text-muted hover:text-text transition-all"
              title="Export Findings JSON"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>

            {/* Clear Button */}
            <button
              onClick={() => setText("")}
              className="p-1.5 rounded-[var(--radius-sm)] bg-surface border border-border text-muted hover:text-critical hover:border-critical/30 transition-all"
              title="Clear Editor"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Dual Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[580px]">
          {/* Left Column: Editor & Line Highlights (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col rounded-[var(--radius)] border border-border bg-[#070913] overflow-hidden relative">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-solid/40 font-mono text-xs text-muted">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-primary/40" />
                <span>input-payload.txt</span>
              </div>
              <div className="flex items-center gap-3">
                <span>{scanResult.stats.lines} lines</span>
                <span>{scanResult.stats.chars} chars</span>
              </div>
            </div>

            {/* Line Numbered Editor Stage */}
            <div className="relative flex-1 flex overflow-hidden min-h-[460px]">
              {/* Line Numbers Column */}
              <div
                ref={lineNumbersRef}
                className="w-12 py-4 select-none font-mono text-xs text-faint text-right pr-3 bg-black/20 border-r border-border/50 overflow-hidden"
                style={{ lineHeight: "1.6rem" }}
                aria-hidden="true"
              >
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Textarea & Overlay Container */}
              <div className="relative flex-1 overflow-hidden">
                {/* Visual Highlights Overlay (behind text or masked) */}
                <div
                  ref={highlightOverlayRef}
                  className="absolute inset-0 p-4 font-mono text-xs sm:text-sm whitespace-pre-wrap break-words pointer-events-none overflow-hidden"
                  style={{
                    lineHeight: "1.6rem",
                    color: redactedView ? "var(--text)" : "transparent",
                  }}
                  aria-hidden="true"
                >
                  {redactedView ? (
                    // Character-by-character masked view
                    scanResult.redacted_text
                  ) : (
                    // Underline highlights view
                    renderHighlights(text, scanResult.findings, hoveredFindingId)
                  )}
                </div>

                {/* Editable Textarea */}
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSelectedPreset("");
                  }}
                  onScroll={handleScroll}
                  spellCheck={false}
                  placeholder="Paste AI prompts, tool calls, logs, source code, or configuration keys here to scan..."
                  className={`absolute inset-0 w-full h-full p-4 font-mono text-xs sm:text-sm bg-transparent resize-none outline-none leading-[1.6rem] whitespace-pre-wrap break-words selection:bg-primary/30 ${
                    redactedView ? "text-transparent caret-transparent" : "text-text caret-primary"
                  }`}
                />
              </div>
            </div>

            {/* Bottom Bar: Live scan status */}
            <div className="px-4 py-2 border-t border-border bg-black/40 flex items-center justify-between text-xs font-mono text-muted">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-sm bg-primary" />
                <span>Client Scan Duration: {scanResult.stats.duration_ms} ms</span>
              </div>
              <div className="flex items-center gap-3">
                <span>Entropy Max: {scanResult.stats.entropy_max}</span>
                <span>Flagged: {scanResult.findings.length}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Risk Meter & Findings Panel (5 cols on lg) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Risk Meter Card */}
            <div
              className="rounded-[var(--radius)] border p-5 flex items-center justify-between gap-4 relative overflow-hidden"
              style={{
                background: "var(--surface)",
                borderColor:
                  scanResult.risk_score >= 80
                    ? "rgba(223,106,104,0.4)"
                    : scanResult.risk_score >= 60
                      ? "rgba(212,145,90,0.4)"
                      : scanResult.risk_score >= 20
                        ? "rgba(201,180,103,0.4)"
                        : "rgba(134,182,154,0.4)",
              }}
            >
              <div className="flex items-center gap-4">
                {/* Circular Score Gauge */}
                <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="rgba(186,215,247,0.1)"
                      strokeWidth="3"
                    />
                    <motion.circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke={
                        scanResult.risk_score >= 80
                          ? "var(--critical)"
                          : scanResult.risk_score >= 60
                            ? "var(--high)"
                            : scanResult.risk_score >= 20
                              ? "var(--medium)"
                              : "var(--low)"
                      }
                      strokeWidth="3.2"
                      strokeDasharray="94.2"
                      initial={{ strokeDashoffset: 94.2 }}
                      animate={{
                        strokeDashoffset: 94.2 - (scanResult.risk_score / 100) * 94.2,
                      }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="font-display font-bold text-xl leading-none text-text">
                      {scanResult.risk_score}
                    </span>
                    <span className="text-[10px] font-mono text-muted">/100</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-base text-text">
                      Risk Level Grade {scanResult.risk_grade}
                    </h3>
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {scanResult.risk_score >= 80
                      ? "Critical data leak & destructive command threat."
                      : scanResult.risk_score >= 60
                        ? "High risk payload with sensitive credentials or PII."
                        : scanResult.risk_score >= 20
                          ? "Guarded payload with contact or infrastructure metadata."
                          : "Clean payload: No sensitive leaks detected."}
                  </p>
                </div>
              </div>
            </div>

            {/* Findings Filter Tabs */}
            <div className="flex items-center gap-1.5 border-b border-border pb-1 flex-wrap scrollbar-none">
              {(
                [
                  { id: "all", label: "All", count: scanResult.findings.length },
                  {
                    id: "secret",
                    label: "Secrets",
                    count: scanResult.findings.filter((f) => f.type === "secret").length,
                  },
                  {
                    id: "pii",
                    label: "PII",
                    count: scanResult.findings.filter((f) => f.type === "pii").length,
                  },
                  {
                    id: "agent_action",
                    label: "Agent Risks",
                    count: scanResult.findings.filter((f) => f.type === "agent_action").length,
                  },
                  {
                    id: "source_code",
                    label: "Code",
                    count: scanResult.findings.filter((f) => f.type === "source_code").length,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1.5 rounded-t-[var(--radius-sm)] text-xs font-mono font-medium flex items-center gap-1.5 transition-colors ${
                    filterType === tab.id
                      ? "text-primary border-b-2 border-primary bg-surface/50 font-bold"
                      : "text-muted hover:text-text"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-surface border border-border text-muted">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Findings Card List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[600px] scrollbar-thin">
              {filteredFindings.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-border bg-surface p-8 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-sm bg-low/15 border border-low/30 flex items-center justify-center text-low">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold text-sm text-text">
                      No Detected Vulnerabilities
                    </h4>
                    <p className="text-xs text-muted max-w-xs mt-1">
                      No sensitive credentials, customer PII, or dangerous agent commands were
                      flagged in this text.
                    </p>
                  </div>
                </div>
              ) : (
                filteredFindings.map((finding) => {
                  const cfg = SEVERITY_CONFIG[finding.severity];
                  const Icon = cfg.icon;
                  const isHovered = hoveredFindingId === finding.id;

                  return (
                    <motion.div
                      key={finding.id}
                      onMouseEnter={() => setHoveredFindingId(finding.id)}
                      onMouseLeave={() => setHoveredFindingId(null)}
                      className={`rounded-[var(--radius)] p-4 border transition-all duration-200 cursor-pointer ${
                        isHovered ? "scale-[1.01]" : ""
                      }`}
                      style={{
                        background: isHovered ? cfg.bg : "var(--surface)",
                        borderColor: isHovered ? cfg.text : cfg.border,
                      }}
                    >
                      {/* Finding Card Top Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-mono px-2 py-0.5 rounded font-bold flex items-center gap-1"
                            style={{
                              background: cfg.badgeBg,
                              color: cfg.text,
                              border: `1px solid ${cfg.border}`,
                            }}
                          >
                            <Icon className="w-3 h-3" />
                            {finding.severity}
                          </span>
                          <span className="text-xs font-mono text-muted">
                            {finding.subtype}
                          </span>
                        </div>

                        {finding.evidence.line && (
                          <span className="text-[10px] font-mono text-faint">
                            Line {finding.evidence.line}
                          </span>
                        )}
                      </div>

                      {/* Finding Title & Description */}
                      <h4 className="font-display font-bold text-sm text-text mt-2">
                        {finding.title}
                      </h4>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">
                        {finding.description}
                      </p>

                      {/* Evidence Match Box */}
                      <div className="mt-2.5 p-2 rounded bg-black/40 border border-border/60 font-mono text-xs flex items-center justify-between gap-2">
                        <span className="text-muted truncate">
                          Match:{" "}
                          <span className="font-bold" style={{ color: cfg.text }}>
                            {finding.evidence.match_redacted}
                          </span>
                        </span>
                        {finding.evidence.entropy !== null && (
                          <span className="text-[10px] text-faint shrink-0">
                            H: {finding.evidence.entropy}
                          </span>
                        )}
                      </div>

                      {/* Compliance & Remediation footer */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {finding.compliance.map((c) => (
                            <span
                              key={c}
                              className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[9px] text-muted"
                            >
                              {c}
                            </span>
                          ))}
                        </div>

                        {finding.remediation.length > 0 && (
                          <span className="text-primary hover:underline text-[11px] font-mono flex items-center gap-1">
                            {finding.remediation[0]}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Packet Interception Microinteraction Modal */}
      <PacketFlightModal
        isOpen={isFlightModalOpen}
        onClose={() => setIsFlightModalOpen(false)}
        scanResult={scanResult}
      />
    </div>
  );
}

// ── Highlights Renderer Helper ───────────────────────────────────────────────

function renderHighlights(
  text: string,
  findings: ScannerFinding[],
  hoveredFindingId: string | null
) {
  if (findings.length === 0) {
    return text;
  }

  // Build sorted non-overlapping spans
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  findings.forEach((f, idx) => {
    if (f.start > lastIndex) {
      elements.push(
        <span key={`text-${idx}-${lastIndex}`}>{text.slice(lastIndex, f.start)}</span>
      );
    }

    const matchText = text.slice(f.start, f.end);
    const cfg = SEVERITY_CONFIG[f.severity];
    const isHovered = hoveredFindingId === f.id;

    elements.push(
      <mark
        key={f.id}
        className="bg-transparent rounded-sm px-0.5 transition-all duration-200"
        style={{
          borderBottom: `2.5px solid ${cfg.underline}`,
          backgroundColor: isHovered ? cfg.bg : `${cfg.underline}15`,
          color: "inherit",
        }}
      >
        {matchText}
      </mark>
    );

    lastIndex = f.end;
  });

  if (lastIndex < text.length) {
    elements.push(<span key={`text-end-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <>{elements}</>;
}
