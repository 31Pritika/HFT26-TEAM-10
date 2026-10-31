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
  Select,
  SEVERITY_META,
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

const MAX_FINDINGS = 5000;

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
    const loadAll = async () => {
      const items: Finding[] = [];
      let cursor: string | null = null;
      do {
        const page = await api.getFindings({ limit: 100, ...(cursor ? { cursor } : {}) });
        items.push(...page.items);
        cursor = page.next_cursor;
      } while (cursor && items.length < MAX_FINDINGS);
      return items;
    };
    loadAll()
      .then((items) => {
        if (active) {
          setInitialFindings(items);
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
    const process = searchParams.get("process");
    if (process) setSearchQuery(process);
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

  // Rows only stagger on the first load.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (allFindings.length === 0 || settled) return;
    const timer = window.setTimeout(() => setSettled(true), 600);
    return () => window.clearTimeout(timer);
  }, [allFindings.length, settled]);
  const rise = (index: number) =>
    !settled && index < 12 ? { className: "ui-rise", style: { animationDelay: `${index * 25}ms` } } : { className: "", style: undefined };

  // Keyboard navigation: j, k, x, enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in search input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.closest('[role="combobox"], [role="listbox"]')
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
    <div className="space-y-4 flex flex-col min-h-[calc(100dvh-10rem)] md:min-h-[calc(100dvh-8.25rem)]">
      {/* ==================================================================== */}
      {/* 1. SEVERITY TABS & CONTROLS HEADER                                   */}
      {/* ==================================================================== */}
      <GlassCard variant="default" className="p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Header Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-text">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-semibold text-text">
                  Alerts & Exfiltration Center
                </h1>
                <span className=" text-xs px-2 py-0.5 rounded-sm bg-red-500/15 text-text border border-red-500/30 font-semibold">
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
            <span className="hidden lg:inline font-mono text-[11px] text-muted mr-2">
              Keys: <kbd className="bg-text/5 border border-border px-1 rounded">j</kbd>/
              <kbd className="bg-text/5 border border-border px-1 rounded">k</kbd> navigate,{" "}
              <kbd className="bg-text/5 border border-border px-1 rounded">x</kbd> select,{" "}
              <kbd className="bg-text/5 border border-border px-1 rounded">↵</kbd> open
            </span>

            <div className="flex items-center rounded-lg border border-border bg-surface-solid p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "list" ? "bg-text/10 text-cyan-400" : "text-muted hover:text-text"
                }`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "grid" ? "bg-text/10 text-cyan-400" : "text-muted hover:text-text"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Severity Tabs with Animated layoutId Indicator */}
        <div className="flex items-center gap-1 border-b border-border flex-wrap pb-px scrollbar-none">
          {(["all", "critical", "high", "medium", "low", "info"] as SeverityTab[]).map((tab) => {
            const active = selectedSeverity === tab;
            const count = countsBySeverity[tab];

            const meta = tab === "all" ? null : SEVERITY_META[tab];
            const TabIcon = meta?.icon;

            return (
              <button
                key={tab}
                onClick={() => {
                  setSelectedSeverity(tab);
                  setSearchParams({ severity: tab, status: statusFilter });
                }}
                className={`relative flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs   transition-colors select-none whitespace-nowrap cursor-pointer ${
                  active ? "text-text font-medium" : "text-muted hover:text-text"
                }`}
              >
                {TabIcon && <TabIcon className={`w-3.5 h-3.5 ${meta?.iconClass}`} />}
                <span className="capitalize">{tab}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-sm text-[11px] ${
                    active ? "bg-text/15 text-text font-semibold" : "bg-text/5 text-muted"
                  }`}
                >
                  {count}
                </span>

                {active && (
                  <motion.div
                    layoutId="active-severity-tab"
                    className="absolute bottom-0 inset-x-0 h-0.5 bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 38 }}
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
              className="ui-input w-full pl-9 pr-3 py-2 text-xs"
            />
          </div>

          {/* Type Filter (4 cols) */}
          <div className="sm:col-span-4">
            <Select
              aria-label="Finding type"
              value={typeFilter}
              onValueChange={setTypeFilter}
              options={[
                { value: "all", label: "All Finding Types" },
                { value: "secret", label: "Secrets & Credentials" },
                { value: "pii", label: "PII & Personal Data" },
                { value: "agent_action", label: "Risky Agent Actions" },
                { value: "source_code", label: "Proprietary Source Code" },
                { value: "shadow_ai", label: "Shadow AI Tools" },
                { value: "canary", label: "Honeytokens / Canaries" },
                { value: "policy", label: "Policy Violations" },
              ]}
            />
          </div>

          {/* Status Filter (3 cols) */}
          <div className="sm:col-span-3">
            <Select
              aria-label="Status"
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilter);
                setSearchParams({ severity: selectedSeverity, status: value });
              }}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "open", label: "Open Only" },
                { value: "acknowledged", label: "Acknowledged" },
                { value: "resolved", label: "Resolved" },
                { value: "false_positive", label: "False Positive" },
              ]}
            />
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
            className="p-3 rounded-xl border border-cyan-500/40 bg-elevated flex flex-wrap items-center justify-between gap-3 z-20"
          >
            <div className="flex items-center gap-3">
              <span className=" text-xs font-semibold text-cyan-300">
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
          <ShieldCheck className="w-14 h-14 text-emerald-400 mb-3" />
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
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface-solid border-b border-border text-[11px] text-muted">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredFindings.length && filteredFindings.length > 0}
                onChange={toggleSelectAll}
                className="rounded-xs cursor-pointer"
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

          <div className="divide-y divide-border">
            {filteredFindings.map((finding, idx) => {
              const isSelected = selectedIds.has(finding.id);
              const isHighlighted = idx === highlightedIndex;
              const isCritical = finding.severity === "critical";

              return (
                <div
                  key={finding.id}
                  onClick={() => navigate(`/app/alerts/${finding.id}`)}
                  style={rise(idx).style}
                  className={`${rise(idx).className} p-3.5 sm:px-4 sm:py-3 hover:bg-elevated transition-colors cursor-pointer group flex items-center justify-between gap-3 ${
                    isSelected ? "bg-cyan-500/10" : isHighlighted ? "bg-text/[0.04]" : ""
                  } ${
                    isCritical && finding.status === "open"
                      ? "bg-red-950/15 border-l-2 border-red-500 "
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
                      className="rounded-xs cursor-pointer shrink-0"
                    />

                    <SeverityPill severity={finding.severity} size="xs" />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-xs sm:text-sm text-text group-hover:text-cyan-300 transition-colors truncate">
                          {finding.title}
                        </p>
                        <span className="font-mono text-[11px] text-muted bg-text/5 px-1.5 py-0.2 rounded border border-border hidden sm:inline">
                          {finding.subtype}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted truncate max-w-md mt-0.5">
                        {finding.evidence?.redacted_snippet || finding.description}
                      </p>
                    </div>
                  </div>

                  {/* Right: Process, Compliance, Status, Time, Arrow */}
                  <div className="flex items-center gap-3 sm:gap-6 shrink-0 text-xs">
                    <div className="hidden md:flex items-center gap-1.5 text-muted text-[11px]">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-mono">{finding.process_name ?? "system"}</span>
                    </div>

                    {/* Compliance chips */}
                    <div className="hidden sm:flex items-center gap-1">
                      {finding.compliance?.slice(0, 2).map((c) => (
                        <span
                          key={c}
                          className="text-[11px] px-1.5 py-0.2 rounded bg-surface border border-border text-muted"
                        >
                          {c}
                        </span>
                      ))}
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-sm font-semibold  ${
                        finding.status === "open"
                          ? "bg-red-500/15 text-text border border-red-500/30"
                          : finding.status === "acknowledged"
                          ? "bg-amber-500/15 text-text border border-amber-500/30"
                          : "bg-emerald-500/15 text-text border border-emerald-500/30"
                      }`}
                    >
                      {finding.status}
                    </span>

                    <span className="text-muted text-[11px] whitespace-nowrap">
                      {timeAgo(finding.ts)}
                    </span>

                    <ChevronRight className="w-4 h-4 text-muted group-hover:text-cyan-400 transition-colors hidden sm:block" />
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
                className={`p-4 flex flex-col justify-between transition-colors ${
                  isSelected ? "border-cyan-400/50 bg-cyan-950/20" : ""
                } ${
                  isCritical && finding.status === "open"
                    ? "border-red-500/35 bg-red-950/10 "
                    : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <SeverityPill severity={finding.severity} size="xs" />
                    <div className="flex items-center gap-2">
                      <span className=" text-[11px] text-muted">
                        {timeAgo(finding.ts)}
                      </span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => toggleSelectOne(finding.id, e)}
                        onChange={() => {}}
                        className="rounded-xs cursor-pointer"
                      />
                    </div>
                  </div>

                  <h3 className="font-display font-semibold text-sm text-text leading-snug line-clamp-2">
                    {finding.title}
                  </h3>

                  <p className="font-mono text-[11px] text-muted line-clamp-2 mt-1.5 leading-relaxed bg-surface-solid p-2 rounded border border-border">
                    {finding.evidence?.redacted_snippet || finding.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted text-[11px]">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-mono">{finding.process_name ?? "unknown"}</span>
                  </div>

                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-sm font-semibold  ${
                      finding.status === "open"
                        ? "bg-red-500/15 text-text"
                        : "bg-emerald-500/15 text-text"
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
