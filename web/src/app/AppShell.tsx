import { useState, useEffect, Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
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
  Menu,
  ChevronLeft,
  ChevronRight,
  Search,
  Activity,
  MoreHorizontal,
  Shield,
} from "lucide-react";
import { useAppStore } from "../shared/store";
import { setManualDemoMode } from "../shared/api";
import { connectStream } from "../shared/ws";
import { RiskGauge } from "../shared/ui/RiskGauge";
import { Drawer } from "../shared/ui/Drawer";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPopover } from "./NotificationsPopover";
import { PageTransition } from "./PageTransition";
import { toast } from "sonner";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: number;
}

const PRIMARY_LINKS: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/live", label: "Live Traffic", icon: Radio },
  { to: "/app/alerts", label: "Alerts Center", icon: ShieldAlert },
  { to: "/app/inventory", label: "AI Inventory", icon: Layers },
  { to: "/app/agents", label: "Agents", icon: Bot },
  { to: "/app/graph", label: "Threat Graph", icon: Network },
];

const SECONDARY_LINKS: NavItem[] = [
  { to: "/app/simulate", label: "Simulator", icon: Crosshair },
  { to: "/app/ingest", label: "Evidence Ingest", icon: FileUp },
  { to: "/app/policies", label: "Policies", icon: Sliders },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const MOBILE_BOTTOM_TABS = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/live", label: "Live", icon: Radio },
  { to: "/app/alerts", label: "Alerts", icon: ShieldAlert },
  { to: "/app/agents", label: "Agents", icon: Bot },
];

