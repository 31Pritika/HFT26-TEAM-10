import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Radio,
  ShieldAlert,
  Layers,
  Bot,
  Network,
  Crosshair,
  FileUp,
  Sliders,
  Settings,
  Sparkles,
  FileText,
  Eye,
  Search,
} from "lucide-react";
import { useAppStore } from "../shared/store";
import { api, setManualDemoMode } from "../shared/api";
import { toast } from "sonner";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { demoModeOverride, setDemoModeOverride, clearUnreadCriticals, unreadCriticals } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const runCommand = (action: () => void) => {
    action();
    onOpenChange(false);
    setSearch("");
  };

  const nav = (path: string) => runCommand(() => navigate(path));

  const handleLaunchScenario = async (id: string, name: string) => {
    runCommand(async () => {
      try {
        toast.info(`Launching scenario: ${name}...`);
        await api.simulate(id);
        navigate("/app/live");
        toast.success(`Simulation started. Streaming attack telemetry to Live Traffic.`);
      } catch {
        toast.error("Failed to launch scenario");
      }
    });
  };

  const handleToggleDemoMode = () => {
    runCommand(() => {
      const next = demoModeOverride === true ? null : true;
      setDemoModeOverride(next);
      setManualDemoMode(next);
      toast.success(next ? "Switched to Mock Demo Mode" : "Restored Auto-Detect Mode");
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75  transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[var(--radius)] border border-border-strong bg-surface p-0 shadow-[0_0_50px_rgba(0,0,0,0.8)] ">
        <Command
          className="flex flex-col w-full"
          filter={(value, search) => {
            if (value.toLowerCase().includes(search.toLowerCase())) return 1;
            return 0;
          }}
        >
          {/* Header search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <Search className="w-5 h-5 text-muted shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command, page name, or scenario..."
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none font-sans"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-white/5 px-2 py-0.5 text-[11px] font-mono text-muted">
              ESC
            </kbd>
          </div>

          {/* Results list */}
          <Command.List className="max-h-[380px] overflow-y-auto p-2 scrollbar-thin">
            <Command.Empty className="py-8 text-center text-sm text-muted">
              No results found for &ldquo;{search}&rdquo;.
            </Command.Empty>

            {/* Navigation Group */}
            <Command.Group heading="Navigation" className="px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted">
              <Command.Item
                value="Overview Dashboard /app"
                onSelect={() => nav("/app")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Overview Dashboard</span>
                <span className="ml-auto font-mono text-xs text-muted">/app</span>
              </Command.Item>

              <Command.Item
                value="Live Traffic Telemetry Stream /app/live"
                onSelect={() => nav("/app/live")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <Radio className="w-4 h-4 text-primary" />
                <span>Live Traffic Stream</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/live</span>
              </Command.Item>

              <Command.Item
                value="Alerts Center Findings /app/alerts"
                onSelect={() => nav("/app/alerts")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Alerts Center</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/alerts</span>
              </Command.Item>

              <Command.Item
                value="Shadow AI Inventory /app/inventory"
                onSelect={() => nav("/app/inventory")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <Layers className="w-4 h-4" />
                <span>Shadow AI Inventory</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/inventory</span>
              </Command.Item>

              <Command.Item
                value="Agents & Permissions Autonomy /app/agents"
                onSelect={() => nav("/app/agents")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <Bot className="w-4 h-4 text-violet-400" />
                <span>Agents & Permissions</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/agents</span>
              </Command.Item>

              <Command.Item
                value="Threat Constellation 3D Graph /app/graph"
                onSelect={() => nav("/app/graph")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <Network className="w-4 h-4 text-cyan-300" />
                <span>Threat Constellation (3D Graph)</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/graph</span>
              </Command.Item>

              <Command.Item
                value="Attack Simulator Scenarios /app/simulate"
                onSelect={() => nav("/app/simulate")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <Crosshair className="w-4 h-4 text-amber-400" />
                <span>Attack Simulator</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/simulate</span>
              </Command.Item>

              <Command.Item
                value="Evidence Ingest PCAP HAR Upload /app/ingest"
                onSelect={() => nav("/app/ingest")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <FileUp className="w-4 h-4" />
                <span>Evidence Ingest (HAR/PCAP)</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/ingest</span>
              </Command.Item>

              <Command.Item
                value="Security Policies Whitelist /app/policies"
                onSelect={() => nav("/app/policies")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <Sliders className="w-4 h-4" />
                <span>Security Policies</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/policies</span>
              </Command.Item>

              <Command.Item
                value="Settings & Engine Diagnostics /app/settings"
                onSelect={() => nav("/app/settings")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-primary/15 aria-selected:text-primary"
              >
                <Settings className="w-4 h-4" />
                <span>Settings & Engine</span>
                <span className="ml-auto font-mono text-xs text-muted">/app/settings</span>
              </Command.Item>
            </Command.Group>

            <Command.Separator className="my-1.5 h-px bg-white/10" />

            {/* Quick Actions Group */}
            <Command.Group heading="Quick Actions" className="px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted">
              <Command.Item
                value="Simulate Rogue Agent Shell Exfiltration"
                onSelect={() => handleLaunchScenario("rogue_agent_shell", "Rogue Agent Shell Exfiltration")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-red-500/20 aria-selected:text-red-300"
              >
                <Crosshair className="w-4 h-4 text-red-400" />
                <span>Simulate: Rogue Agent Shell Exfil</span>
                <span className="ml-auto font-mono text-xs text-red-400/80">Critical</span>
              </Command.Item>

              <Command.Item
                value="Simulate AWS Credentials Leak in Cursor"
                onSelect={() => handleLaunchScenario("cursor_aws_leak", "AWS Credentials Leak in Cursor")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-amber-500/20 aria-selected:text-amber-300"
              >
                <Crosshair className="w-4 h-4 text-amber-400" />
                <span>Simulate: AWS Credentials Leak</span>
                <span className="ml-auto font-mono text-xs text-amber-400/80">High</span>
              </Command.Item>

              <Command.Item
                value="Toggle Demo Mode Live Engine"
                onSelect={handleToggleDemoMode}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-cyan-500/20 aria-selected:text-cyan-300"
              >
                <Eye className="w-4 h-4 text-primary" />
                <span>Toggle Demo Mode</span>
                <span className="ml-auto font-mono text-xs text-muted">
                  {demoModeOverride === true ? "Currently Demo" : "Auto / Live"}
                </span>
              </Command.Item>

              {unreadCriticals.length > 0 && (
                <Command.Item
                  value="Clear Critical Notifications"
                  onSelect={() => {
                    clearUnreadCriticals();
                    toast.success("Cleared critical alerts");
                    onOpenChange(false);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-white/10"
                >
                  <ShieldAlert className="w-4 h-4 text-muted" />
                  <span>Dismiss All Critical Notifications ({unreadCriticals.length})</span>
                </Command.Item>
              )}
            </Command.Group>

            <Command.Separator className="my-1.5 h-px bg-white/10" />

            {/* Public / Experience Pages */}
            <Command.Group heading="Public Pages (Experience)" className="px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted">
              <Command.Item
                value="Landing Page Hero /"
                onSelect={() => nav("/")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-white/10"
              >
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Product Landing Page</span>
                <span className="ml-auto font-mono text-xs text-muted">/</span>
              </Command.Item>

              <Command.Item
                value="Interactive Scanner Playground /playground"
                onSelect={() => nav("/playground")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-white/10"
              >
                <FileText className="w-4 h-4 text-violet-400" />
                <span>Scanner Playground</span>
                <span className="ml-auto font-mono text-xs text-muted">/playground</span>
              </Command.Item>

              <Command.Item
                value="Audit Compliance Report /report"
                onSelect={() => nav("/report")}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text cursor-pointer hover:bg-white/10 transition-colors aria-selected:bg-white/10"
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Executive Compliance Report</span>
                <span className="ml-auto font-mono text-xs text-muted">/report</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          {/* Footer keyboard hint */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted">
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>ESC Close</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono text-[11px] text-cyan-300">ShadowScope ⌘K</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

