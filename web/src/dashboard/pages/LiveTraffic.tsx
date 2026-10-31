import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Radio,
  Pause,
  Play,
  Filter,
  Search,
  Eye,
  EyeOff,
  ShieldAlert,
  ArrowDown,
  Copy,
  Check,
  Server,
  Cpu,
  ExternalLink,
  ChevronRight,
  Terminal,
} from "lucide-react";
import { api } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import {
  Select,
  GlassCard,
  Badge,
  SeverityPill,
  Button,
  Drawer,
  Skeleton,
} from "../../shared/ui";
import type { AIEvent, Finding, Source } from "../../shared/types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 3) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Source badge metadata
const SOURCE_CONFIG: Record<
  Source,
  { label: string; variant: "cyan" | "violet" | "high" | "critical" | "default" | "mono" }
> = {
  live_conn: { label: "LIVE", variant: "cyan" },
  dns_sni: { label: "SNI", variant: "mono" },
  loopback: { label: "LOOPBACK", variant: "violet" },
  gateway: { label: "GATEWAY", variant: "high" },
  pcap: { label: "PCAP", variant: "default" },
  har: { label: "HAR", variant: "default" },
  log: { label: "LOG", variant: "default" },
  extension: { label: "EXT", variant: "cyan" },
  simulator: { label: "SIM", variant: "high" },
};

