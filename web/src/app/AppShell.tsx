import { useState, useEffect, Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  MoreHorizontal,
} from "lucide-react";
import { useAppStore } from "../shared/store";
import { setManualDemoMode } from "../shared/api";
import { connectStream } from "../shared/ws";
import { ScopeMark } from "../shared/ui/ScopeMark";
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
  { to: "/app", label: "overview", icon: LayoutDashboard, end: true },
  { to: "/app/live", label: "live traffic", icon: Radio },
  { to: "/app/alerts", label: "alerts", icon: ShieldAlert },
  { to: "/app/inventory", label: "ai inventory", icon: Layers },
  { to: "/app/agents", label: "agents", icon: Bot },
  { to: "/app/graph", label: "threat graph", icon: Network },
];

const SECONDARY_LINKS: NavItem[] = [
  { to: "/app/simulate", label: "simulator", icon: Crosshair },
  { to: "/app/ingest", label: "evidence ingest", icon: FileUp },
  { to: "/app/policies", label: "policies", icon: Sliders },
  { to: "/app/settings", label: "settings", icon: Settings },
];

const MOBILE_BOTTOM_TABS = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/live", label: "Live", icon: Radio },
  { to: "/app/alerts", label: "Alerts", icon: ShieldAlert },
  { to: "/app/agents", label: "Agents", icon: Bot },
];

