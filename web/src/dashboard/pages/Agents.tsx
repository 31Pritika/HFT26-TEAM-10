import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Terminal,
  FileCode,
  Globe,
  Database,
  Cpu,
  Check,
  X,
  Clock,
  Sliders,
  Power,
} from "lucide-react";
import { api } from "../../shared/api";
import {
  GlassCard,
  SeverityPill,
  Button,
  Skeleton,
} from "../../shared/ui";
import type { Severity } from "../../shared/types";
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

// Framework badge styles & names
const FRAMEWORK_META: Record<string, { label: string; color: string }> = {
  langchain: { label: "LangChain", color: "text-text border-emerald-500/30 bg-emerald-500/10" },
  autogpt: { label: "AutoGPT", color: "text-text border-amber-500/30 bg-amber-500/10" },
  crewai: { label: "CrewAI", color: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
  cursor: { label: "Cursor Agent", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" },
  claude_code: { label: "Claude Code", color: "text-text border-orange-500/30 bg-orange-500/10" },
  aider: { label: "Aider", color: "text-text border-blue-500/30 bg-blue-500/10" },
  open_interpreter: { label: "Open Interpreter", color: "text-text border-red-500/30 bg-red-500/10" },
  custom: { label: "Custom Agent", color: "text-muted border-border bg-surface" },
};

const MARKED_KEY = "shadowscope_marked_agents";

function loadMarkedAgents(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(MARKED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveMarkedAgents(ids: Set<string>) {
  try {
    localStorage.setItem(MARKED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage can be blocked; the mark then lasts until reload.
  }
}

export default function Agents() {
  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
    staleTime: 10_000,
  });

  const agents = data?.items || [];
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Local optimistic permission & status overrides
  const [blockedAgents, setBlockedAgents] = useState<Set<string>>(loadMarkedAgents);

  // Auto-select first agent once data loads
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  const isBlocked = activeAgent ? blockedAgents.has(activeAgent.id) || activeAgent.status === "blocked" : false;
  const currentPermissions = activeAgent ? activeAgent.permissions : null;

  // ShadowScope watches agents and has no way to stop them, so this only marks the session for the analyst.
  const handleMarkBlocked = (agentId: string) => {
    setBlockedAgents((prev) => {
      const next = new Set(prev).add(agentId);
      saveMarkedAgents(next);
      return next;
    });
    toast.info("Marked as blocked in this browser", {
      description: "ShadowScope only observes. Stop the process yourself, or block its provider in Policies.",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-72 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="h-96 lg:col-span-4 rounded-xl" />
          <Skeleton className="h-96 lg:col-span-8 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-text">
                Autonomous Agents & Permission Governance
              </h1>
              <p className="text-xs text-muted mt-0.5">
                Tool calls, permissions and autonomy for each agent session.
              </p>
            </div>
          </div>
        </div>

        {/* Aggregate Stats Badges */}
        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1 rounded-sm border border-violet-500/30 bg-violet-500/10 text-violet-300">
            {agents.length} Agent Sessions
          </span>
          <span className="px-3 py-1 rounded-sm border border-red-500/30 bg-red-500/10 text-text font-semibold">
            {agents.filter((a) => a.risk_score >= 80).length} High Risk
          </span>
        </div>
      </div>

      {/* Main Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ==================================================================== */}
        {/* Left: Agent Session List (4 cols)                                    */}
        {/* ==================================================================== */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-muted">
            <span>Discovered Agents ({agents.length})</span>
            <span>Autonomy / Risk</span>
          </div>

          <div className="space-y-2.5">
            {agents.map((agent) => {
              const selected = agent.id === selectedAgentId;
              const blocked = blockedAgents.has(agent.id) || agent.status === "blocked";
              const fw = FRAMEWORK_META[agent.framework] || FRAMEWORK_META.custom;

              return (
                <GlassCard
                  key={agent.id}
                  variant="default"
                  interactive
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`p-3.5 flex flex-col gap-2 transition-colors cursor-pointer ${
                    selected
                      ? "border-cyan-400/50 bg-cyan-950/20 "
                      : "hover:border-border-strong"
                  } ${blocked ? "border-dashed" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${fw.color}`}>
                        {fw.label}
                      </span>
                      <span className="font-mono text-xs font-semibold text-text truncate">
                        {agent.process_name}
                      </span>
                      {agent.pid && (
                        <span className="font-mono text-[11px] text-muted">:{agent.pid}</span>
                      )}
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`text-[11px] px-2 py-0.2 rounded-sm font-semibold  ${
                        blocked
                          ? "bg-red-500/20 text-text border border-red-500/30"
                          : agent.status === "active"
                          ? "bg-emerald-500/15 text-text border border-emerald-500/30"
                          : "bg-text/10 text-muted"
                      }`}
                    >
                      {blocked ? "marked" : agent.status}
                    </span>
                  </div>

                  {/* Autonomy Meter & Risk Indicators */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted">Autonomy:</span>
                      <span
                        className={`font-semibold ${
                          agent.autonomy_score >= 80
                            ? "text-red-400"
                            : agent.autonomy_score >= 50
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {agent.autonomy_score}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted">Risk:</span>
                      <span
                        className={`font-semibold px-1.5 py-0.2 rounded ${
                          agent.risk_score >= 80
                            ? "bg-red-500/20 text-text"
                            : "bg-amber-500/20 text-text"
                        }`}
                      >
                        {agent.risk_score}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{agent.actions?.length || 0} tool actions</span>
                    <span>seen {timeAgo(agent.last_seen)}</span>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* Right: Selected Agent Detail & Matrix (8 cols)                       */}
        {/* ==================================================================== */}
        {activeAgent && currentPermissions && (
          <div className="lg:col-span-8 space-y-6">
            {/* Active Agent Banner */}
            <GlassCard
              variant="default"
              glow={isBlocked ? "critical" : "violet"}
              className="p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/25">
                      {activeAgent.id}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-sm font-semibold  ${
                        isBlocked
                          ? "bg-red-500/20 text-text border border-red-500/40 "
                          : "bg-emerald-500/20 text-text border border-emerald-500/40"
                      }`}
                    >
                      {isBlocked ? "status: marked blocked" : `status: ${activeAgent.status}`}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      PID: {activeAgent.pid ?? "N/A"}
                    </span>
                  </div>

                  <h2 className="font-display text-xl font-semibold text-text">
                    {activeAgent.process_name}{" "}
                    <span className="text-muted text-base font-normal">
                      ({FRAMEWORK_META[activeAgent.framework]?.label ?? activeAgent.framework})
                    </span>
                  </h2>
                  <p className=" text-xs text-muted mt-1">
                    Connected to Provider:{" "}
                    <span className="text-text font-semibold">{activeAgent.provider_id ?? "Direct AI API"}</span>{" "}
                    · Started {timeAgo(activeAgent.started)}
                  </p>
                </div>

                {/* Kill Switch Button */}
                <div className="shrink-0">
                  <Button
                    variant={isBlocked ? "secondary" : "danger"}
                    size="sm"
                    disabled={isBlocked}
                    onClick={() => handleMarkBlocked(activeAgent.id)}
                    className="w-full sm:w-auto font-semibold"
                    magnetic
                  >
                    <Power className="w-4 h-4 text-red-400" />
                    {isBlocked ? "Marked Blocked" : "Mark as Blocked"}
                  </Button>
                </div>
              </div>

              {/* Autonomy vs Risk Score Dial strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border text-xs">
                <div className="p-3 rounded-xl border border-border bg-surface">
                  <span className="text-[11px] text-muted block mb-1">Autonomy Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-red-400">{activeAgent.autonomy_score}</span>
                    <span className="text-muted">/ 100</span>
                  </div>
                  <span className="text-[11px] text-muted mt-1 block">Machine-speed execution</span>
                </div>

                <div className="p-3 rounded-xl border border-border bg-surface">
                  <span className="text-[11px] text-muted block mb-1">Risk Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-critical">{activeAgent.risk_score}</span>
                    <span className="text-muted">/ 100</span>
                  </div>
                  <span className="text-[11px] text-muted mt-1 block">Exfiltration hazard</span>
                </div>

                <div className="p-3 rounded-xl border border-border bg-surface">
                  <span className="text-[11px] text-muted block mb-1">Inference Requests</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-cyan-400">{activeAgent.requests}</span>
                    <span className="text-muted">total</span>
                  </div>
                  <span className="text-[11px] text-muted mt-1 block">Model interaction loops</span>
                </div>
              </div>
            </GlassCard>

            {/* ==================================================================== */}
            {/* Permission Matrix as Glowing Toggles with Danger Colors             */}
            {/* ==================================================================== */}
            <GlassCard variant="default" className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-display text-sm font-semibold text-text">
                    Agent Capability & Permission Matrix
                  </h3>
                </div>
                <span className=" text-[11px] text-muted">
                  Inferred from declared tools
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  {
                    key: "shell" as const,
                    label: "Shell Execution",
                    desc: "bash, powershell, cmd.exe",
                    icon: Terminal,
                    danger: true,
                  },
                  {
                    key: "filesystem_read" as const,
                    label: "Filesystem Read",
                    desc: "Local file inspection",
                    icon: FileCode,
                    danger: false,
                  },
                  {
                    key: "filesystem_write" as const,
                    label: "Filesystem Write",
                    desc: "File modification & creation",
                    icon: FileCode,
                    danger: true,
                  },
                  {
                    key: "network" as const,
                    label: "External Network",
                    desc: "Outbound socket egress",
                    icon: Globe,
                    danger: true,
                  },
                  {
                    key: "internal_api" as const,
                    label: "Internal APIs",
                    desc: "Intranet & service mesh",
                    icon: Database,
                    danger: true,
                  },
                  {
                    key: "code_exec" as const,
                    label: "Code Execution",
                    desc: "Python REPL / eval()",
                    icon: Cpu,
                    danger: true,
                  },
                ].map(({ key, label, desc, icon: Icon, danger }) => {
                  const enabled = currentPermissions[key];
                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border flex flex-col justify-between ${
                        enabled
                          ? danger
                            ? "bg-red-950/25 border-red-500/40 "
                            : "bg-cyan-950/20 border-cyan-500/30"
                          : "bg-surface-solid border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Icon
                          className={`w-4 h-4 ${
                            enabled ? (danger ? "text-red-400" : "text-cyan-400") : "text-muted"
                          }`}
                        />
                        <span
                          className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[11px] font-semibold ${
                            enabled ? (danger ? "bg-critical text-bg" : "bg-primary text-bg") : "bg-text/10 text-muted"
                          }`}
                        >
                          {enabled ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-xs text-text">{label}</p>
                        <p className="text-[11px] text-muted mt-0.5 line-clamp-1">{desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* ==================================================================== */}
            {/* Tools-Used Usage Bars                                               */}
            {/* ==================================================================== */}
            {activeAgent.tools_used && activeAgent.tools_used.length > 0 && (
              <GlassCard variant="default" className="p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <h3 className="font-display text-sm font-semibold text-text flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Tools-Used Breakdown
                  </h3>
                  <span className=" text-[11px] text-muted">
                    Total Calls: {activeAgent.tools_used.reduce((acc, t) => acc + t.count, 0)}
                  </span>
                </div>

                <div className="space-y-3">
                  {activeAgent.tools_used.map((tool) => {
                    const maxCount = Math.max(...activeAgent.tools_used.map((t) => t.count), 1);
                    const pct = Math.round((tool.count / maxCount) * 100);
                    return (
                      <div key={tool.name} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-text">{tool.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted">{tool.count} invocations</span>
                            <SeverityPill severity={tool.severity as Severity} size="xs" />
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-text/[0.06] rounded-sm overflow-hidden">
                          <div
                            className={`h-full rounded-sm ${
                              tool.severity === "critical"
                                ? "bg-red-500 "
                                : "bg-cyan-400"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}

            {/* ==================================================================== */}
            {/* Vertical Dangerous Action Timeline                                  */}
            {/* ==================================================================== */}
            <GlassCard variant="default" className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <h3 className="font-display text-sm font-semibold text-text flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-400" />
                  Chronological Action Timeline
                </h3>
                <span className=" text-[11px] text-muted">
                  {activeAgent.actions?.length || 0} Events Audited
                </span>
              </div>

              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                {activeAgent.actions && activeAgent.actions.length > 0 ? (
                  activeAgent.actions.map((act, idx) => (
                    <div key={idx} className="relative group">
                      {/* Timeline Node Dot */}
                      <div
                        className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-sm border-2 border-bg ${
                          act.severity === "critical"
                            ? "bg-red-500 ring-4 ring-red-500/20"
                            : act.severity === "high"
                            ? "bg-orange-400"
                            : "bg-cyan-400"
                        }`}
                      />

                      <div className="rounded-xl border border-border bg-surface-solid p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-cyan-300">
                              {act.kind}
                            </span>
                            <SeverityPill severity={act.severity as Severity} size="xs" />
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted">
                            {!act.verified && (
                              <span className="px-1.5 py-0.2 rounded bg-red-500/10 text-text border border-red-500/30">
                                Unverified Tool Call
                              </span>
                            )}
                            <span>{timeAgo(act.ts)}</span>
                          </div>
                        </div>

                        {/* Executed Command in Mono */}
                        <pre className="p-2 rounded bg-surface-solid border border-border font-mono text-xs text-text whitespace-pre-wrap break-words whitespace-pre-wrap">
                          {act.detail}
                        </pre>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted italic">No actions recorded for this agent session.</p>
                )}
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}
