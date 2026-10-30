import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldAlert,
  Search,
  LayoutGrid,
  List,
  ShieldCheck,
  Check,
  Cpu,
  ChevronRight,
} from "lucide-react";
import { api } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import {
  GlassCard,
  SeverityPill,
  Button,
  Skeleton,
} from "../../shared/ui";
import type { Finding, Severity } from "../../shared/types";
import { toast } from "sonner";

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type SeverityTab = "all" | Severity;
type StatusFilter = "all" | "open" | "acknowledged" | "resolved" | "false_positive";

export default function Alerts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const storeFindings = useAppStore((state) => state.findings);
  const [initialFindings, setInitialFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityTab>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Selection & keyboard nav
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  // Optimistic finding status overrides
  const [localOverrides, setLocalOverrides] = useState<Record<string, Finding["status"]>>({});

  // Fetch all findings initially
  useEffect(() => {
    let active = true;
    api
      .getFindings({ limit: 100 })
      .then((res) => {
        if (active) {
          setInitialFindings(res.items);
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

  // Sync initial query params
  useEffect(() => {
    const sev = searchParams.get("severity");
    if (sev && ["critical", "high", "medium", "low", "info", "all"].includes(sev)) {
      setSelectedSeverity(sev as SeverityTab);
    }
    const stat = searchParams.get("status");
    if (stat && ["open", "acknowledged", "resolved", "false_positive", "all"].includes(stat)) {
      setStatusFilter(stat as StatusFilter);
    }
  }, [searchParams]);

  // Combine store stream with fetched findings
  const allFindings = useMemo(() => {
    const map = new Map<string, Finding>();
    // Store findings take precedence for streaming items
    storeFindings.forEach((f) => map.set(f.id, f));
    initialFindings.forEach((f) => {
      if (!map.has(f.id)) map.set(f.id, f);
    });

    return Array.from(map.values())
      .map((finding) => ({
        ...finding,
        status: localOverrides[finding.id] ?? finding.status,
      }))
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [storeFindings, initialFindings, localOverrides]);

  // Counts by severity
  const countsBySeverity = useMemo(() => {
    const counts: Record<SeverityTab, number> = {
      all: allFindings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    allFindings.forEach((f) => {
      if (counts[f.severity] !== undefined) {
        counts[f.severity]++;
      }
    });
    return counts;
  }, [allFindings]);

  // Filtered dataset
  const filteredFindings = useMemo(() => {
    return allFindings.filter((f) => {
      if (selectedSeverity !== "all" && f.severity !== selectedSeverity) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = f.title.toLowerCase().includes(q);
        const matchesSubtype = f.subtype.toLowerCase().includes(q);
        const matchesDesc = f.description.toLowerCase().includes(q);
        const matchesProc = f.process_name?.toLowerCase().includes(q);
        const matchesEvidence = f.evidence?.match_redacted?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubtype && !matchesDesc && !matchesProc && !matchesEvidence) {
          return false;
        }
      }
      return true;
    });
  }, [allFindings, selectedSeverity, statusFilter, typeFilter, searchQuery]);

  // Keyboard navigation: j, k, x, enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in search input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredFindings.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "x") {
        e.preventDefault();
        const current = filteredFindings[highlightedIndex];
        if (current) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(current.id)) next.delete(current.id);
            else next.add(current.id);
            return next;
          });
        }
      } else if (e.key === "Enter") {
        const current = filteredFindings[highlightedIndex];
        if (current) {
          navigate(`/app/alerts/${current.id}`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredFindings, highlightedIndex, navigate]);

  // Selection helpers
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredFindings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFindings.map((f) => f.id)));
    }
  }, [filteredFindings, selectedIds]);

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk status update actions
  const handleBulkStatus = async (status: Finding["status"]) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Optimistic update
    setLocalOverrides((prev) => {
      const update = { ...prev };
      ids.forEach((id) => (update[id] = status));
      return update;
    });

    toast.success(`Updated ${ids.length} alert(s) to "${status}"`);
    setSelectedIds(new Set());

    // API calls in parallel
    try {
      await Promise.all(ids.map((id) => api.updateFinding(id, status)));
    } catch {
      toast.error("Failed to persist some status changes");
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-6.5rem)]">
      {/* ==================================================================== */}
      {/* 1. SEVERITY TABS & CONTROLS HEADER                                   */}
      {/* ==================================================================== */}
      <GlassCard variant="default" className="p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Header Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold text-text">
                  Alerts & Exfiltration Center
                </h1>
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 font-bold">
                  {countsBySeverity.critical} Critical
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5 hidden sm:block">
                Flagged secrets, PII, autonomous loops, and policy deviations
              </p>
            </div>
          </div>

          {/* View Mode Toggle & Keyboard Hint */}
          <div className="flex items-center gap-2">
            <span className="hidden lg:inline font-mono text-[11px] text-muted/60 mr-2">
              Keys: <kbd className="bg-white/5 border border-white/10 px-1 rounded">j</kbd>/
              <kbd className="bg-white/5 border border-white/10 px-1 rounded">k</kbd> navigate,{" "}
              <kbd className="bg-white/5 border border-white/10 px-1 rounded">x</kbd> select,{" "}
              <kbd className="bg-white/5 border border-white/10 px-1 rounded">↵</kbd> open
            </span>

            <div className="flex items-center rounded-lg border border-white/10 bg-surface-solid/80 p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "list" ? "bg-white/10 text-cyan-400" : "text-muted hover:text-text"
                }`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "grid" ? "bg-white/10 text-cyan-400" : "text-muted hover:text-text"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Severity Tabs with Animated layoutId Indicator */}
        <div className="flex items-center gap-1 border-b border-white/[0.08] overflow-x-auto pb-px scrollbar-none">
          {(["all", "critical", "high", "medium", "low", "info"] as SeverityTab[]).map((tab) => {
            const active = selectedSeverity === tab;
            const count = countsBySeverity[tab];

            const tabColors: Record<SeverityTab, string> = {
              all: "text-text",
              critical: "text-[#FF3B5C]",
              high: "text-[#FF8A3D]",
              medium: "text-[#FACC15]",
              low: "text-[#34D399]",
              info: "text-[#60A5FA]",
            };

            return (
              <button
                key={tab}
                onClick={() => {
                  setSelectedSeverity(tab);
                  setSearchParams({ severity: tab, status: statusFilter });
                }}
                className={`relative flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors select-none whitespace-nowrap cursor-pointer ${
                  active ? "text-text font-bold" : "text-muted hover:text-text"
                }`}
              >
                <span className={active ? tabColors[tab] : ""}>{tab}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    active ? "bg-white/15 text-text font-bold" : "bg-white/5 text-muted"
                  }`}
                >
                  {count}
                </span>

                {active && (
                  <motion.div
                    layoutId="active-severity-tab"
                    className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-primary via-cyan-400 to-primary-2 shadow-[0_0_8px_rgba(34,211,238,0.7)]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Filters and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs">
          {/* Search Input (5 cols) */}
          <div className="sm:col-span-5 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted" />
            <input
              type="text"
              placeholder="Search by title, secret subtype, process..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#080c18] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-text placeholder:text-muted/60 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* Type Filter (4 cols) */}
          <div className="sm:col-span-4">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-[#080c18] border border-white/10 rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan-400 font-mono"
            >
              <option value="all">All Finding Types</option>
              <option value="secret">Secrets & Credentials</option>
              <option value="pii">PII & Personal Data</option>
              <option value="agent_action">Risky Agent Actions</option>
              <option value="source_code">Proprietary Source Code</option>
              <option value="shadow_ai">Shadow AI Tools</option>
              <option value="canary">Honeytokens / Canaries</option>
              <option value="policy">Policy Violations</option>
            </select>
          </div>

          {/* Status Filter (3 cols) */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setSearchParams({ severity: selectedSeverity, status: e.target.value });
              }}
              className="w-full bg-[#080c18] border border-white/10 rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan-400 font-mono"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open Only</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 2. BULK SELECTION ACTION BAR (Appears when items are selected)        */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl border border-cyan-500/40 bg-[#0c1428]/95 shadow-[0_0_24px_rgba(34,211,238,0.2)] backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 z-20"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-cyan-300">
                {selectedIds.size} of {filteredFindings.length} selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-muted hover:text-text underline cursor-pointer"
              >
                Clear selection
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => handleBulkStatus("acknowledged")}
              >
                Mark Acknowledged
              </Button>
              <Button
                variant="glow"
                size="xs"
                onClick={() => handleBulkStatus("resolved")}
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Resolve Selected
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleBulkStatus("false_positive")}
              >
                False Positive
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* 3. ALERTS LIST OR GRID                                               */}
      {/* ==================================================================== */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredFindings.length === 0 ? (
        <GlassCard variant="default" className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <ShieldCheck className="w-14 h-14 text-emerald-400/40 mb-3" />
          <h3 className="font-display text-lg font-semibold text-text">No Alerts Found</h3>
          <p className="text-xs text-muted max-w-sm mt-1">
            Zero security exfiltrations match your current filters. Your endpoints are operating securely.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSelectedSeverity("all");
              setStatusFilter("all");
              setTypeFilter("all");
              setSearchQuery("");
            }}
          >
            Reset Filters
          </Button>
        </GlassCard>
      ) : viewMode === "list" ? (
        /* List View */
        <GlassCard variant="default" className="p-0 overflow-hidden flex-1">
          {/* Header Row */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#090d19] border-b border-white/[0.08] text-[10px] font-mono uppercase text-muted tracking-wider">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredFindings.length && filteredFindings.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-white/20 bg-white/5 text-cyan-400 focus:ring-0 cursor-pointer"
              />
              <span>Severity / Title</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="hidden md:inline">Process & Source</span>
              <span className="hidden sm:inline">Compliance</span>
              <span className="hidden sm:inline">Status</span>
              <span>Time</span>
            </div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {filteredFindings.map((finding, idx) => {
              const isSelected = selectedIds.has(finding.id);
              const isHighlighted = idx === highlightedIndex;
              const isCritical = finding.severity === "critical";

              return (
                <div
                  key={finding.id}
                  onClick={() => navigate(`/app/alerts/${finding.id}`)}
                  className={`p-3.5 sm:px-4 sm:py-3 transition-all cursor-pointer group flex items-center justify-between gap-3 ${
                    isSelected ? "bg-cyan-500/10" : isHighlighted ? "bg-white/[0.04]" : ""
                  } ${
                    isCritical && finding.status === "open"
                      ? "bg-red-950/15 border-l-2 border-red-500 shadow-[inset_0_0_20px_rgba(255,59,92,0.06)]"
                      : ""
                  }`}
                >
                  {/* Left: Checkbox, Severity, Title, Subtype */}
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => toggleSelectOne(finding.id, e)}
                      onChange={() => {}}
                      className="rounded border-white/20 bg-white/5 text-cyan-400 focus:ring-0 cursor-pointer shrink-0"
                    />

                    <SeverityPill severity={finding.severity} size="xs" />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-xs sm:text-sm text-text group-hover:text-cyan-300 transition-colors truncate">
                          {finding.title}
                        </p>
                        <span className="font-mono text-[10px] text-muted/80 bg-white/5 px-1.5 py-0.2 rounded border border-white/10 hidden sm:inline">
                          {finding.subtype}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted truncate max-w-md mt-0.5">
                        {finding.evidence?.redacted_snippet || finding.description}
                      </p>
                    </div>
                  </div>

                  {/* Right: Process, Compliance, Status, Time, Arrow */}
                  <div className="flex items-center gap-3 sm:gap-6 shrink-0 font-mono text-xs">
                    <div className="hidden md:flex items-center gap-1.5 text-muted text-[11px]">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400/80" />
                      <span>{finding.process_name ?? "system"}</span>
                    </div>

                    {/* Compliance chips */}
                    <div className="hidden sm:flex items-center gap-1">
                      {finding.compliance?.slice(0, 2).map((c) => (
                        <span
                          key={c}
                          className="text-[9px] px-1.5 py-0.2 rounded bg-surface border border-white/10 text-muted"
                        >
                          {c}
                        </span>
                      ))}
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        finding.status === "open"
                          ? "bg-red-500/15 text-red-400 border border-red-500/30"
                          : finding.status === "acknowledged"
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {finding.status}
                    </span>

                    <span className="text-muted text-[11px] whitespace-nowrap">
                      {timeAgo(finding.ts)}
                    </span>

                    <ChevronRight className="w-4 h-4 text-muted group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all hidden sm:block" />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFindings.map((finding) => {
            const isSelected = selectedIds.has(finding.id);
            const isCritical = finding.severity === "critical";

            return (
              <GlassCard
                key={finding.id}
                variant="default"
                interactive
                onClick={() => navigate(`/app/alerts/${finding.id}`)}
                className={`p-4 flex flex-col justify-between transition-all ${
                  isSelected ? "border-cyan-400/50 bg-cyan-950/20" : ""
                } ${
                  isCritical && finding.status === "open"
                    ? "border-red-500/35 bg-red-950/10 shadow-[0_0_20px_rgba(255,59,92,0.15)]"
                    : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <SeverityPill severity={finding.severity} size="xs" />
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted">
                        {timeAgo(finding.ts)}
                      </span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => toggleSelectOne(finding.id, e)}
                        onChange={() => {}}
                        className="rounded border-white/20 bg-white/5 text-cyan-400 focus:ring-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  <h3 className="font-display font-semibold text-sm text-text leading-snug line-clamp-2">
                    {finding.title}
                  </h3>

                  <p className="font-mono text-[11px] text-muted line-clamp-2 mt-1.5 leading-relaxed bg-[#060812] p-2 rounded border border-white/10">
                    {finding.evidence?.redacted_snippet || finding.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-muted text-[11px]">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{finding.process_name ?? "unknown"}</span>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      finding.status === "open"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-emerald-500/15 text-emerald-400"
                    }`}
                  >
                    {finding.status}
                  </span>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