function SidebarLink({ item, index, collapsed, alerts }: { item: NavItem; index: number; collapsed: boolean; alerts: number }) {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        `relative flex h-8 [@media(max-height:430px)]:h-6 items-center gap-2.5 px-2.5 border-l-2 transition-colors ${
          isActive ? "border-primary text-primary bg-primary/[0.06]" : "border-transparent text-muted hover:text-text"
        } ${collapsed ? "justify-center" : "justify-center lg:justify-start"}`
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && (
        <span className="hidden lg:inline truncate">
          <span className="text-faint">{String(index).padStart(2, "0")}</span> {label}
        </span>
      )}
      {alerts > 0 && (
        <span className={`text-[10px] text-red-400 ${collapsed ? "absolute top-0 right-0.5" : "hidden lg:inline ml-auto"}`}>{alerts}</span>
      )}
    </NavLink>
  );
}

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

  const riskScore = stats?.risk_score;
  const riskGrade = stats?.risk_grade;

  // Page name for the tab title, and the path shown in the top bar.
  const pageTitle = (() => {
    const path = location.pathname;
    if (path === "/app") return "Overview";
    if (path.startsWith("/app/live")) return "Live Traffic";
    if (path.startsWith("/app/alerts/")) return `Alert ${path.replace("/app/alerts/", "")}`;
    if (path.startsWith("/app/alerts")) return "Alerts";
    if (path.startsWith("/app/inventory")) return "AI Inventory";
    if (path.startsWith("/app/agents")) return "Agents";
    if (path.startsWith("/app/graph")) return "Threat Graph";
    if (path.startsWith("/app/simulate")) return "Attack Simulator";
    if (path.startsWith("/app/ingest")) return "Evidence Ingest";
    if (path.startsWith("/app/policies")) return "Policies";
    if (path.startsWith("/app/settings")) return "Settings";
    return "Console";
  })();
  const consolePath = location.pathname.replace(/^\/app/, "console");
  const riskTone = riskGrade === "A" || riskGrade === "B" ? "text-emerald-400" : riskGrade === "C" ? "text-amber-400" : "text-red-400";

  useEffect(() => {
    document.title = `${pageTitle} · ShadowScope`;
  }, [pageTitle]);

  const handleToggleDemo = () => {
    const next = demoModeOverride === true ? null : true;
    setDemoModeOverride(next);
    setManualDemoMode(next);
    toast.info(next ? "Switched to Demo Data Mode" : "Auto-detecting Live Engine...");
  };

  return (
    <div className="relative min-h-screen bg-bg text-text flex flex-col antialiased">
      <div className="fixed inset-0 pointer-events-none -z-10 hairline-grid" />

      <div className="flex flex-1 min-h-screen">
        {/* ======================================================================== */}
        {/* Desktop & Tablet Sidebar (Hidden on <768px Mobile)                       */}
        {/* ======================================================================== */}
        <aside
          className={`hidden md:flex sticky top-0 h-dvh flex-col overflow-hidden border-r border-border bg-bg transition-[width] duration-150 z-30 shrink-0 ${
            collapsed ? "w-14" : "w-14 lg:w-52"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-3 border-b border-border">
            <NavLink to="/" className="flex items-center gap-2.5 min-w-0 text-primary" aria-label="ShadowScope home">
              <ScopeMark className="w-6 h-6 shrink-0" />
              {!collapsed && (
                <span className="hidden lg:inline font-mono text-[13px] font-medium text-text truncate">shadowscope</span>
              )}
            </NavLink>
            {!collapsed && (
              <button
                onClick={() => setCollapsed(true)}
                className="hidden lg:flex p-1 text-muted hover:text-text transition-colors cursor-pointer"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="hidden lg:flex h-8 shrink-0 items-center justify-center border-b border-border text-muted hover:text-text cursor-pointer"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          <nav aria-label="Console" className="flex-1 min-h-0 overflow-hidden px-1.5 py-2 font-mono text-xs">
            <ul>
              {PRIMARY_LINKS.map((item, index) => (
                <li key={item.to}>
                  <SidebarLink item={item} index={index + 1} collapsed={collapsed} alerts={unreadCriticals.length} />
                </li>
              ))}
            </ul>
            <div className="my-2 h-px bg-border" />
            <ul>
              {SECONDARY_LINKS.map((item, index) => (
                <li key={item.to}>
                  <SidebarLink item={item} index={PRIMARY_LINKS.length + index + 1} collapsed={collapsed} alerts={0} />
                </li>
              ))}
            </ul>
          </nav>

          {!collapsed && (
            <div className="hidden lg:block [@media(max-height:520px)]:!hidden shrink-0 border-t border-border px-3 py-2.5 font-mono text-[11px] text-muted">
              <div className="flex items-baseline justify-between">
                <span>risk</span>
                <span className="text-text">
                  {riskScore ?? "–"}/100 <span className="text-primary">{riskGrade ?? ""}</span>
                </span>
              </div>
              <div className="mt-1.5 h-0.5 bg-border">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, riskScore ?? 0)}%` }} />
              </div>
            </div>
          )}
        </aside>

        {/* ======================================================================== */}
        {/* Main Content Area                                                        */}
        {/* ======================================================================== */}
        <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
          {/* Top Bar */}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-bg px-3 sm:px-6">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMoreDrawerOpen(true)}
                className="md:hidden p-1.5 text-muted hover:text-text cursor-pointer"
                aria-label="Open navigation drawer"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-mono text-xs sm:text-[13px] text-text truncate">
                <span className="text-muted">~/</span>
                {consolePath}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 font-mono text-[11px] shrink-0">
              <span className="hidden sm:inline text-muted">
                risk <span className={riskTone}>{riskScore ?? "–"}</span> <span className={riskTone}>{riskGrade ?? ""}</span>
              </span>

              <button
                onClick={handleToggleDemo}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-text hover:border-primary cursor-pointer transition-colors"
                title="Switch between the live engine and demo data"
              >
                <span className={`w-1.5 h-1.5 shrink-0 ${engineStatus === "live" ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span>{engineStatus === "live" ? "LIVE ENGINE" : "DEMO DATA"}</span>
              </button>

              <button
                onClick={() => setCmdOpen(true)}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-muted hover:text-text hover:border-primary cursor-pointer transition-colors"
                aria-label="Open command palette"
              >
                <Search className="w-3.5 h-3.5" />
                <kbd className="hidden sm:inline">⌘K</kbd>
              </button>

              <NotificationsPopover />
            </div>
          </header>

          {/* Page View with Smooth Animated PageTransition */}
          <main className="flex-1 min-w-0 p-4 sm:p-6">
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-[50vh] font-mono text-xs text-muted">
                  loading…
                </div>
              }
            >
              <PageTransition>
                <Outlet />
              </PageTransition>
            </Suspense>
          </main>

          <footer className="hidden md:flex sticky bottom-0 z-20 h-7 items-center gap-5 border-t border-border bg-bg px-6 font-mono text-[11px] text-muted">
            <span>{engineStatus === "live" ? "engine: live" : "engine: demo"}</span>
            <span>open: {stats?.totals?.findings_open ?? "–"}</span>
            <span>critical: {stats?.totals?.critical ?? "–"}</span>
            <span className="ml-auto">
              <kbd>⌘K</kbd> palette
            </span>
          </footer>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* Mobile Bottom Navigation Bar (< 768px)                                   */}
      {/* ======================================================================== */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg px-2 py-1 flex items-center justify-around"
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
        title="Navigate"
      >
        <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
          {[...PRIMARY_LINKS, ...SECONDARY_LINKS].map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMoreDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 p-2.5 rounded-sm border transition-colors ${
                  isActive ? "border-primary text-primary" : "border-border text-text"
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </Drawer>

      {/* Command Palette (⌘K) Modal */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
