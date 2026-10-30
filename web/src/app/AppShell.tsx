import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";

const LINKS = [
  { to: "/app", label: "Overview", end: true },
  { to: "/app/live", label: "Live Traffic" },
  { to: "/app/alerts", label: "Alerts" },
  { to: "/app/inventory", label: "Inventory" },
  { to: "/app/agents", label: "Agents" },
  { to: "/app/graph", label: "Graph" },
  { to: "/app/simulate", label: "Simulate" },
  { to: "/app/ingest", label: "Ingest" },
  { to: "/app/policies", label: "Policies" },
  { to: "/app/settings", label: "Settings" },
];

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav aria-label="Dashboard" className="border-b border-border bg-bg-2 p-4 md:w-56 md:border-r md:border-b-0">
        <p className="mb-4 font-display text-lg font-semibold text-primary">ShadowScope</p>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {LINKS.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `block rounded-sm px-3 py-2 text-sm whitespace-nowrap ${isActive ? "bg-surface-solid text-primary" : "text-muted hover:text-text"}`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-6">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
