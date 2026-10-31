import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ShieldAlert,
  Radio,
  Users,
  Bot,
  Layers,
  ArrowRight,
  ExternalLink,
  Shield,
  Zap,
  Lock,
  Crosshair,
  Activity,
  Database,
} from "lucide-react";
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
import {
  GlassCard,
  Stat,
  RiskGauge,
  SeverityPill,
  Button,
  Skeleton,
} from "../../shared/ui";
import type { Finding, Severity } from "../../shared/types";

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Format relative time
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

// Colors for provider donut
const PROVIDER_COLORS = [
  "#bad6f7", // cyan (Ollama / Local)
  "#86b69a", // emerald (OpenAI)
  "#c9b467", // amber (Anthropic)
  "#9dadc2", // violet (Cursor)
  "#9dadc2", // pink (Gemini)
  "#8fb0d8", // blue (Others)
];

// Stagger container animation
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export default function Overview() {
  const navigate = useNavigate();
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

  // Access live stream findings & stats from zustand
  const liveFindings = useAppStore((state) => state.findings);
  const storeStats = useAppStore((state) => state.stats);

  const [initialFindings, setInitialFindings] = useState<Finding[]>([]);

  // Seed initial findings if live feed hasn't populated yet
  useEffect(() => {
    if (liveFindings.length === 0) {
      api.getFindings({ limit: 12 }).then((res) => {
        setInitialFindings(res.items);
      });
    }
  }, [liveFindings.length]);

  // Combine live findings with seed findings (deduped, max 10)
  const displayThreats = (
    liveFindings.length > 0 ? liveFindings : initialFindings
  ).slice(0, 8);

  const riskScore = storeStats?.risk_score ?? overview?.risk_score ?? 63;
  const riskGrade = storeStats?.risk_grade ?? overview?.risk_grade ?? "D";
  const totals = storeStats?.totals ?? overview?.totals;

  // Timeline chart data formatting
  const timelineData = (overview?.timeline ?? []).map((bucket) => {
    const time = new Date(bucket.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return {
      time,
      requests: bucket.requests,
      findings: bucket.findings,
    };
  });

  // Sparkline data generation from timeline
  const requestsSparkline = timelineData.map((d) => d.requests);
  const findingsSparkline = timelineData.map((d) => d.findings);
  const riskTrendSparkline = (overview?.risk_trend ?? []).map((t) => t.score);

  if (isLoading && !overview) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* ==================================================================== */}
      {/* 1. HERO SECTION: Risk Gauge + Security Posture Brief                */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Risk Gauge Card */}
        <motion.div variants={itemVariants} className="lg:col-span-5">
          <GlassCard
            variant="default"
            glow={riskGrade === "F" || riskGrade === "D" ? "critical" : "cyan"}
            className="h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center relative overflow-hidden"
          >

            {/* Radial Gauge */}
            <RiskGauge score={riskScore} grade={riskGrade} size="hero" showLabel />

            {/* Quick posture verdict */}
            <p className="mt-4 text-xs text-muted max-w-xs leading-relaxed">
              Shadow AI & unmonitored agentic connections elevate risk index to{" "}
              <span className="font-mono text-text font-semibold">{riskScore}/100</span>.
              Immediate rotation required for flagged credential exfiltrations.
            </p>

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate("/app/alerts?severity=critical")}
                magnetic
              >
                <ShieldAlert className="w-4 h-4" />
                Review Criticals ({totals?.critical ?? 0})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/app/simulate")}
                magnetic
              >
                <Crosshair className="w-4 h-4 text-amber-400" />
                Run Attack Sim
              </Button>
            </div>
          </GlassCard>
        </motion.div>

        {/* Security Posture Executive Summary Card */}
        <motion.div variants={itemVariants} className="lg:col-span-7">
          <GlassCard variant="default" className="h-full flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div>
                  <h2 className="font-display text-lg font-bold text-text flex items-center gap-2">
                    <Shield className="w-5 h-5 text-cyan-400" />
                    Threat Surface
                  </h2>
                </div>
                {(() => {
                  const runningCount = overview?.collectors?.filter((c) => c.running).length ?? 0;
                  const totalCount = overview?.collectors?.length ?? 0;
                  const allRunning = runningCount === totalCount;
                  return (
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-sm ${allRunning ? "bg-emerald-400" : "bg-amber-400"}`} />
                      <span className={`font-mono text-[11px]  ${allRunning ? "text-emerald-400" : "text-amber-400"}`}>
                        {runningCount} / {totalCount} Collectors Active
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Top Risk Vectors Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
                <div className="rounded-xl border border-white/[0.06] bg-surface-solid/70 p-3.5 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-muted">Top Rogue Process</span>
                  <div className="mt-2">
                    <p className="font-mono text-sm font-semibold text-text truncate">
                      {overview?.top_processes?.[0]?.name ?? "python3 (agent)"}
                    </p>
                    <p className="font-mono text-xs text-red-400 mt-0.5">
                      Risk Score {overview?.top_processes?.[0]?.risk_score ?? 88}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-surface-solid/70 p-3.5 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-muted">Unmonitored Traffic</span>
                  <div className="mt-2">
                    <p className="font-mono text-sm font-semibold text-text">
                      {totals?.shadow_tools ?? 0} Tools
                    </p>
                    <p className="font-mono text-xs text-amber-400 mt-0.5">
                      Unsanctioned AI SaaS
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-surface-solid/70 p-3.5 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-muted">Data Egress Volume</span>
                  <div className="mt-2">
                    <p className="font-mono text-sm font-semibold text-text">
                      {formatBytes(totals?.bytes_out ?? 0)}
                    </p>
                    <p className="font-mono text-xs text-cyan-400 mt-0.5">
                      Across all AI hosts
                    </p>
                  </div>
                </div>
              </div>

              {/* Compliance Mini-Scorecards */}
              <div className="mt-4 pt-4 border-t border-white/[0.08]">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-semibold text-muted">
                    Compliance
                  </span>
                  <button
                    onClick={() => navigate("/report")}
                    className="flex items-center gap-1 font-mono text-xs text-cyan-400 hover:underline cursor-pointer"
                  >
                    Executive Report <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {Object.entries(overview?.compliance ?? { DPDP: 74, GDPR: 74, SOC2: 52, "PCI-DSS": 70, ISO27001: 57 }).map(
                    ([framework, score]) => {
                      const color =
                        score >= 70
                          ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                          : score >= 55
                          ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                          : "text-red-400 border-red-500/30 bg-red-500/10";
                      return (
                        <div
                          key={framework}
                          className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-white/[0.06] bg-surface-solid/50 text-center"
                        >
                          <span className="font-mono text-[11px] font-bold text-text truncate">
                            {framework}
                          </span>
                          <span className={`font-mono text-sm font-bold mt-1 px-2 py-0.5 rounded-sm border ${color}`}>
                            {score}%
                          </span>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </div>

            {/* Quick Jump Bar */}
            <div className="mt-4 pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] text-xs text-muted">
              <span />
              <button
                onClick={() => navigate("/app/live")}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium"
              >
                Inspect Live Stream <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* ==================================================================== */}
      {/* 2. 8 KPI STAT CARDS (Count-up + Sparkline)                           */}
      {/* ==================================================================== */}
      <motion.div variants={itemVariants}>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Stat
            label="Total AI Events"
            value={totals?.events ?? 0}
            icon={Radio}
            variant="cyan"
            sparkline={requestsSparkline.slice(0, 10)}
            sparklineColor="#bad6f7"
            sublabel="Audited telemetry packets"
          />

          <Stat
            label="AI Requests"
            value={totals?.ai_requests ?? 0}
            icon={Activity}
            variant="cyan"
            sparkline={requestsSparkline.slice(10, 20)}
            sparklineColor="#98c0ef"
            sublabel="Inference API queries"
          />

          <Stat
            label="Open Findings"
            value={totals?.findings_open ?? 0}
            icon={ShieldAlert}
            variant="warning"
            sparkline={findingsSparkline.slice(0, 10)}
            sparklineColor="#c9b467"
            sublabel="Awaiting remediation"
          />

          <Stat
            label="Critical Alerts"
            value={totals?.critical ?? 0}
            icon={ShieldAlert}
            variant="critical"
            sparkline={riskTrendSparkline.slice(0, 10)}
            sparklineColor="#df6a68"
            sublabel="Active data exfiltration"
          />

          <Stat
            label="Leaked Secrets"
            value={totals?.secrets ?? 0}
            icon={Lock}
            variant="critical"
            sparkline={findingsSparkline.slice(5, 15)}
            sparklineColor="#df6a68"
            sublabel="AWS / OpenAI / JWT / Keys"
          />

          <Stat
            label="PII Exfiltrations"
            value={totals?.pii ?? 0}
            icon={Users}
            variant="warning"
            sparkline={findingsSparkline.slice(10, 20)}
            sparklineColor="#d4915a"
            sublabel="Aadhaar / PAN / CC / Emails"
          />

          <Stat
            label="Agent Actions"
            value={totals?.agent_actions ?? 0}
            icon={Bot}
            variant="violet"
            sparkline={requestsSparkline.slice(14, 24)}
            sparklineColor="#9dadc2"
            sublabel="Shell / FS / Tool calls"
          />

          <Stat
            label="Shadow AI Tools"
            value={totals?.shadow_tools ?? 0}
            icon={Layers}
            variant="cyan"
            sparkline={riskTrendSparkline.slice(14, 24)}
            sparklineColor="#bad6f7"
            sublabel="Unsanctioned services"
          />
        </div>
      </motion.div>

      {/* ==================================================================== */}
      {/* 3. CHARTS ROW: Area Timeline + Provider Donut + Severity Breakdown    */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Timeline Area Chart (8 cols) */}
        <motion.div variants={itemVariants} className="lg:col-span-8">
          <GlassCard variant="default" className="p-5 sm:p-6 flex flex-col justify-between h-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="font-display text-base font-bold text-text flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Traffic vs Findings Timeline (24h)
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  AI request volume against flagged security exfiltrations
                </p>
              </div>

              {/* Time window selector */}
              <div className="flex items-center gap-1 bg-surface-solid/80 p-1 rounded-lg border border-border self-start sm:self-auto">
                {(["1h", "6h", "24h", "7d"] as const).map((win) => (
                  <button
                    key={win}
                    onClick={() => setTimeWindow(win)}
                    className={`font-mono text-xs px-2.5 py-1 rounded transition-colors ${
                      timeWindow === win
                        ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                        : "text-muted hover:text-text"
                    }`}
                  >
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
                      <stop offset="5%" stopColor="#bad6f7" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#bad6f7" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="fndGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#df6a68" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#df6a68" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    stroke="#4B5368"
                    fontSize={11}
                    fontFamily="JetBrains Mono"
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#4B5368"
                    fontSize={11}
                    fontFamily="JetBrains Mono"
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f1219",
                      border: "1px solid rgba(186,215,247, 0.2)",
                      borderRadius: "10px",
                      fontFamily: "JetBrains Mono",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "#d8e2ee", fontWeight: 600, marginBottom: "4px" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    name="AI Requests"
                    stroke="#bad6f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#reqGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="findings"
                    name="Flagged Findings"
                    stroke="#df6a68"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#fndGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend footer */}
            <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-white/[0.06] text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-cyan-400/40 border border-cyan-400" />
                <span className="text-text">AI Requests</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-red-500/40 border border-red-500" />
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
                <h3 className="font-display text-base font-bold text-text flex items-center gap-2">
                  <Database className="w-4 h-4 text-violet-400" />
                  Provider Breakdown
                </h3>
                <span className="font-mono text-[11px] text-muted">
                  {overview?.by_provider?.length ?? 0} Discovered
                </span>
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
                    >
                      {(overview?.by_provider ?? []).map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PROVIDER_COLORS[index % PROVIDER_COLORS.length]}
                          stroke="#0b0d13"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f1219",
                        border: "1px solid rgba(186,215,247, 0.2)",
                        borderRadius: "8px",
                        fontFamily: "JetBrains Mono",
                        fontSize: "11px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-mono text-xl font-bold text-text">
                    {totals?.ai_requests ?? 0}
                  </span>
                  <span className="text-[10px] font-mono text-muted">Requests</span>
                </div>
              </div>

              {/* Provider Legend Chips */}
              <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                {(overview?.by_provider ?? []).map((p, idx) => {
                  const color = PROVIDER_COLORS[idx % PROVIDER_COLORS.length];
                  const totalReqs = totals?.ai_requests || 1;
                  const pct = Math.round((p.count / totalReqs) * 100);
                  return (
                    <div
                      key={p.provider_id}
                      className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-text font-medium truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted">{p.count} reqs</span>
                        <span className="font-bold text-text w-9 text-right">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] text-center">
              <button
                onClick={() => navigate("/app/inventory")}
                className="text-xs font-medium text-cyan-400 hover:underline"
              >
                Inspect Inventory Allowlist →
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* ==================================================================== */}
      {/* 4. LOWER ROW: Live Threat Feed + Severity Breakdown Bars              */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Live Threat Feed (8 cols) */}
        <motion.div variants={itemVariants} className="lg:col-span-8">
          <GlassCard variant="default" className="p-5 sm:p-6 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-sm h-2.5 w-2.5 bg-cyan-500" />
                  </span>
                  <h3 className="font-display text-base font-bold text-text">
                    Live Threat Feed
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted hidden sm:inline">
                    Streaming telemetric detections
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => navigate("/app/alerts")}
                  >
                    View All
                  </Button>
                </div>
              </div>

              {/* Feed items list */}
              <div className="space-y-2.5">
                {displayThreats.map((finding) => (
                  <motion.div
                    key={finding.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => navigate(`/app/alerts/${finding.id}`)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      finding.severity === "critical"
                        ? "bg-red-950/20 border-red-500/30 hover:border-red-500/50 "
                        : "bg-surface-solid/60 border-white/[0.06] hover:border-white/20 hover:bg-surface-solid"
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <SeverityPill severity={finding.severity} size="xs" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-xs sm:text-sm text-text group-hover:text-cyan-300 transition-colors truncate">
                            {finding.title}
                          </p>
                          <span className="font-mono text-[10px] text-muted hidden md:inline">
                            [{finding.type}]
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-muted truncate mt-0.5">
                          {finding.evidence?.redacted_snippet || finding.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 font-mono text-[11px] text-muted">
                      <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 text-cyan-300 text-[10px]">
                        {finding.process_name ?? "unknown"}
                      </span>
                      <span>{timeAgo(finding.ts)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-muted">
              <span>Telemetry buffer: live capped at 200 items</span>
              <button
                onClick={() => navigate("/app/live")}
                className="text-cyan-400 hover:underline font-medium cursor-pointer"
              >
                Open Live Telemetry Console →
              </button>
            </div>
          </GlassCard>
        </motion.div>

        {/* Severity Breakdown Bars (4 cols) */}
        <motion.div variants={itemVariants} className="lg:col-span-4">
          <GlassCard variant="default" className="p-5 sm:p-6 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold text-text flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  Severity Distribution
                </h3>
                <span className="font-mono text-[11px] text-muted">Active Findings</span>
              </div>

              {/* Progress bars by severity */}
              <div className="space-y-4 my-2">
                {(() => {
                  const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
                  const sevSum = severities.reduce((acc, s) => acc + (overview?.by_severity?.[s] ?? 0), 0) || 1;
                  return severities.map((sev) => {
                    const count = overview?.by_severity?.[sev] ?? 0;
                    const pct = Math.min(100, Math.round((count / sevSum) * 100));

                    const colors: Record<Severity, { bar: string; text: string }> = {
                      critical: { bar: "bg-[#df6a68]", text: "text-[#df6a68]" },
                      high: { bar: "bg-[#d4915a]", text: "text-[#d4915a]" },
                      medium: { bar: "bg-[#c9b467]", text: "text-[#c9b467]" },
                      low: { bar: "bg-[#86b69a]", text: "text-[#86b69a]" },
                      info: { bar: "bg-[#8fb0d8]", text: "text-[#8fb0d8]" },
                    };

                    return (
                      <div key={sev} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="capitalize font-semibold text-text flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-sm ${colors[sev].bar}`} />
                            {sev}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={colors[sev].text}>{count}</span>
                            <span className="text-neutral-400 text-[10px]">({pct}%)</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-white/[0.06] rounded-sm overflow-hidden">
                          <motion.div
                            className={`h-full rounded-sm ${colors[sev].bar}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {recommendations.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border">
                <span className="font-mono text-[11px] text-muted block mb-2">Recommended Actions</span>
                <ul className="space-y-1.5 text-xs text-text">
                  {recommendations.map((item) => (
                    <li key={item.title} className="flex gap-2">
                      <span className="font-mono text-primary shrink-0">{item.priority}</span>
                      <span>{item.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>
        </motion.div>
      </div>

      {/* ==================================================================== */}
      {/* 5. COLLECTORS STATUS STRIP                                           */}
      {/* ==================================================================== */}
      <motion.div variants={itemVariants}>
        <GlassCard variant="solid" className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="font-display text-sm font-bold text-text">
                Collectors
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
              return (
                <div
                  key={col.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-white/[0.06] bg-[#11141c] text-xs font-mono"
                >
                  <div className="min-w-0 pr-1">
                    <p className="font-semibold text-text truncate">{col.name}</p>
                    <p className="text-[10px] text-muted mt-0.5 truncate">{col.tech}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span className={`w-2 h-2 rounded-sm ${isRunning ? "bg-emerald-400 " : "bg-neutral-600"}`} />
                    <span className={`text-[10px] font-bold  ${isRunning ? "text-emerald-400" : "text-neutral-400"}`}>
                      {isRunning ? "LIVE" : "STANDBY"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  );
}
