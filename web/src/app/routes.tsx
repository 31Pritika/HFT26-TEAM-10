import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";

const AppShell = lazy(() => import("./AppShell"));

const Landing = lazy(() => import("../experience/pages/Landing"));
const Playground = lazy(() => import("../experience/pages/Playground"));
const Report = lazy(() => import("../experience/pages/Report"));
const Architecture = lazy(() => import("../experience/pages/Architecture"));
const NotFound = lazy(() => import("../experience/pages/NotFound"));
const ThreatConstellation = lazy(() => import("../experience/constellation/ThreatConstellation"));

const Overview = lazy(() => import("../dashboard/pages/Overview"));
const LiveTraffic = lazy(() => import("../dashboard/pages/LiveTraffic"));
const Alerts = lazy(() => import("../dashboard/pages/Alerts"));
const AlertDetail = lazy(() => import("../dashboard/pages/AlertDetail"));
const Inventory = lazy(() => import("../dashboard/pages/Inventory"));
const Agents = lazy(() => import("../dashboard/pages/Agents"));
const Simulate = lazy(() => import("../dashboard/pages/Simulate"));
const Ingest = lazy(() => import("../dashboard/pages/Ingest"));
const Policies = lazy(() => import("../dashboard/pages/Policies"));
const Settings = lazy(() => import("../dashboard/pages/Settings"));

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
      { path: "simulate", element: <Simulate /> },
      { path: "ingest", element: <Ingest /> },
      { path: "policies", element: <Policies /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