export default function AppShell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const { stats, engineStatus, demoModeOverride, setDemoModeOverride, unreadCriticals } = useAppStore();

  // Connect WebSocket stream on mount
  useEffect(() => {
    const disconnect = connectStream((msg) => {
      if (msg.type === "finding" && msg.data.severity === "critical") {
        toast.error(`CRITICAL EXFILTRATION DETECTED: ${msg.data.title}`, {
          description: msg.data.evidence?.redacted_snippet || msg.data.description,
          duration: 6000,
        });
      }
    });
    return () => disconnect();
  }, []);

  const riskScore = stats?.risk_score ?? 63;
  const riskGrade = stats?.risk_grade ?? "D";

  // Derive breadcrumb text
  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === "/app") return "Overview";
    if (path.startsWith("/app/live")) return "Live Traffic Stream";
    if (path.startsWith("/app/alerts/")) return `Alert / ${path.replace("/app/alerts/", "")}`;
    if (path.startsWith("/app/alerts")) return "Alerts Center";
    if (path.startsWith("/app/inventory")) return "Shadow AI Inventory";
    if (path.startsWith("/app/agents")) return "Agents & Permissions";
    if (path.startsWith("/app/graph")) return "Threat Constellation";
    if (path.startsWith("/app/simulate")) return "Attack Simulator";
    if (path.startsWith("/app/ingest")) return "Evidence Ingest";
    if (path.startsWith("/app/policies")) return "Security Policies";
    if (path.startsWith("/app/settings")) return "Settings & Engine";
    return "Console";
  };

  const handleToggleDemo = () => {
    const next = demoModeOverride === true ? null : true;
    setDemoModeOverride(next);
    setManualDemoMode(next);
    toast.info(next ? "Switched to Demo Data Mode" : "Auto-detecting Live Engine...");
  };

  return (
    <div className="relative min-h-screen bg-[#05060a] text-text flex flex-col antialiased selection:bg-cyan-500/30 overflow-x-hidden">
      {/* Background Animated Subtle Grid + Radial Glows */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        {/* Obsidian subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `linear-gradient(to right, #8a93a8 1px, transparent 1px), linear-gradient(to bottom, #8a93a8 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        {/* Cyan Ambient Radial Glow - Top Left */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-[120px]" />
        {/* Violet Ambient Radial Glow - Bottom Right */}
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/10 blur-[130px]" />
      </div>

      <div className="flex flex-1 min-h-screen">
        {/* ======================================================================== */}
        {/* Desktop & Tablet Sidebar (Hidden on <768px Mobile)                       */}
        {/* ======================================================================== */}
        <aside
          className={`hidden md:flex flex-col border-r border-white/[0.08] bg-[#070a14]/80 backdrop-blur-2xl transition-all duration-300 z-30 shrink-0 ${
            collapsed ? "w-16" : "w-16 lg:w-64"
          }`}
        >
          {/* Logo & Brand Header */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-white/[0.08]">
            <NavLink to="/app" className="flex items-center gap-2.5 overflow-hidden group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-600 p-0.5 shrink-0 shadow-[0_0_16px_rgba(34,211,238,0.35)] group-hover:shadow-[0_0_24px_rgba(34,211,238,0.55)] transition-shadow">
                <div className="w-full h-full bg-[#070a14] rounded-[6px] flex items-center justify-center">
                  <Shield className="w-4 h-4 text-cyan-400" />
                </div>
              </div>
              {!collapsed && (
                <div className="hidden lg:flex flex-col">
                  <span className="font-display font-bold text-base tracking-tight text-white leading-none">
                    Shadow<span className="text-cyan-400">Scope</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-300 mt-0.5">
                    Security Console
                  </span>
                </div>
              )}
            </NavLink>

            {/* Collapse toggle (Desktop only) */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex p-1.5 rounded-lg text-muted hover:text-text hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6 scrollbar-thin">
            <div>
              {!collapsed && (
                <p className="hidden lg:block px-3 mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-300">
                  Detection &amp; Auditing
                </p>
              )}
              <ul className="space-y-1">
                {PRIMARY_LINKS.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 select-none ${
                          isActive
                            ? "text-cyan-300 bg-cyan-500/10 font-semibold"
                            : "text-muted hover:text-text hover:bg-white/[0.05]"
                        } ${collapsed ? "justify-center" : "justify-center lg:justify-start"}`
                      }
                      title={collapsed ? label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-cyan-400" : "text-muted"}`} />
                          {!collapsed && <span className="hidden lg:inline">{label}</span>}
                          {to === "/app/alerts" && unreadCriticals.length > 0 && (
                            <span
                              className={`ml-auto rounded-full bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-400 border border-red-500/30 ${
                                collapsed ? "absolute top-1 right-1 px-1 py-0 text-[8px]" : "hidden lg:inline-flex"
                              }`}
                            >
                              {unreadCriticals.length}
                            </span>
                          )}
                          {isActive && (
                            <motion.div
                              layoutId="active-sidebar-pill"
                              className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                              transition={{ type: "spring", stiffness: 380, damping: 30 }}
                            />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              {!collapsed && (
                <p className="hidden lg:block px-3 mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-300">
                  Control &amp; Policies
                </p>
              )}
              <ul className="space-y-1">
                {SECONDARY_LINKS.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 select-none ${
                          isActive
                            ? "text-cyan-300 bg-cyan-500/10 font-semibold"
                            : "text-muted hover:text-text hover:bg-white/[0.05]"
                        } ${collapsed ? "justify-center" : "justify-center lg:justify-start"}`
                      }
                      title={collapsed ? label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-cyan-400" : "text-muted"}`} />
                          {!collapsed && <span className="hidden lg:inline">{label}</span>}
                          {isActive && (
                            <motion.div
                              layoutId="active-sidebar-pill"
                              className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                              transition={{ type: "spring", stiffness: 380, damping: 30 }}
                            />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sidebar Footer Posture Card */}
          {!collapsed && (
            <div className="hidden lg:block p-3 border-t border-white/[0.08] bg-[#05070e]/60">
              <div className="rounded-xl border border-white/[0.08] bg-surface/50 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <RiskGauge score={riskScore} grade={riskGrade} size="compact" showLabel={false} />
                  <div>
                    <p className="font-display text-xs font-semibold text-text">Security Posture</p>
                    <p className="font-mono text-[10px] text-muted">Grade {riskGrade} ({riskScore}/100)</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* ======================================================================== */}
        {/* Main Content Area                                                        */}
        {/* ======================================================================== */}
        <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
          {/* Top Bar */}
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#05060a]/85 backdrop-blur-xl px-4 lg:px-6">
            {/* Left: Mobile menu toggle / Breadcrumbs */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMoreDrawerOpen(true)}
                className="md:hidden p-2 rounded-lg text-muted hover:text-text hover:bg-white/[0.08]"
                aria-label="Open navigation drawer"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs font-semibold text-cyan-400 uppercase tracking-widest hidden sm:inline">
                  ShadowScope
                </span>
                <span className="text-muted/40 hidden sm:inline">/</span>
                <span className="font-display font-medium text-text text-sm sm:text-base">
                  {getBreadcrumb()}
                </span>
              </div>
            </div>

            {/* Right: Status Pills & Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Global Risk Pill */}
              <div
                className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-1 border backdrop-blur-md font-mono text-xs font-semibold select-none ${
                  riskGrade === "A" || riskGrade === "B"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : riskGrade === "C"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-red-500/35 bg-red-500/15 text-[#ff3b5c] shadow-[0_0_12px_rgba(255,59,92,0.25)]"
                }`}
              >
                <span className="text-muted text-[10px] uppercase tracking-wider font-sans">Org Risk</span>
                <span className="font-bold">{riskScore}</span>
                <span className="rounded bg-black/30 px-1 py-0.2 text-[10px]">{riskGrade}</span>
              </div>

              {/* Engine Status Pill */}
              <button
                onClick={handleToggleDemo}
                className={`flex items-center gap-2 rounded-full px-2.5 sm:px-3 py-1 border font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                  engineStatus === "live"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                }`}
                title="Click to toggle between Live Engine and Mock Demo Mode"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    engineStatus === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                <span className="hidden xs:inline">
                  {engineStatus === "live" ? "LIVE ENGINE" : "DEMO DATA"}
                </span>
              </button>

              {/* Live telemetry pulse indicator */}
              <div className="flex items-center gap-1.5 px-2 py-1 text-muted text-xs font-mono" title="Live Telemetry Stream Active">
                <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
              </div>

              {/* ⌘K Command Palette Button */}
              <button
                onClick={() => setCmdOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface/60 px-2.5 py-1.5 text-xs text-muted hover:border-white/20 hover:text-text transition-colors cursor-pointer"
                aria-label="Search command palette"
              >
                <Search className="w-3.5 h-3.5 text-muted" />
                <span className="hidden sm:inline font-sans">Search</span>
                <kbd className="hidden sm:inline font-mono text-[10px] text-neutral-200 bg-white/10 px-1.5 py-0.5 rounded border border-white/15">
                  ⌘K
                </kbd>
              </button>

              {/* Notifications Bell */}
              <NotificationsPopover />
            </div>
          </header>

          {/* Page View with Smooth Animated PageTransition */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-[50vh]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
                    <span className="font-mono text-xs text-muted">Loading telemetry modules...</span>
                  </div>
                </div>
              }
            >
              <PageTransition>
                <Outlet />
              </PageTransition>
            </Suspense>
          </main>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* Mobile Bottom Navigation Bar (< 768px)                                   */}
      {/* ======================================================================== */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-[#070a14]/95 backdrop-blur-2xl px-2 py-1 flex items-center justify-around"
      >
        {MOBILE_BOTTOM_TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1.5 px-3 rounded-lg text-[10px] font-medium transition-colors select-none ${
                isActive ? "text-cyan-400 font-semibold" : "text-muted hover:text-text"
              }`
            }
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span>{label}</span>
          </NavLink>
        ))}

        {/* "More" Sheet Toggle */}
        <button
          onClick={() => setMoreDrawerOpen(true)}
          className="flex flex-col items-center justify-center py-1.5 px-3 rounded-lg text-[10px] font-medium text-muted hover:text-text transition-colors cursor-pointer select-none"
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>

      {/* "More" Bottom Sheet Drawer for Mobile */}
      <Drawer
        open={moreDrawerOpen}
        onClose={() => setMoreDrawerOpen(false)}
        title="Command Navigation"
        description="All ShadowScope monitoring & policy tools"
      >
        <div className="space-y-4">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase text-muted tracking-wider mb-2">
              Primary Tools
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PRIMARY_LINKS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMoreDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 p-3 rounded-xl border text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300 font-semibold"
                        : "bg-surface-solid/60 border-white/[0.06] text-text hover:bg-surface"
                    }`
                  }
                >
                  <Icon className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-[11px] font-semibold uppercase text-muted tracking-wider mb-2">
              Operations & Policies
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SECONDARY_LINKS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 p-3 rounded-xl border text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300 font-semibold"
                        : "bg-surface-solid/60 border-white/[0.06] text-text hover:bg-surface"
                    }`
                  }
                >
                  <Icon className="w-4 h-4 text-violet-400 shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </Drawer>

      {/* Command Palette (⌘K) Modal */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
