import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Layers,
  ShieldCheck,
  ShieldAlert,
  Search,
  Cpu,
  Bot,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Radio,
} from "lucide-react";
import { api } from "../../shared/api";
import {
  GlassCard,
  Badge,
  Button,
  Skeleton,
} from "../../shared/ui";
import type { InventoryItem, ProviderCategory } from "../../shared/types";
import { toast } from "sonner";

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
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const CATEGORY_META: Record<ProviderCategory, { label: string; variant: "cyan" | "violet" | "high" | "mono" | "default" }> = {
  ai_coding: { label: "AI Coding Assistant", variant: "cyan" },
  cloud_llm: { label: "Cloud LLM Inference", variant: "violet" },
  local_llm: { label: "Local LLM Server", variant: "high" },
  ai_saas: { label: "AI SaaS Platform", variant: "default" },
  unknown: { label: "Unknown Protocol", variant: "mono" },
};

type FilterChip = "all" | "shadow" | "sanctioned" | "agents" | "high_risk";

export default function Inventory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<FilterChip>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Optimistic local override for sanctioned status
  const [sanctionedOverrides, setSanctionedOverrides] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => api.getInventory(),
    staleTime: 10_000,
  });

  const rawItems: InventoryItem[] = data?.items || [];

  // Apply optimistic overrides
  const items = useMemo(() => {
    return rawItems.map((item) => ({
      ...item,
      sanctioned: sanctionedOverrides[item.id] !== undefined ? sanctionedOverrides[item.id] : item.sanctioned,
    }));
  }, [rawItems, sanctionedOverrides]);

  // Counts for summary bar
  const sanctionedCount = items.filter((i) => i.sanctioned).length;
  const shadowCount = items.filter((i) => !i.sanctioned).length;
  const totalCount = items.length || 1;
  const sanctionedPct = Math.round((sanctionedCount / totalCount) * 100);
  const shadowPct = 100 - sanctionedPct;

  // Toggle Sanctioned Mutation
  const toggleSanctionedMutation = useMutation({
    mutationFn: async ({ item, nextState }: { item: InventoryItem; nextState: boolean }) => {
      // Optimistic state
      setSanctionedOverrides((prev) => ({
        ...prev,
        [item.id]: nextState,
      }));

      // Fetch current policy and update sanctioned_processes
      const currentPolicy = await api.getPolicies();
      let processes = currentPolicy.sanctioned_processes || [];
      if (nextState) {
        if (!processes.includes(item.process_name)) processes.push(item.process_name);
      } else {
        processes = processes.filter((p) => p !== item.process_name);
      }
      return api.updatePolicies({ sanctioned_processes: processes });
    },
    onSuccess: (_, { item, nextState }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast.success(
        nextState
          ? `Sanctioned process: ${item.process_name}`
          : `Marked ${item.process_name} as Unsanctioned Shadow AI`,
      );
    },
    onError: (_, { item }) => {
      // Revert optimistic state
      setSanctionedOverrides((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      toast.error(`Failed to update policy for ${item.process_name}`);
    },
  });

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeFilter === "shadow" && item.sanctioned) return false;
      if (activeFilter === "sanctioned" && !item.sanctioned) return false;
      if (activeFilter === "agents" && !item.is_agent) return false;
      if (activeFilter === "high_risk" && item.risk_score < 70) return false;

      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mName = item.process_name.toLowerCase().includes(q);
        const mExe = item.exe?.toLowerCase().includes(q);
        const mProviders = item.provider_ids.some((p) => p.toLowerCase().includes(q));
        if (!mName && !mExe && !mProviders) return false;
      }

      return true;
    });
  }, [items, activeFilter, categoryFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ==================================================================== */}
      {/* 1. HEADER & SUMMARY SPLIT BAR                                        */}
      {/* ==================================================================== */}
      <GlassCard variant="default" className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-text">
                Shadow AI & Discovered Tools Inventory
              </h1>
              <p className="text-xs text-muted mt-0.5">
                Audit and governance of local processes, agent workers, and background helpers communicating with AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs shrink-0">
            <span className="px-3 py-1 rounded-sm border border-red-500/30 bg-red-500/10 text-red-400 font-bold">
              {shadowCount} Shadow AI
            </span>
            <span className="px-3 py-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-bold">
              {sanctionedCount} Sanctioned
            </span>
          </div>
        </div>

        {/* Animated Split Summary Bar */}
        <div className="pt-2 border-t border-white/[0.08] space-y-1.5 font-mono text-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Sanctioned Tools ({sanctionedPct}%)</span>
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Unsanctioned Shadow AI ({shadowPct}%)</span>
            </span>
          </div>

          <div className="h-2.5 w-full bg-white/[0.06] rounded-sm overflow-hidden flex">
            <motion.div
              className="h-full bg-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${sanctionedPct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              className="h-full bg-red-500"
              initial={{ width: 0 }}
              animate={{ width: `${shadowPct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 2. FILTER CHIPS & SEARCH TOOLBAR                                     */}
      {/* ==================================================================== */}
      <GlassCard variant="default" className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap pb-1 sm:pb-0 scrollbar-none font-mono text-xs">
            {[
              { id: "all" as const, label: "All Discovered" },
              { id: "shadow" as const, label: `Shadow AI (${shadowCount})` },
              { id: "sanctioned" as const, label: `Sanctioned (${sanctionedCount})` },
              { id: "agents" as const, label: "Autonomous Agents" },
              { id: "high_risk" as const, label: "High Risk (>70)" },
            ].map(({ id, label }) => {
              const active = activeFilter === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveFilter(id)}
                  className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold "
                      : "bg-surface border-white/10 text-muted hover:text-text hover:bg-white/[0.04]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Category Dropdown */}
          <div className="shrink-0">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#0d0f16] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-cyan-400 font-mono"
            >
              <option value="all">All Categories</option>
              <option value="ai_coding">AI Coding Assistants</option>
              <option value="cloud_llm">Cloud LLM Inference</option>
              <option value="local_llm">Local LLM Servers</option>
              <option value="ai_saas">AI SaaS Web Apps</option>
            </select>
          </div>
        </div>

        {/* Search text input */}
        <div className="relative pt-2 border-t border-white/[0.06]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-5 text-muted" />
          <input
            type="text"
            placeholder="Filter by process name, binary executable, or provider ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0d0f16] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-text placeholder:text-muted/60 focus:outline-none focus:border-cyan-400 font-mono"
          />
        </div>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 3. INVENTORY CARDS GRID                                              */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item, idx) => {
          const cat = CATEGORY_META[item.category] || CATEGORY_META.unknown;
          const isHighRisk = item.risk_score >= 70;
          const isNew = idx < 2 || item.findings_count > 4; // Visual "new this session" indicator

          return (
            <GlassCard
              key={item.id}
              variant="default"
              className={`p-5 flex flex-col justify-between transition-all relative overflow-hidden ${
                !item.sanctioned && isHighRisk
                  ? "border-red-500/35 bg-red-950/15 "
                  : "hover:border-white/20"
              }`}
            >
              {/* "NEW" Ribbon in upper right */}
              {isNew && (
                <div className="absolute top-2 right-2 flex items-center gap-1 font-mono text-[9px] font-bold px-2 py-0.5 rounded-sm bg-cyan-400 text-black">
                  <Sparkles className="w-2.5 h-2.5" />
                  New This Session
                </div>
              )}

              <div>
                {/* Header: Process & Category */}
                <div className="flex items-start justify-between gap-2 mb-2 pr-16">
                  <div>
                    <h3 className="font-display font-bold text-base text-text flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate">{item.process_name}</span>
                    </h3>
                    <p className="font-mono text-[10px] text-muted truncate max-w-xs mt-0.5" title={item.exe || ""}>
                      {item.exe || "Endpoint native executable"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 my-2">
                  <Badge variant={cat.variant} size="xs">
                    {cat.label}
                  </Badge>
                  {item.is_agent && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-sm bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-1">
                      <Bot className="w-3 h-3" />
                      Agent
                    </span>
                  )}
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded-sm font-bold ${
                      isHighRisk
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    Risk {item.risk_score}
                  </span>
                </div>

                {/* Provider Chips */}
                <div className="mt-3 space-y-1">
                  <span className="text-[10px] font-mono text-muted/70 block">
                    Contacted AI Providers:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {item.provider_ids.map((p) => (
                      <span
                        key={p}
                        className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-solid border border-white/10 text-cyan-300"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Telemetry Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/[0.06] font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-muted block">Inference Reqs</span>
                    <span className="text-text font-bold">{item.request_count}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Data Egress</span>
                    <span className="text-text font-bold">{formatBytes(item.bytes_out)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Exfiltrations</span>
                    <span className={`font-bold ${item.findings_count > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {item.findings_count} findings
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Last Active</span>
                    <span className="text-muted">{timeAgo(item.last_seen)}</span>
                  </div>
                </div>
              </div>

              {/* Sanctioned Toggle & Actions Footer */}
              <div className="mt-5 pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2">
                {/* Interactive Sanctioned Toggle Switch */}
                <button
                  onClick={() =>
                    toggleSanctionedMutation.mutate({
                      item,
                      nextState: !item.sanctioned,
                    })
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono text-xs font-bold transition-all cursor-pointer ${
                    item.sanctioned
                      ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25 "
                      : "bg-red-500/15 border-red-500/35 text-red-400 hover:bg-red-500/25"
                  }`}
                  title="Click to toggle Sanctioned vs Unsanctioned policy"
                >
                  {item.sanctioned ? (
                    <>
                      <ToggleRight className="w-4 h-4 text-emerald-400" />
                      <span>SANCTIONED</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4 text-red-400" />
                      <span>UNSANCTIONED</span>
                    </>
                  )}
                </button>

                {/* Inspect Traffic Link */}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => navigate(`/app/live?process=${encodeURIComponent(item.process_name)}`)}
                >
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Traffic</span>
                </Button>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
