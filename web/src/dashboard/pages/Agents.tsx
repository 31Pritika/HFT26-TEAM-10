import { useDocumentTitle } from "../../shared/useDocumentTitle";
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
import type { AgentSession, Severity } from "../../shared/types";
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
  langchain: { label: "LangChain", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  autogpt: { label: "AutoGPT", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  crewai: { label: "CrewAI", color: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
  cursor: { label: "Cursor Agent", color: "text-primary border-primary/30 bg-primary/10" },
  claude_code: { label: "Claude Code", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  aider: { label: "Aider", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  open_interpreter: { label: "Open Interpreter", color: "text-red-400 border-red-500/30 bg-red-500/10" },
  custom: { label: "Custom Agent", color: "text-muted border-white/10 bg-surface" },
};

export default function Agents() {
  useDocumentTitle("Agents · ShadowScope");

  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
    staleTime: 10_000,
  });

  const agents = data?.items || [];
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Local optimistic permission & status overrides
  const [blockedAgents, setBlockedAgents] = useState<Set<string>>(new Set());
  const [permissionOverrides, setPermissionOverrides] = useState<
    Record<string, AgentSession["permissions"]>
  >({});

  // Auto-select first agent once data loads
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  const isBlocked = activeAgent ? blockedAgents.has(activeAgent.id) || activeAgent.status === "blocked" : false;
  const currentPermissions = activeAgent
    ? permissionOverrides[activeAgent.id] || activeAgent.permissions
    : null;

  // Kill Switch action
  const handleKillSwitch = (agentId: string) => {
    setBlockedAgents((prev) => new Set(prev).add(agentId));
    toast.error(`KILL SWITCH ENGAGED: Terminated Agent PID ${activeAgent?.pid}`, {
      description: "Process execution revoked and blocked via ShadowScope endpoint rule.",
    });
  };

  // Toggle individual permission
  const handleTogglePermission = (key: keyof AgentSession["permissions"]) => {
    if (!activeAgent || !currentPermissions) return;
    const nextPerms = {
      ...currentPermissions,
      [key]: !currentPermissions[key],
    };
    setPermissionOverrides((prev) => ({
      ...prev,
      [activeAgent.id]: nextPerms,
    }));
    toast.info(`Updated agent capability: ${key} = ${nextPerms[key] ? "ENABLED" : "DISABLED"}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-14 w-72 rounded-[var(--radius)]" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="h-96 lg:col-span-4 rounded-[var(--radius)]" />
          <Skeleton className="h-96 lg:col-span-8 rounded-[var(--radius)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[var(--radius)] bg-violet-500/10 border border-violet-500/30 text-violet-400">
              <Bot className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-text">
                Autonomous Agents & Permission Governance
              </h1>
              <p className="text-xs text-muted mt-0.5">
                Supervise tool calls, enforce sandboxing, and monitor machine-speed autonomous loops
              </p>
            </div>
          </div>
        </div>

        {/* Aggregate Stats Badges */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300">
            {agents.length} Agent Sessions
          </span>
          <span className="px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 font-bold">
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
          <div className="flex items-center justify-between px-1 text-xs font-mono text-muted uppercase tracking-wider">
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
                  className={`p-3.5 flex flex-col gap-2 transition-all cursor-pointer ${
                    selected
                      ? "border-primary/50 bg-surface "
                      : "hover:border-white/20"
                  } ${blocked ? "opacity-60 grayscale-[40%]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${fw.color}`}>
                        {fw.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-text truncate">
                        {agent.process_name}
                      </span>
                      {agent.pid && (
                        <span className="font-mono text-[10px] text-muted">:{agent.pid}</span>
                      )}
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`text-[9px] font-mono px-2 py-0.2 rounded-full font-bold uppercase ${
                        blocked
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : agent.status === "active"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-white/10 text-muted"
                      }`}
                    >
                      {blocked ? "BLOCKED" : agent.status}
                    </span>
                  </div>

                  {/* Autonomy Meter & Risk Indicators */}
                  <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase text-muted">Autonomy:</span>
                      <span
                        className={`font-bold ${
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
                      <span className="text-[10px] uppercase text-muted">Risk:</span>
                      <span
                        className={`font-bold px-1.5 py-0.2 rounded ${
                          agent.risk_score >= 80
                            ? "bg-red-500/20 text-red-400"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {agent.risk_score}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-muted/70">
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
                    <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                      {activeAgent.id}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold uppercase ${
                        isBlocked
                          ? "bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      }`}
                    >
                      {isBlocked ? "STATUS: BLOCKED / SANDBOXED" : "STATUS: ACTIVE RUNTIME"}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      PID: {activeAgent.pid ?? "N/A"}
                    </span>
                  </div>

                  <h2 className="font-display text-xl font-bold text-text">
                    {activeAgent.process_name}{" "}
                    <span className="text-muted text-base font-normal">
                      ({FRAMEWORK_META[activeAgent.framework]?.label ?? activeAgent.framework})
                    </span>
                  </h2>
                  <p className="font-mono text-xs text-muted mt-1">
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
                    onClick={() => handleKillSwitch(activeAgent.id)}
                    className="w-full sm:w-auto font-bold uppercase tracking-wider"
                    magnetic
                  >
                    <Power className="w-4 h-4 text-red-400" />
                    {isBlocked ? "Process Terminated" : "Kill Switch (Block)"}
                  </Button>
                </div>
              </div>

              {/* Autonomy vs Risk Score Dial strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/[0.08] font-mono text-xs">
                <div className="p-3 rounded-[var(--radius)] border border-white/[0.06] bg-[#0c101d]">
                  <span className="text-[10px] uppercase text-muted block mb-1">Autonomy Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-red-400">{activeAgent.autonomy_score}</span>
                    <span className="text-muted/60">/ 100</span>
                  </div>
                  <span className="text-[10px] text-muted mt-1 block">Machine-speed execution</span>
                </div>

                <div className="p-3 rounded-[var(--radius)] border border-white/[0.06] bg-[#0c101d]">
                  <span className="text-[10px] uppercase text-muted block mb-1">Risk Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#ff3b5c]">{activeAgent.risk_score}</span>
                    <span className="text-muted/60">/ 100</span>
                  </div>
                  <span className="text-[10px] text-muted mt-1 block">Exfiltration hazard</span>
                </div>

                <div className="p-3 rounded-[var(--radius)] border border-white/[0.06] bg-[#0c101d]">
                  <span className="text-[10px] uppercase text-muted block mb-1">Inference Requests</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">{activeAgent.requests}</span>
                    <span className="text-muted/60">total</span>
                  </div>
                  <span className="text-[10px] text-muted mt-1 block">Model interaction loops</span>
                </div>
              </div>
            </GlassCard>

            {/* ==================================================================== */}
            {/* Permission Matrix as Glowing Toggles with Danger Colors             */}
            {/* ==================================================================== */}
            <GlassCard variant="default" className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" />
                  <h3 className="font-display text-sm font-bold text-text">
                    Agent Capability & Permission Matrix
                  </h3>
                </div>
                <span className="font-mono text-[11px] text-muted">
                  Click to enforce sandbox policy
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
                      onClick={() => handleTogglePermission(key)}
                      className={`p-3 rounded-[var(--radius)] border transition-all cursor-pointer select-none flex flex-col justify-between ${
                        enabled
                          ? danger
                            ? "bg-red-950/25 border-red-500/40 "
                            : "bg-surface border-primary/30"
                          : "bg-surface-solid/60 border-white/[0.06] opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Icon
                          className={`w-4 h-4 ${
                            enabled ? (danger ? "text-red-400" : "text-primary") : "text-muted"
                          }`}
                        />
                        <span
                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            enabled ? (danger ? "bg-red-500 text-white" : "bg-primary text-black") : "bg-white/10 text-muted"
                          }`}
                        >
                          {enabled ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-xs text-text">{label}</p>
                        <p className="text-[10px] text-muted mt-0.5 line-clamp-1">{desc}</p>
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
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                  <h3 className="font-display text-sm font-bold text-text flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-primary" />
                    Tools-Used Breakdown
                  </h3>
                  <span className="font-mono text-[11px] text-muted">
                    Total Calls: {activeAgent.tools_used.reduce((acc, t) => acc + t.count, 0)}
                  </span>
                </div>

                <div className="space-y-3">
                  {activeAgent.tools_used.map((tool) => {
                    const maxCount = Math.max(...activeAgent.tools_used.map((t) => t.count), 1);
                    const pct = Math.round((tool.count / maxCount) * 100);
                    return (
                      <div key={tool.name} className="space-y-1 font-mono text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-text">{tool.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted">{tool.count} invocations</span>
                            <SeverityPill severity={tool.severity as Severity} size="xs" />
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              tool.severity === "critical"
                                ? "bg-red-500 "
                                : "bg-primary"
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
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <h3 className="font-display text-sm font-bold text-text flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-400" />
                  Chronological Action Timeline
                </h3>
                <span className="font-mono text-[11px] text-muted">
                  {activeAgent.actions?.length || 0} Events Audited
                </span>
              </div>

              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                {activeAgent.actions && activeAgent.actions.length > 0 ? (
                  activeAgent.actions.map((act, idx) => (
                    <div key={idx} className="relative group">
                      {/* Timeline Node Dot */}
                      <div
                        className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#000000] ${
                          act.severity === "critical"
                            ? "bg-red-500 ring-4 ring-red-500/20"
                            : act.severity === "high"
                            ? "bg-orange-400"
                            : "bg-primary"
                        }`}
                      />

                      <div className="rounded-[var(--radius)] border border-white/[0.08] bg-surface-solid/70 p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary uppercase">
                              {act.kind}
                            </span>
                            <SeverityPill severity={act.severity as Severity} size="xs" />
                          </div>

                          <div className="flex items-center gap-2 font-mono text-[10px] text-muted">
                            {!act.verified && (
                              <span className="px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 border border-red-500/30">
                                Unverified Tool Call
                              </span>
                            )}
                            <span>{timeAgo(act.ts)}</span>
                          </div>
                        </div>

                        {/* Executed Command in Mono */}
                        <pre className="p-2 rounded bg-[var(--surface)] border border-white/5 font-mono text-xs text-text overflow-x-auto whitespace-pre-wrap">
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
