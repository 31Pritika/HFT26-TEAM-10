import { create } from "zustand";
import type { AIEvent, Finding, Overview, Severity, Source } from "./types";

export interface FeedFilter {
  provider?: string;
  source?: Source | "all";
  severity?: Severity | "all";
  searchQuery?: string;
  minRisk?: number;
}

export interface AppState {
  // Live stream buffers (capped at 200)
  events: AIEvent[];
  findings: Finding[];
  stats: Pick<Overview, "risk_score" | "risk_grade" | "totals"> | null;
  collectors: Record<string, { enabled?: boolean; running: boolean; reason?: string }>;
  
  // Engine connection & status
  engineStatus: "live" | "demo" | "connecting";
  demoModeOverride: boolean | null;
  lastHeartbeat: number;
  
  // Notifications
  unreadCriticals: Finding[];
  
  // Filters for live view
  filters: FeedFilter;
  
  // Simulation tracking
  activeScenarioId: string | null;
  simulationRunId: string | null;

  // Actions
  addEvent: (event: AIEvent) => void;
  addFinding: (finding: Finding) => void;
  updateStats: (stats: Pick<Overview, "risk_score" | "risk_grade" | "totals">) => void;
  setCollectorStatus: (name: string, running: boolean, reason?: string) => void;
  setEngineStatus: (status: "live" | "demo" | "connecting") => void;
  setDemoModeOverride: (enabled: boolean | null) => void;
  markCriticalRead: (findingId: string) => void;
  clearUnreadCriticals: () => void;
  setFilters: (filters: Partial<FeedFilter>) => void;
  setActiveScenario: (scenarioId: string | null, runId?: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  events: [],
  findings: [],
  stats: null,
  collectors: {},
  engineStatus: "connecting",
  demoModeOverride: null,
  lastHeartbeat: Date.now(),
  unreadCriticals: [],
  filters: {
    source: "all",
    severity: "all",
  },
  activeScenarioId: null,
  simulationRunId: null,

  addEvent: (event) =>
    set((state) => {
      // Prevent duplicate event ids if already present
      if (state.events.some((e) => e.id === event.id)) return state;
      const events = [event, ...state.events].slice(0, 200);
      return { events, lastHeartbeat: Date.now() };
    }),

  addFinding: (finding) =>
    set((state) => {
      if (state.findings.some((f) => f.id === finding.id)) return state;
      const findings = [finding, ...state.findings].slice(0, 200);
      const isCritical = finding.severity === "critical";
      const unreadCriticals = isCritical
        ? [finding, ...state.unreadCriticals.filter((f) => f.id !== finding.id)].slice(0, 50)
        : state.unreadCriticals;
      return { findings, unreadCriticals, lastHeartbeat: Date.now() };
    }),

  updateStats: (stats) =>
    set({ stats, lastHeartbeat: Date.now() }),

  setCollectorStatus: (name, running, reason) =>
    set((state) => ({
      collectors: {
        ...state.collectors,
        [name]: { ...state.collectors[name], running, reason },
      },
    })),

  setEngineStatus: (engineStatus) => set({ engineStatus }),

  setDemoModeOverride: (demoModeOverride) => set({ demoModeOverride }),

  markCriticalRead: (findingId) =>
    set((state) => ({
      unreadCriticals: state.unreadCriticals.filter((f) => f.id !== findingId),
    })),

  clearUnreadCriticals: () => set({ unreadCriticals: [] }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  setActiveScenario: (activeScenarioId, simulationRunId = null) =>
    set({ activeScenarioId, simulationRunId }),
}));
