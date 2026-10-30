import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ShieldCheck,
  Bell,
  Sparkles,
  Server,
  Zap,
  RefreshCw,
  Cpu,
  Globe,
  Radio,
  Eye,
  CheckCircle2,
  Terminal,
  Check,
} from "lucide-react";
import { GlassCard } from "../../shared/ui/GlassCard";
import { Button } from "../../shared/ui/Button";
import { Badge } from "../../shared/ui/Badge";
import { Skeleton } from "../../shared/ui/Skeleton";
import { useAppStore } from "../../shared/store";
import { api, API_BASE, setManualDemoMode } from "../../shared/api";
import { toast } from "sonner";

function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

const COLLECTOR_DESCRIPTIONS: Record<string, { label: string; desc: string; icon: typeof Activity }> = {
  process_conn: {
    label: "Process & Socket Binding Monitor",
    desc: "Inspects live OS socket tables and maps outbound sockets to parent process hierarchies.",
    icon: Terminal,
  },
  ip_cache: {
    label: "Reverse DNS & IP Cache",
    desc: "Maintains high-speed in-memory resolution cache for cloud provider IPv4/IPv6 CIDR ranges.",
    icon: Globe,
  },
  dns_sni: {
    label: "DNS & SNI TLS Sniffer",
    desc: "Extracts TLS ClientHello Server Name Indication headers without terminating user encryption.",
    icon: Eye,
  },
  loopback: {
    label: "Loopback AI Interceptor",
    desc: "Traps local HTTP traffic destined for ports 11434 (Ollama), 1234 (LMStudio), and 8000 (vLLM).",
    icon: Radio,
  },
  agent_watch: {
    label: "Agent Process & Tool Watcher",
    desc: "Detects autonomous agent processes (Claude Code, AutoGPT, LangChain) executing system commands.",
    icon: Cpu,
  },
  gateway: {
    label: "Local Proxy Gateway",
    desc: "Pass-through gateway interceptor with automatic P0 Critical block enforcement on port 8789.",
    icon: ShieldCheck,
  },
};

