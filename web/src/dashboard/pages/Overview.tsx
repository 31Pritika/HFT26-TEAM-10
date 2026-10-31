import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ShieldAlert, ArrowRight, ExternalLink, Shield, Zap, Activity, Database } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import { GlassCard, RiskGauge, getPosture, Button, Skeleton, SEVERITY_META } from "../../shared/ui";
import type { Severity } from "../../shared/types";

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Colors for provider donut
const PROVIDER_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: "var(--elevated)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
  },
  labelStyle: { color: "var(--text)", fontWeight: 500, marginBottom: "4px" },
  itemStyle: { color: "var(--text)" },
};

// Stagger container animation
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export default function Overview() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [timeWindow, setTimeWindow] = useState<"1h" | "6h" | "24h" | "7d">("24h");

  // Fetch overview data from shared api
  const { data: report } = useQuery({
    queryKey: ["report", "7d"],
    queryFn: () => api.getReport("7d"),
  });
  const recommendations = report?.recommendations?.slice(0, 3) ?? [];

  const { data: overview, isLoading } = useQuery({
    queryKey: ["overview", timeWindow],
    queryFn: () => api.getOverview(timeWindow),
    staleTime: 10_000,
  });

  // Stats and collector reasons arrive on the live stream
  const storeStats = useAppStore((state) => state.stats);
  const collectorStates = useAppStore((state) => state.collectors);

  const riskScore = storeStats?.risk_score ?? overview?.risk_score ?? 63;
  const riskGrade = storeStats?.risk_grade ?? overview?.risk_grade ?? "D";
  const totals = storeStats?.totals ?? overview?.totals;
  const posture = getPosture(riskScore, riskGrade);

  // Timeline chart data formatting
  const timelineData = (overview?.timeline ?? []).map((bucket) => {
    const time = new Date(bucket.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return {
      time,
      requests: bucket.requests,
      findings: bucket.findings,
    };
  });

  if (isLoading && !overview) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-72" />
        <Skeleton className="h-80" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* ==================================================================== */}
      {/* 1. GRADE: Risk gauge + posture, summary and the next step            */}
      {/* ==================================================================== */}
      <motion.div variants={itemVariants}>
        <GlassCard
          variant="default"
          glow={riskGrade === "F" || riskGrade === "D" ? "critical" : "cyan"}
          className="grid grid-cols-1 items-center gap-6 p-6 sm:p-8 md:grid-cols-[auto_1fr] md:gap-12"
        >
          <RiskGauge score={riskScore} grade={riskGrade} size="hero" showLabel={false} className="justify-self-center" />

          <div className="text-center md:text-left">
            <p className={`text-lg font-semibold ${posture.textClass}`}>{posture.label}</p>

            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted md:max-w-2xl">
              Shadow AI & unmonitored agentic connections elevate risk index to{" "}
              <span className="font-medium text-text">{riskScore}/100</span>.
              Immediate rotation required for flagged credential exfiltrations.
            </p>

            <div className="mt-5">
              <Button variant="primary" size="sm" onClick={() => navigate("/app/alerts?severity=critical")} magnetic>
                <ShieldAlert className="w-4 h-4" />
                Review Criticals ({totals?.critical ?? 0})
              </Button>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* ==================================================================== */}
      {/* 2. THREAT SURFACE: Risk tiles + compliance scores                    */}
      {/* ==================================================================== */}
      <motion.div variants={itemVariants}>
        <GlassCard variant="default" className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
            <h2 className="font-display text-base font-semibold text-text flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted" />
              Threat Surface
            </h2>
            {(() => {
              const runningCount = overview?.collectors?.filter((c) => c.running).length ?? 0;
              const totalCount = overview?.collectors?.length ?? 0;
              const allRunning = runningCount === totalCount;
              return (
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${allRunning ? "bg-low" : "bg-medium"}`} />
                  <span className="text-xs text-muted">
                    {runningCount} / {totalCount} Collectors Active
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Top Risk Vectors Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
            <div className="rounded-md border border-border bg-surface-solid p-3.5 flex flex-col justify-between">
              <span className="text-xs font-medium text-muted">Top Rogue Process</span>
              <div className="mt-2">
                <p className=" text-sm font-medium text-text truncate">
                  {overview?.top_processes?.[0]?.name ?? "python3 (agent)"}
                </p>
                <p className="text-xs text-critical mt-0.5">
                  Risk Score {overview?.top_processes?.[0]?.risk_score ?? 88}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-surface-solid p-3.5 flex flex-col justify-between">
              <span className="text-xs font-medium text-muted">Unmonitored Traffic</span>
              <div className="mt-2">
                <p className="text-sm font-medium text-text">{totals?.shadow_tools ?? 0} Tools</p>
                <p className="text-xs text-medium mt-0.5">Unsanctioned AI SaaS</p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-surface-solid p-3.5 flex flex-col justify-between">
              <span className="text-xs font-medium text-muted">Data Egress Volume</span>
              <div className="mt-2">
                <p className="text-sm font-medium text-text">{formatBytes(totals?.bytes_out ?? 0)}</p>
                <p className="text-xs text-muted mt-0.5">Across all AI hosts</p>
              </div>
            </div>
          </div>

          {/* Compliance Mini-Scorecards */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted">Compliance</span>
              <button
                onClick={() => navigate("/report")}
                className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
              >
                Executive Report <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {Object.entries(overview?.compliance ?? { DPDP: 74, GDPR: 74, SOC2: 52, "PCI-DSS": 70, ISO27001: 57 }).map(
                ([framework, score]) => {
                  const color =
                    score >= 70 ? "border-low/50 bg-low/10" : score >= 55 ? "border-medium/50 bg-medium/10" : "border-critical/50 bg-critical/10";
                  return (
                    <div
                      key={framework}
                      className="flex flex-col items-center justify-center p-2.5 rounded-md border border-border bg-surface-solid text-center"
                    >
                      <span className="text-xs font-medium text-text truncate">{framework}</span>
                      <span className={`text-sm font-semibold text-text mt-1 px-2 py-0.5 rounded-sm border ${color}`}>
                        {score}%
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          {/* Quick Jump Bar */}
          <div className="mt-4 pt-3 flex justify-end border-t border-border text-xs">
            <button
              onClick={() => navigate("/app/live")}
              className="flex items-center gap-1 text-primary hover:underline font-medium cursor-pointer"
            >
              Inspect Live Stream <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </GlassCard>
      </motion.div>

      {/* ==================================================================== */}
      {/* 3. SEVERITY DISTRIBUTION                                             */}
      {/* ==================================================================== */}
      <motion.div variants={itemVariants}>
        <GlassCard variant="default" className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-muted" />
              Severity Distribution
            </h3>
            <span className="text-xs text-muted">Active Findings</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6">
            {/* Progress bars by severity */}
            <div className="space-y-4">
              {(() => {
                const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
                const sevSum = severities.reduce((acc, s) => acc + (overview?.by_severity?.[s] ?? 0), 0) || 1;
                return severities.map((sev) => {
                  const count = overview?.by_severity?.[sev] ?? 0;
                  const pct = Math.min(100, Math.round((count / sevSum) * 100));
                  const meta = SEVERITY_META[sev];
                  const Icon = meta.icon;

                  return (
                    <div key={sev} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="capitalize font-medium text-text flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${meta.iconClass}`} />
                          {sev}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text">{count}</span>
                          <span className="text-muted">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-text/[0.06] rounded-sm overflow-hidden">
                        <motion.div
                          className={`h-full w-full origin-left rounded-sm ${meta.barClass}`}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: pct / 100 }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {recommendations.length > 0 && (
              <div className="lg:border-l lg:border-border lg:pl-10">
                <span className="text-xs font-medium text-muted block mb-2">Recommended Actions</span>
                <ul className="space-y-2 text-[13px] text-text">
                  {recommendations.map((item) => (
                    <li key={item.title} className="flex gap-2">
                      <span className="font-medium text-primary shrink-0">{item.priority}</span>
                      <span>{item.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* ==================================================================== */}
      {/* 4. CHARTS ROW: Area Timeline + Provider Donut                        */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Timeline Area Chart (8 cols) */}
        <motion.div variants={itemVariants} className="lg:col-span-8">
          <GlassCard variant="default" className="p-5 sm:p-6 flex flex-col justify-between h-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted" />
                  Traffic vs Findings Timeline (24h)
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  AI request volume against flagged security exfiltrations
                </p>
              </div>

              {/* Time window selector */}
              <div className="flex items-center gap-0.5 bg-surface-solid p-0.5 rounded-md border border-border self-start sm:self-auto">
                {(["1h", "6h", "24h", "7d"] as const).map((win) => (
                  <button
                    key={win}
                    onClick={() => setTimeWindow(win)}
                    className={`relative z-0 text-xs px-2.5 py-1 rounded-sm transition-colors ${
                      timeWindow === win ? "text-text" : "text-muted hover:text-text"
                    }`}
                  >
                    {timeWindow === win && (
                      <motion.span
                        layoutId="overview-window"
                        className="absolute inset-0 -z-10 rounded-sm bg-elevated"
                        transition={{ type: "spring", stiffness: 420, damping: 38 }}
                      />
                    )}
                    {win}
                  </button>
                ))}
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="fndGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="var(--muted)" fontSize={11} fontFamily="var(--font-sans)" tickLine={false} />
                  <YAxis stroke="var(--muted)" fontSize={11} fontFamily="var(--font-sans)" tickLine={false} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    name="AI Requests"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#reqGradient)"
                    isAnimationActive={!reducedMotion}
                    animationDuration={500}
                  />
                  <Area
                    type="monotone"
                    dataKey="findings"
                    name="Flagged Findings"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#fndGradient)"
                    isAnimationActive={!reducedMotion}
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend footer */}
            <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-border text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-xs bg-chart-1/40 border border-chart-1" />
                <span className="text-text">AI Requests</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-xs bg-chart-2/40 border border-chart-2" />
                <span className="text-text">Flagged Findings</span>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Provider Breakdown Donut Chart (4 cols) */}
        <motion.div variants={itemVariants} className="lg:col-span-4">
          <GlassCard variant="default" className="p-5 sm:p-6 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                  <Database className="w-4 h-4 text-muted" />
                  Provider Breakdown
                </h3>
                <span className="text-xs text-muted">{overview?.by_provider?.length ?? 0} Discovered</span>
              </div>

              {/* Pie/Donut Chart */}
              <div className="h-44 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={overview?.by_provider ?? []}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={3}
                      isAnimationActive={!reducedMotion}
                      animationBegin={0}
                      animationDuration={500}
                    >
                      {(overview?.by_provider ?? []).map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PROVIDER_COLORS[index % PROVIDER_COLORS.length]}
                          stroke="var(--surface)"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-semibold text-text">{totals?.ai_requests ?? 0}</span>
                  <span className="text-[11px] text-muted">Requests</span>
                </div>
              </div>

              {/* Provider Legend Chips */}
              <div className="mt-4 space-y-1 max-h-40 overflow-y-auto pr-1">
                {(overview?.by_provider ?? []).map((p, idx) => {
                  const color = PROVIDER_COLORS[idx % PROVIDER_COLORS.length];
                  const totalReqs = totals?.ai_requests || 1;
                  const pct = Math.round((p.count / totalReqs) * 100);
                  return (
                    <div
                      key={p.provider_id}
                      className="flex items-center justify-between text-xs p-1.5 rounded-sm hover:bg-elevated transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-text font-medium truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted">{p.count} reqs</span>
                        <span className="font-medium text-text w-9 text-right">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border text-center">
              <button
                onClick={() => navigate("/app/inventory")}
                className="text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                Inspect Inventory Allowlist →
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* ==================================================================== */}
      {/* 5. COLLECTORS                                                        */}
      {/* ==================================================================== */}
      <motion.div variants={itemVariants}>
        <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-text">
          <Zap className="w-4 h-4 text-muted" />
          Collectors
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            {
              id: "process_conn",
              name: "Process & Sockets",
              tech: "psutil net_connections",
            },
            {
              id: "ip_cache",
              name: "IP-Cache Resolution",
              tech: "5-min AI DNS cache",
            },
            {
              id: "dns_sni",
              name: "DNS / TLS-SNI",
              tech: "ClientHello plaintext",
            },
            {
              id: "loopback",
              name: "Loopback Sniffer",
              tech: "Ollama / LMStudio :11434",
            },
            {
              id: "agent_watch",
              name: "Agent Watchdog",
              tech: "Process-tree inspection",
            },
            {
              id: "gateway",
              name: "Proxy Gateway",
              tech: "P0 Block Stream :8789",
            },
          ].map((col) => {
            const liveState = overview?.collectors?.find((c) => c.name === col.id);
            const isRunning = liveState ? Boolean(liveState.running) : (overview?.collectors ? false : true);
            const reasonId = `collector-reason-${col.id}`;
            return (
              <div
                key={col.id}
                tabIndex={isRunning ? undefined : 0}
                aria-describedby={isRunning ? undefined : reasonId}
                className={`group relative rounded-md border bg-surface p-3.5 text-xs transition-colors hover:bg-elevated ${
                  isRunning ? "border-low/40 hover:border-low/60" : "border-border hover:border-border-strong"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${isRunning ? "bg-low ring-4 ring-low/15" : "bg-muted ring-4 ring-muted/15"}`}
                  />
                  <p className="min-w-0 truncate font-medium text-text">{col.name}</p>
                </div>
                <p className="mt-1.5 truncate text-muted">{col.tech}</p>
                <p className="mt-1 font-medium text-text">{isRunning ? "LIVE" : "STANDBY"}</p>

                {!isRunning && (
                  <div
                    id={reasonId}
                    role="tooltip"
                    className="pointer-events-none absolute inset-x-0 bottom-full z-20 mb-2 rounded-md border border-border bg-elevated p-2.5 text-text opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                  >
                    {collectorStates[col.id]?.reason || "Reason not reported"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