export default function LiveTraffic() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Stream & store integration
  const storeEvents = useAppStore((state) => state.events);
  const [initialEvents, setInitialEvents] = useState<AIEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Controls
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [pausedBuffer, setPausedBuffer] = useState<AIEvent[]>([]);

  // Selected event for inspection Drawer
  const [selectedEvent, setSelectedEvent] = useState<AIEvent | null>(null);
  const [linkedFindings, setLinkedFindings] = useState<Finding[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filters
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [processFilter, setProcessFilter] = useState<string>("");
  const [minRisk, setMinRisk] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);

  // Seed initial events from API on mount
  useEffect(() => {
    let active = true;
    api
      .getEvents({ limit: 80 })
      .then((res) => {
        if (active) {
          setInitialEvents(res.items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Sync with searchParams if navigated with ?provider=... or ?source=...
  useEffect(() => {
    const p = searchParams.get("provider");
    const s = searchParams.get("source");
    if (p) setProviderFilter(p);
    if (s) setSourceFilter(s);
  }, [searchParams]);

  // Combine store stream with initial events
  const allEvents = useMemo(() => {
    const map = new Map<string, AIEvent>();
    // Prepend store stream
    storeEvents.forEach((e) => map.set(e.id, e));
    initialEvents.forEach((e) => {
      if (!map.has(e.id)) map.set(e.id, e);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
    );
  }, [storeEvents, initialEvents]);

  // Handle pause buffer
  useEffect(() => {
    if (isPaused) {
      if (storeEvents.length > 0) {
        setPausedBuffer((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          const newOnes = storeEvents.filter((e) => !ids.has(e.id));
          return [...newOnes, ...prev].slice(0, 50);
        });
      }
    } else {
      setPausedBuffer([]);
    }
  }, [isPaused, storeEvents]);

  // Filtered dataset
  const filteredEvents = useMemo(() => {
    return allEvents.filter((evt) => {
      if (providerFilter !== "all" && evt.provider?.id !== providerFilter) return false;
      if (sourceFilter !== "all" && evt.source !== sourceFilter) return false;
      if (minRisk > 0 && evt.risk_score < minRisk) return false;
      if (
        processFilter &&
        !evt.process.name.toLowerCase().includes(processFilter.toLowerCase()) &&
        !evt.dest.host.toLowerCase().includes(processFilter.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [allEvents, providerFilter, sourceFilter, processFilter, minRisk]);

  // Rows only stagger on the first load.
  useEffect(() => {
    if (allEvents.length === 0 || settled) return;
    const timer = window.setTimeout(() => setSettled(true), 600);
    return () => window.clearTimeout(timer);
  }, [allEvents.length, settled]);

  // Auto-scroll on new items when enabled
  useEffect(() => {
    if (autoScroll && !isPaused && tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [filteredEvents.length, autoScroll, isPaused]);

  // Drawer inspection opener
  const handleInspectRow = async (evt: AIEvent) => {
    setSelectedEvent(evt);
    setDrawerOpen(true);
    // Fetch detailed linked findings
    if (evt.finding_ids && evt.finding_ids.length > 0) {
      try {
        const fullEvent = await api.getEvent(evt.id);
        setLinkedFindings(fullEvent.findings || []);
      } catch {
        setLinkedFindings([]);
      }
    } else {
      setLinkedFindings([]);
    }
  };

  const copyJson = () => {
    if (selectedEvent) {
      navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Redacted highlight formatter
  const renderMaskedPayload = (text: string | null) => {
    if (!text) return <span className="text-muted italic">No payload captured (TLS encrypted handshake)</span>;
    // Highlight masked substrings like AKIA**************** or sk-******************** or ***@***.*** or ~/.ssh/...
    const parts = text.split(/([A-Z0-9_*]{10,}|\b[a-zA-Z0-9._%+-]+@\S+\b|\b\/?(?:~|\.ssh|\.aws|\.env)\S*)/g);
    return (
      <>
        {parts.map((part, i) => {
          if (
            part.includes("****") ||
            part.includes(".ssh") ||
            part.includes(".aws") ||
            part.includes(".env") ||
            part.includes("@")
          ) {
            return (
              <mark
                key={i}
                className="bg-red-500/25 text-text px-1 py-0.5 rounded border border-red-500/30 font-semibold"
              >
                {part}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </>
    );
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8.25rem)]">
      {/* ==================================================================== */}
      {/* 1. HEADER CONTROLS STRIP                                            */}
      {/* ==================================================================== */}
      <GlassCard variant="default" className="p-4 shrink-0 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Title & Live Status */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-semibold text-text">
                  Live Traffic Telemetry
                </h1>
                <span className=" text-xs px-2 py-0.5 rounded-sm bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {filteredEvents.length} events
                </span>
                {isPaused && (
                  <span className=" text-xs px-2 py-0.5 rounded-sm bg-amber-500/15 text-text border border-amber-500/30">
                    STREAM PAUSED
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5 hidden sm:block">
                Zero-decryption socket audit across local processes and cloud LLM endpoints
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Pause / Resume */}
            <Button
              variant={isPaused ? "glow" : "secondary"}
              size="sm"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
              <span>{isPaused ? "Resume Stream" : "Pause Stream"}</span>
              {isPaused && pausedBuffer.length > 0 && (
                <span className=" text-[11px] bg-medium text-bg px-1.5 py-0.2 rounded-sm font-semibold">
                  +{pausedBuffer.length}
                </span>
              )}
            </Button>

            {/* Auto-scroll toggle */}
            <Button
              variant={autoScroll ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? "Auto-scroll is ON (jumps to newest)" : "Auto-scroll is OFF"}
            >
              <ArrowDown className={`w-4 h-4 ${autoScroll ? "text-cyan-400" : "text-muted"}`} />
              <span className="hidden sm:inline">Auto-scroll</span>
            </Button>

            {/* Filter Toggle */}
            <Button
              variant={showFilters ? "glow" : "secondary"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 text-muted" />
              <span>Filters</span>
              {(providerFilter !== "all" || sourceFilter !== "all" || minRisk > 0 || processFilter) && (
                <span className="w-2 h-2 rounded-sm bg-cyan-400" />
              )}
            </Button>
          </div>
        </div>

        {/* Collapsible Filters Tray */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="pt-3 border-t border-border"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* Search / Process */}
                <div>
                  <label className=" text-[11px] text-muted block mb-1">Process / Host Search</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted" />
                    <input
                      type="text"
                      placeholder="e.g. python3, cursor, openai..."
                      value={processFilter}
                      onChange={(e) => setProcessFilter(e.target.value)}
                      className="ui-input w-full pl-8 pr-3 py-1.5 text-xs"
                    />
                  </div>
                </div>

                {/* Provider select */}
                <div>
                  <label className=" text-[11px] text-muted block mb-1">Provider</label>
                  <Select
                    aria-label="Provider"
                    value={providerFilter}
                    onValueChange={setProviderFilter}
                    options={[
                      { value: "all", label: "All Providers" },
                      { value: "mock_ai", label: "ShadowScope Mock Provider" },
                      { value: "openai", label: "OpenAI API" },
                      { value: "anthropic", label: "Anthropic API" },
                      { value: "ollama", label: "Ollama (Local)" },
                      { value: "cursor", label: "Cursor AI Coding" },
                      { value: "gemini", label: "Google Gemini API" },
                    ]}
                  />
                </div>

                {/* Source select */}
                <div>
                  <label className=" text-[11px] text-muted block mb-1">Capture Source</label>
                  <Select
                    aria-label="Capture source"
                    value={sourceFilter}
                    onValueChange={setSourceFilter}
                    options={[
                      { value: "all", label: "All Sources" },
                      { value: "live_conn", label: "LIVE (Sockets)" },
                      { value: "loopback", label: "LOOPBACK (Plaintext)" },
                      { value: "dns_sni", label: "SNI (TLS Handshake)" },
                      { value: "gateway", label: "GATEWAY (Local Tap)" },
                      { value: "extension", label: "EXT (Browser Paste)" },
                      { value: "simulator", label: "SIM (Simulator)" },
                      { value: "har", label: "HAR (DevTools Upload)" },
                      { value: "pcap", label: "PCAP (Packet Capture)" },
                    ]}
                  />
                </div>

                {/* Min Risk Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className=" text-[11px] text-muted">Min Risk Score</label>
                    <span className=" font-semibold text-xs text-cyan-400">{minRisk}+</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={minRisk}
                    onChange={(e) => setMinRisk(Number(e.target.value))}
                    className="w-full bg-text/10 rounded h-1.5 cursor-pointer"
                  />
                </div>
              </div>

              {(providerFilter !== "all" || sourceFilter !== "all" || minRisk > 0 || processFilter) && (
                <div className="mt-2 text-right">
                  <button
                    onClick={() => {
                      setProviderFilter("all");
                      setSourceFilter("all");
                      setMinRisk(0);
                      setProcessFilter("");
                    }}
                    className=" text-[11px] text-rose-400 hover:underline cursor-pointer"
                  >
                    Reset all filters
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 2. MAIN TELEMETRY FEED (TABLE DESKTOP / CARDS MOBILE)                */}
      {/* ==================================================================== */}
      <GlassCard variant="default" className="p-0 flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <Radio className="w-12 h-12 text-muted mb-3" />
            <h3 className="font-display text-base font-semibold text-text">No Telemetry Matches Filters</h3>
            <p className="text-xs text-muted max-w-sm mt-1">
              Adjust your search keywords or decrease the minimum risk slider to view live AI connections.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setProviderFilter("all");
                setSourceFilter("all");
                setMinRisk(0);
                setProcessFilter("");
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div ref={tableContainerRef} className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Desktop Table View (>= 768px) */}
            <table className="hidden md:table w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-solid border-b border-border text-muted text-[11px]">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Risk</th>
                  <th className="py-3 px-4">Process / PID</th>
                  <th className="py-3 px-4">Provider / Model</th>
                  <th className="py-3 px-4">Destination</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Payload</th>
                  <th className="py-3 px-4 text-right">Bytes Out</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEvents.map((evt, idx) => {
                  const sourceMeta = SOURCE_CONFIG[evt.source] ?? { label: evt.source, variant: "default" };
                  const isHighRisk = evt.risk_score >= 70;
                  const hasFindings = evt.finding_ids && evt.finding_ids.length > 0;
                  // New rows fade in; rows already on screen stay put. Only the first load staggers.
                  const delay = !settled && idx < 12 ? idx * 0.025 : 0;

                  return (
                    <motion.tr
                      key={evt.id}
                      initial={idx < 12 ? { opacity: 0 } : false}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.25, delay }}
                      onClick={() => handleInspectRow(evt)}
                      className={`group hover:bg-elevated cursor-pointer transition-colors ${
                        isHighRisk ? "bg-red-950/10" : ""
                      }`}
                    >
                      {/* Timestamp */}
                      <td className="py-2.5 px-4 whitespace-nowrap text-muted text-[11px]">
                        {timeAgo(evt.ts)}
                      </td>

                      {/* Risk Score Pill */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            evt.risk_score >= 80
                              ? "bg-red-500/20 text-text border border-red-500/40 "
                              : evt.risk_score >= 50
                              ? "bg-amber-500/20 text-text border border-amber-500/35"
                              : "bg-emerald-500/15 text-text border border-emerald-500/30"
                          }`}
                        >
                          {evt.risk_score}
                        </span>
                      </td>

                      {/* Process */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-muted group-hover:text-cyan-400 transition-colors" />
                          <span className="font-mono font-medium text-text text-xs">{evt.process.name}</span>
                          {evt.process.pid && (
                            <span className="font-mono text-[11px] text-muted">:{evt.process.pid}</span>
                          )}
                        </div>
                      </td>

                      {/* Provider & Model */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-text font-medium truncate max-w-[140px]">
                            {evt.provider?.name ?? "Unknown Provider"}
                          </span>
                          {evt.model && (
                            <span className="font-mono text-[11px] text-muted truncate max-w-[140px]">
                              {evt.model}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Destination */}
                      <td className="py-2.5 px-4 whitespace-nowrap font-mono text-xs text-muted truncate max-w-[150px]">
                        {evt.dest.host}
                        <span>:{evt.dest.port}</span>
                      </td>

                      {/* Capture Source Badge */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <Badge variant={sourceMeta.variant} size="xs">
                          {sourceMeta.label}
                        </Badge>
                      </td>

                      {/* Payload Visibility */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {evt.payload_visible ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <Eye className="w-3.5 h-3.5" />
                            <span>Plaintext</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Encrypted</span>
                          </span>
                        )}
                      </td>

                      {/* Bytes Out */}
                      <td className="py-2.5 px-4 whitespace-nowrap text-right text-text">
                        {formatBytes(evt.bytes_out)}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {hasFindings && (
                            <span
                              className="p-1 rounded bg-red-500/20 text-text border border-red-500/30"
                              title={`${evt.finding_ids.length} linked finding(s)`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted group-hover:text-cyan-400 transition-colors" />
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Card List View (< 768px) */}
            <div className="md:hidden divide-y divide-border p-2 space-y-2">
              {filteredEvents.map((evt) => {
                const sourceMeta = SOURCE_CONFIG[evt.source] ?? { label: evt.source, variant: "default" };
                const isHighRisk = evt.risk_score >= 70;
                return (
                  <div
                    key={evt.id}
                    onClick={() => handleInspectRow(evt)}
                    className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                      isHighRisk
                        ? "bg-red-950/20 border-red-500/30"
                        : "bg-surface-solid border-border hover:bg-surface-solid"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text font-mono text-sm">
                          {evt.process.name}
                        </span>
                        <Badge variant={sourceMeta.variant} size="xs">
                          {sourceMeta.label}
                        </Badge>
                      </div>
                      <span
                        className={` text-xs font-semibold px-2 py-0.5 rounded ${
                          evt.risk_score >= 80
                            ? "bg-red-500/20 text-text"
                            : evt.risk_score >= 50
                            ? "bg-amber-500/20 text-text"
                            : "bg-emerald-500/20 text-text"
                        }`}
                      >
                        Risk {evt.risk_score}
                      </span>
                    </div>

                    <p className="text-xs text-text truncate">
                      {evt.provider?.name ?? evt.dest.host}
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted">
                      <span>{evt.dest.host}:{evt.dest.port}</span>
                      <span>{timeAgo(evt.ts)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </GlassCard>

      {/* ==================================================================== */}
      {/* 3. EVENT INSPECTION DRAWER (Desktop Right / Mobile Bottom Sheet)     */}
      {/* ==================================================================== */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          selectedEvent ? (
            <div className="flex items-center gap-2">
              <span>Event Details</span>
              <span className="font-mono text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/25">
                {selectedEvent.id}
              </span>
            </div>
          ) : (
            "Event Inspection"
          )
        }
        description={selectedEvent ? new Date(selectedEvent.ts).toLocaleString() : undefined}
      >
        {selectedEvent && (
          <div className="space-y-6">
            {/* Quick Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-border bg-surface-solid">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Risk Score:</span>
                <span
                  className={` text-sm font-semibold px-2.5 py-0.5 rounded ${
                    selectedEvent.risk_score >= 80
                      ? "bg-red-500/20 text-text border border-red-500/40"
                      : "bg-amber-500/20 text-text border border-amber-500/35"
                  }`}
                >
                  {selectedEvent.risk_score} / 100
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={SOURCE_CONFIG[selectedEvent.source]?.variant ?? "default"} size="sm">
                  {SOURCE_CONFIG[selectedEvent.source]?.label ?? selectedEvent.source}
                </Badge>
                {selectedEvent.payload_visible ? (
                  <Badge variant="cyan" size="sm">
                    Plaintext Inspected
                  </Badge>
                ) : (
                  <Badge variant="outline" size="sm">
                    TLS Protected
                  </Badge>
                )}
              </div>
            </div>

            {/* Destination & Connection Card */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3 text-xs">
              <h4 className="font-display text-sm font-semibold text-text flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                Network Destination
              </h4>
              <div className="grid grid-cols-2 gap-2 text-muted">
                <div>
                  <span className="text-[11px] text-muted block">Host</span>
                  <span className="text-text font-semibold">{selectedEvent.dest.host}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">IP / Port</span>
                  <span className="text-text">
                    {selectedEvent.dest.ip ?? "Resolved DNS"} : {selectedEvent.dest.port}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">Protocol</span>
                  <span className="text-cyan-400">{selectedEvent.dest.protocol}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">Data Transferred</span>
                  <span className="text-text">
                    ↑ {formatBytes(selectedEvent.bytes_out)} / ↓ {formatBytes(selectedEvent.bytes_in)}
                  </span>
                </div>
              </div>
            </div>

            {/* Process Card */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3 text-xs">
              <h4 className="font-display text-sm font-semibold text-text flex items-center gap-2">
                <Cpu className="w-4 h-4 text-violet-400" />
                Endpoint Process Lineage
              </h4>
              <div className="grid grid-cols-2 gap-2 text-muted">
                <div>
                  <span className="text-[11px] text-muted block">Process Name</span>
                  <span className="text-text font-semibold">{selectedEvent.process.name}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">PID</span>
                  <span className="text-text">{selectedEvent.process.pid ?? "Unknown"}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">Parent Process</span>
                  <span className="text-text">{selectedEvent.process.parent ?? "None / System"}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">User</span>
                  <span className="text-text">{selectedEvent.process.user ?? "Current User"}</span>
                </div>
              </div>

              {selectedEvent.process.cmdline_hint && (
                <div className="mt-2 pt-2 border-t border-border">
                  <span className="text-[11px] text-muted block mb-1">Command-Line Execution</span>
                  <pre className="bg-surface-solid p-2 rounded border border-border text-[11px] text-cyan-300 whitespace-pre-wrap break-words whitespace-pre-wrap">
                    {selectedEvent.process.cmdline_hint}
                  </pre>
                </div>
              )}
            </div>

            {/* Redacted Payload Preview Block */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-semibold text-text flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Payload Preview (Redacted)
                </h4>
                <span className="text-[11px] text-muted">
                  Secrets automatically masked
                </span>
              </div>

              <div className="relative rounded-xl border border-border bg-surface-solid p-4 font-mono text-xs text-text leading-relaxed max-h-48 scrollbar-thin">
                {renderMaskedPayload(selectedEvent.payload_preview)}
              </div>
            </div>

            {/* Linked Findings */}
            {linkedFindings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-display text-sm font-semibold text-text flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  Linked Findings ({linkedFindings.length})
                </h4>
                <div className="space-y-2">
                  {linkedFindings.map((finding) => (
                    <div
                      key={finding.id}
                      onClick={() => navigate(`/app/alerts/${finding.id}`)}
                      className="p-3 rounded-lg border border-red-500/30 bg-red-950/15 hover:border-red-500/60 transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <SeverityPill severity={finding.severity} size="xs" />
                        <div>
                          <p className="font-semibold text-xs text-text">{finding.title}</p>
                          <p className="font-mono text-[11px] text-muted truncate max-w-xs">
                            {finding.evidence?.redacted_snippet || finding.description}
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-red-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags Strip */}
            {selectedEvent.tags && selectedEvent.tags.length > 0 && (
              <div>
                <span className="text-[11px] text-muted block mb-1.5">
                  Classifier Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedEvent.tags.map((tag) => (
                    <span
                      key={tag}
                      className=" text-[11px] px-2 py-0.5 rounded bg-surface border border-border text-muted"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Drawer Actions */}
            <div className="pt-4 border-t border-border flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={copyJson}>
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Copied JSON" : "Copy Telemetry JSON"}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