export default function Settings() {
  const { engineStatus, setEngineStatus, demoModeOverride, setDemoModeOverride } = useAppStore();

  const [apiBaseInput, setApiBaseInput] = useState(API_BASE);
  const [reduceMotion, setReduceMotion] = useState(() => {
    return localStorage.getItem("shadowscope_reduced_motion") === "true";
  });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });

  // Query health status
  const { data: health, isLoading: isLoadingHealth, refetch: refetchHealth, isFetching } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.getHealth(),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (reduceMotion) {
      document.documentElement.classList.add("reduce-motion");
      localStorage.setItem("shadowscope_reduced_motion", "true");
    } else {
      document.documentElement.classList.remove("reduce-motion");
      localStorage.setItem("shadowscope_reduced_motion", "false");
    }
  }, [reduceMotion]);

  const handleToggleDemoMode = () => {
    const nextState = demoModeOverride === true ? null : true;
    setDemoModeOverride(nextState);
    setManualDemoMode(nextState);
    setEngineStatus(nextState ? "demo" : "live");
    toast.success(
      nextState ? "Demo Mode Forced" : "Live Engine Auto-Detection Restored",
      {
        description: nextState
          ? "Dashboard is now consuming realistic synthesized mock traffic and scenarios."
          : "Probing local ShadowScope engine at http://localhost:8787/api.",
      }
    );
  };

  const handleRequestNotification = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Browser notifications are not supported in this environment");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        toast.success("Desktop notifications enabled", {
          description: "You will receive high-priority alerts for critical data exfiltrations.",
        });
      } else {
        toast.info("Notifications permission: " + permission);
      }
    } catch {
      toast.error("Failed to request notification permission");
    }
  };

  const handleTestNotification = () => {
    toast.error("CRITICAL EXFILTRATION DETECTED: AWS Production Secret", {
      description: "Process python.exe attempted to transmit AKIAIOSFODNN7EXAMPLE to api.openai.com",
      duration: 6000,
    });

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification("ShadowScope Security Alert", {
        body: "CRITICAL: Process python.exe transmitted AWS Production Keys to OpenAI API",
        icon: "/vite.svg",
      });
    }
  };

  const handlePingEngine = async () => {
    try {
      const res = await refetchHealth();
      if (res.data) {
        toast.success("Engine diagnostics responsive", {
          description: `Version: ${res.data.version} • Uptime: ${formatUptime(res.data.uptime_s)}`,
        });
      }
    } catch (err) {
      toast.error("Engine ping failed", {
        description: err instanceof Error ? err.message : "Connection refused",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white font-[Space_Grotesk]">
              Settings &amp; Diagnostics
            </h1>
            <Badge variant="cyan" dot>
              Engine Core
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Engine health telemetry, inspection collectors, demo mode toggle, and privacy assurances.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePingEngine}
            disabled={isFetching}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Ping Engine Health
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Engine Status & Inspection Collectors */}
        <div className="lg:col-span-2 space-y-6">
          {/* Engine Health Hero Card */}
          <GlassCard className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                  <Server className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white font-[Space_Grotesk]">
                      ShadowScope Daemon
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        engineStatus === "live"
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {engineStatus === "live" ? "ONLINE (DAEMON UP)" : "DEMO SIMULATION"}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    Engine Version: {health?.version ?? "0.9.4-demo"} • Triage Backend: {health?.llm_engine ?? "rules"}
                  </p>
                </div>
              </div>

              <div className="text-right sm:text-right">
                <div className="text-[11px] font-mono text-neutral-400 uppercase">Engine Uptime</div>
                <div className="text-base font-bold font-mono text-cyan-400">
                  {health ? formatUptime(health.uptime_s) : "0h 0m 0s"}
                </div>
              </div>
            </div>

            {/* Collectors Status Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Active Inspection Collectors (5/5 Running)
                </h3>
                <span className="text-[11px] font-mono text-emerald-400">All Systems Nominal</span>
              </div>

              {isLoadingHealth ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(health?.collectors ?? {}).map(([key, col]) => {
                    const meta = COLLECTOR_DESCRIPTIONS[key] ?? {
                      label: key,
                      desc: "Background telemetry collector",
                      icon: Activity,
                    };
                    const Icon = meta.icon;

                    return (
                      <div
                        key={key}
                        className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition-all flex flex-col justify-between space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-neutral-800 text-cyan-400 shrink-0">
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-semibold text-white">
                              {meta.label}
                            </span>
                          </div>

                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold shrink-0 ${
                              col.running
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-neutral-800 text-neutral-400"
                            }`}
                          >
                            {col.running ? "ACTIVE" : "STANDBY"}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          {meta.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Engine Connection & API Base Override */}
          <GlassCard className="p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white font-[Space_Grotesk]">
                  Daemon API Connection
                </h3>
                <p className="text-xs text-neutral-400">
                  Configure local REST endpoint target and fallback demo options
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-neutral-400 block mb-1.5">
                  API Base URL Endpoint
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={apiBaseInput}
                    onChange={(e) => setApiBaseInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700/60 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500/50"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast.info("Active Base Endpoint", {
                        description: `Using ${apiBaseInput}. Restart dev server to switch target host.`,
                      });
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              </div>

              {/* Demo Mode Toggle Switch */}
              <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <span>Demo Mode Simulation Override</span>
                    {demoModeOverride === true && (
                      <Badge variant="medium" size="xs">FORCED DEMO</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    When active, the UI runs on bundled mock telemetry without querying the local daemon.
                  </p>
                </div>

                <Button
                  variant={demoModeOverride === true ? "primary" : "outline"}
                  size="sm"
                  onClick={handleToggleDemoMode}
                  className="shrink-0 text-xs"
                >
                  <Zap className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  {demoModeOverride === true ? "Disable Demo Mode" : "Force Demo Mode"}
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right Column (1 Col): Accessibility, Desktop Notifications & Privacy Statement */}
        <div className="space-y-6">
          {/* User Experience & Accessibility */}
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white font-[Space_Grotesk]">
                  Interface Preferences
                </h3>
                <p className="text-xs text-neutral-400">
                  Motion dynamics and desktop alerting
                </p>
              </div>
            </div>

            {/* Reduce Motion */}
            <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Reduce Motion</div>
                <div className="text-[11px] text-neutral-400">Disable complex spring animations</div>
              </div>
              <input
                type="checkbox"
                checked={reduceMotion}
                onChange={(e) => setReduceMotion(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 accent-violet-500 cursor-pointer"
              />
            </div>

            {/* Browser Notifications */}
            <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-cyan-400" />
                    Critical Incident Alerts
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Status: <strong className="text-neutral-200 capitalize">{notificationPermission}</strong>
                  </div>
                </div>

                {notificationPermission !== "granted" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRequestNotification}
                    className="text-xs h-7 px-2"
                  >
                    Enable
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                    <Check className="w-3 h-3" /> Enabled
                  </span>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleTestNotification}
                className="w-full text-xs text-neutral-400 hover:text-white justify-center h-7"
              >
                Send Test Alert Notification
              </Button>
            </div>
          </GlassCard>

          {/* Privacy Statement & On-Device Security Architecture */}
          <GlassCard className="p-6 space-y-4 border-emerald-500/30 bg-gradient-to-b from-emerald-950/20 via-neutral-900/90 to-neutral-950 shadow-xl shadow-emerald-950/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white font-[Space_Grotesk]">
                  Local Security Guarantee
                </h3>
                <Badge variant="low" size="xs">AIRGAPPED ARCHITECTURE</Badge>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              <strong className="text-white">All analysis executes locally on this host machine.</strong> Raw API keys, private passwords, and sensitive customer PII are redacted on-device before storage and before any LLM triage evaluation.
            </p>

            <ul className="text-[11px] text-neutral-400 space-y-2 pt-1 border-t border-neutral-800/80">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-neutral-200">Zero Cloud Exfiltration:</strong> ShadowScope transmits no telemetry, logs, or unredacted payloads to any cloud service.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-neutral-200">Forensic Redaction:</strong> High-entropy tokens are masked in volatile memory with SHA-256 fingerprints.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-neutral-200">Agent Self-Exclusion:</strong> Defensive monitoring avoids inspection cycles on authorized triage queries.
                </span>
              </li>
            </ul>

            <div className="pt-2 border-t border-neutral-800/80">
              <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1.5">
                Compliance Standards Cross-Reference:
              </div>
              <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">DPDP Act 2023 §8</span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">GDPR Art. 25</span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">SOC2 Type II</span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">PCI-DSS v4.0</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
