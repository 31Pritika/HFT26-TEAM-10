import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  Crosshair,
  Play,
  Pause,
  Radio,
  Radar,
  KeyRound,
  Users,
  FileCode,
  Bot,
  Bird,
  ShieldX,
  TrendingUp,
  Cpu,
  ChevronRight,
  Flame,
} from "lucide-react";
import { api } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import {
  GlassCard,
  SeverityPill,
  Button,
  Skeleton,
} from "../../shared/ui";
import type { Scenario } from "../../shared/types";
import { toast } from "sonner";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  radar: Radar,
  "key-round": KeyRound,
  users: Users,
  "file-code": FileCode,
  bot: Bot,
  bird: Bird,
  "shield-x": ShieldX,
  "trending-up": TrendingUp,
  cpu: Cpu,
};

export default function Simulate() {
  const navigate = useNavigate();

  // Load scenarios from API
  const { data, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: () => api.getScenarios(),
    staleTime: 60_000,
  });

  const scenarios: Scenario[] = data?.items || [];

  // Live feed from Zustand store
  const storeEvents = useAppStore((state) => state.events);
  const storeFindings = useAppStore((state) => state.findings);

  // Simulation execution tracking
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  // Full demo sequence runner state
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [sequenceCountdown, setSequenceCountdown] = useState(4);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Launch a single scenario
  const handleLaunchScenario = async (scenario: Scenario) => {
    setLaunchingId(scenario.id);
    setActiveScenarioId(scenario.id);
    toast.info(`Launching attack vector: ${scenario.name}...`);

    try {
      await api.simulate(scenario.id, 2);
      setTimeout(() => {
        setLaunchingId(null);
        toast.success(`Simulation active: Telemetry packets streaming to Live Traffic.`);
      }, 700);
    } catch {
      setLaunchingId(null);
      toast.error("Failed to launch scenario");
    }
  };

  // Full demo sequence step execution
  useEffect(() => {
    if (!sequenceRunning || scenarios.length === 0) return;

    if (sequenceIndex >= scenarios.length) {
      setSequenceRunning(false);
      setSequenceIndex(0);
      toast.success("Full demo sequence completed successfully!");
      return;
    }

    const currentScenario = scenarios[sequenceIndex];
    setActiveScenarioId(currentScenario.id);
    api.simulate(currentScenario.id, 2).catch(() => {});
    toast.info(`Sequence [${sequenceIndex + 1}/${scenarios.length}]: ${currentScenario.name}`);

    // 4 second countdown
    setSequenceCountdown(4);
    countdownTimerRef.current = setInterval(() => {
      setSequenceCountdown((prev) => (prev > 1 ? prev - 1 : 4));
    }, 1000);

    sequenceTimerRef.current = setTimeout(() => {
      clearInterval(countdownTimerRef.current!);
      setSequenceIndex((prev) => prev + 1);
    }, 4000);

    return () => {
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [sequenceRunning, sequenceIndex, scenarios]);

  const handleStopSequence = () => {
    setSequenceRunning(false);
    setSequenceIndex(0);
    if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    toast.info("Demo sequence halted");
  };

  const handleStartSequence = () => {
    if (scenarios.length === 0) return;
    setSequenceRunning(true);
    setSequenceIndex(0);
  };

  // Filter recent telemetry for this session
  const recentEvents = storeEvents.slice(0, 6);
  const recentFindings = storeFindings.slice(0, 6);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ==================================================================== */}
      {/* 1. HEADER & SEQUENCE RUNNER HERO                                     */}
      {/* ==================================================================== */}
      <GlassCard
        variant="default"
        glow={sequenceRunning ? "cyan" : "violet"}
        className="p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Crosshair className="w-5 h-5 animate-pulse" />
              </div>
              <h1 className="font-display text-xl font-bold text-text">
                Attack & Exfiltration Simulator
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                {scenarios.length} Attack Vectors
              </span>
            </div>
            <p className="text-xs text-muted max-w-2xl leading-relaxed">
              Inject synthetic shadow AI requests, rogue ReAct tool loops, credential leaks, and honeytoken
              canaries to test ShadowScope detection pipelines in real-time without leaving TLS blind spots.
            </p>
          </div>

          {/* Full Demo Sequence Runner Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            {sequenceRunning ? (
              <Button variant="danger" size="md" onClick={handleStopSequence}>
                <Pause className="w-4 h-4" />
                Halt Sequence ({sequenceIndex + 1}/{scenarios.length})
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleStartSequence}
                magnetic
                className="font-bold tracking-wide"
              >
                <Flame className="w-4 h-4 text-amber-950" />
                Run Full Demo Sequence
              </Button>
            )}
          </div>
        </div>

        {/* Full Demo Sequence Progress Stepper Bar */}
        <AnimatePresence>
          {sequenceRunning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-3 border-t border-white/[0.08] space-y-2 font-mono text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="font-bold text-cyan-300">
                    Executing Step {sequenceIndex + 1} of {scenarios.length}:{" "}
                    {scenarios[sequenceIndex]?.name}
                  </span>
                </div>
                <span className="text-muted text-[11px]">
                  Next scenario in <span className="text-text font-bold">{sequenceCountdown}s</span>
                </span>
              </div>

              {/* Progress Stepper Segments */}
              <div className="grid grid-cols-9 gap-1 h-2">
                {scenarios.map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${
                      i < sequenceIndex
                        ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                        : i === sequenceIndex
                        ? "bg-cyan-400 animate-pulse"
                        : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 2. SCENARIO CARDS GRID & MINI LIVE FEED                              */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Scenario Cards Grid (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-muted uppercase tracking-wider px-1">
            <span>Available Attack Vectors</span>
            <span>Click to Trigger Packet Injection</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {scenarios.map((sc) => {
              const Icon = ICON_MAP[sc.icon] || Crosshair;
              const isLaunching = launchingId === sc.id;
              const isActive = activeScenarioId === sc.id;

              return (
                <GlassCard
                  key={sc.id}
                  variant="default"
                  className={`p-4 flex flex-col justify-between transition-all relative overflow-hidden group ${
                    isActive
                      ? "border-amber-500/50 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                      : "hover:border-white/20"
                  }`}
                >
                  {/* Ripple pulse animation when launching */}
                  {isLaunching && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0.8 }}
                      animate={{ scale: 3, opacity: 0 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="absolute inset-0 bg-cyan-400/30 rounded-full pointer-events-none"
                    />
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="p-2 rounded-xl bg-surface-solid border border-white/10 text-cyan-400 group-hover:text-cyan-300 transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <SeverityPill severity={sc.severity} size="xs" />
                    </div>

                    <h3 className="font-display font-bold text-sm text-text leading-tight mb-1">
                      {sc.name}
                    </h3>
                    <p className="text-xs text-muted leading-relaxed line-clamp-3">
                      {sc.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {sc.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-surface border border-white/10 text-muted"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <Button
                      variant={isActive ? "glow" : "secondary"}
                      size="xs"
                      disabled={isLaunching}
                      onClick={() => handleLaunchScenario(sc)}
                      magnetic
                    >
                      <Play className="w-3 h-3 text-emerald-400" />
                      <span>{isLaunching ? "Firing..." : "Launch"}</span>
                    </Button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>

        {/* Mini Live Simulation Telemetry Feed (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <GlassCard variant="default" className="p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <h3 className="font-display text-sm font-bold text-text">
                  Simulation Telemetry Feed
                </h3>
              </div>
              <span className="font-mono text-[10px] text-muted">Real-Time Detections</span>
            </div>

            {/* Findings & Events incoming from simulation */}
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
              {recentFindings.length === 0 && recentEvents.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  <Crosshair className="w-8 h-8 mx-auto mb-2 text-muted/40" />
                  <p className="font-medium text-text mb-0.5">Idle Simulator</p>
                  <p>Click &ldquo;Launch&rdquo; on any scenario to inject live exfiltration traffic.</p>
                </div>
              ) : (
                recentFindings.map((finding) => (
                  <div
                    key={finding.id}
                    onClick={() => navigate(`/app/alerts/${finding.id}`)}
                    className="p-3 rounded-xl border border-red-500/30 bg-red-950/20 hover:border-red-500/50 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <SeverityPill severity={finding.severity} size="xs" />
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(finding.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="font-semibold text-xs text-text group-hover:text-cyan-300 transition-colors line-clamp-1">
                      {finding.title}
                    </p>
                    <p className="font-mono text-[10px] text-muted line-clamp-1 mt-0.5">
                      {finding.evidence?.redacted_snippet || finding.description}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Jump links footer */}
            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono">
              <button
                onClick={() => navigate("/app/live")}
                className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Live Traffic Stream</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => navigate("/app/alerts")}
                className="text-muted hover:text-text flex items-center gap-1 cursor-pointer"
              >
                <span>Alerts Center</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
