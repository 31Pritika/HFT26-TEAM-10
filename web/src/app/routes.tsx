import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";

const AppShell = lazy(() => import("./AppShell"));

const Landing = lazy(() => import("../experience/pages/Landing"));
const Playground = lazy(() => import("../experience/pages/Playground"));
const Report = lazy(() => import("../experience/pages/Report"));
const Architecture = lazy(() => import("../experience/pages/Architecture"));
const NotFound = lazy(() => import("../experience/pages/NotFound"));

const consolePages = {
  ThreatConstellation: () => import("../experience/constellation/ThreatConstellation"),
  Overview: () => import("../dashboard/pages/Overview"),
  LiveTraffic: () => import("../dashboard/pages/LiveTraffic"),
  Alerts: () => import("../dashboard/pages/Alerts"),
  AlertDetail: () => import("../dashboard/pages/AlertDetail"),
  Inventory: () => import("../dashboard/pages/Inventory"),
  Agents: () => import("../dashboard/pages/Agents"),
  Ingest: () => import("../dashboard/pages/Ingest"),
  Policies: () => import("../dashboard/pages/Policies"),
  Settings: () => import("../dashboard/pages/Settings"),
};

const ThreatConstellation = lazy(consolePages.ThreatConstellation);
const Overview = lazy(consolePages.Overview);
const LiveTraffic = lazy(consolePages.LiveTraffic);
const Alerts = lazy(consolePages.Alerts);
const AlertDetail = lazy(consolePages.AlertDetail);
const Inventory = lazy(consolePages.Inventory);
const Agents = lazy(consolePages.Agents);
const Ingest = lazy(consolePages.Ingest);
const Policies = lazy(consolePages.Policies);
const Settings = lazy(consolePages.Settings);

/** Fetches every console page ahead of time, so moving between them never shows a loading state. */
export function preloadConsolePages() {
  Object.values(consolePages).forEach((load) => void load());
}

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/playground", element: <Playground /> },
  { path: "/report", element: <Report /> },
  { path: "/architecture", element: <Architecture /> },
  {
    path: "/app",
    element: <AppShell />,
    children: [
      { index: true, element: <Overview /> },
      { path: "live", element: <LiveTraffic /> },
      { path: "alerts", element: <Alerts /> },
      { path: "alerts/:id", element: <AlertDetail /> },
      { path: "inventory", element: <Inventory /> },
      { path: "agents", element: <Agents /> },
      { path: "graph", element: <ThreatConstellation /> },
      { path: "ingest", element: <Ingest /> },
      { path: "policies", element: <Policies /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
