import type {
  AgentSession, AIEvent, ComplianceReport, ExtensionEvent, Finding, GraphData, Health, IngestResult, InventoryItem,
  Observation, Overview, Page, Policy, Provider, ScanResult, Scenario, TriageResult,
} from "./types";

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:8787/api";
const DEMO_FORCED = import.meta.env.VITE_DEMO_MODE === "true";
const PROBE_TIMEOUT_MS = 1500;
const PROBE_INTERVAL_MS = 15_000;

type Query = Record<string, string | number | undefined>;
type Engine = "featherless" | "groq" | "ollama" | "rules" | "auto";

// ---- Engine probe -------------------------------------------------------------------------------
let engineUp = false;
let lastProbe: Promise<boolean> | null = null;
let lastProbeAt = 0;

export function probeEngine(): Promise<boolean> {
  if (DEMO_FORCED) return Promise.resolve(false);
  if (lastProbe && Date.now() - lastProbeAt < PROBE_INTERVAL_MS) return lastProbe;
  lastProbeAt = Date.now();
  lastProbe = fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    .then((response) => response.ok)
    .catch(() => false)
    .then((up) => (engineUp = up));
  return lastProbe;
}

export const isEngineLive = () => engineUp;

// ---- Mock data (code-split, loaded only in demo mode) --------------------------------------------
const mockFiles = import.meta.glob<{ default: unknown }>("./mock/*.json");

async function mock<T>(name: string): Promise<T> {
  const module = await mockFiles[`./mock/${name}.json`]();
  return module.default as T;
}

const findingOverrides = new Map<string, Partial<Finding>>();
let policyOverride: Partial<Policy> = {};

async function mockFindings(): Promise<Finding[]> {
  const { items } = await mock<Page<Finding>>("findings");
  return items.map((finding) => ({ ...finding, ...findingOverrides.get(finding.id) }));
}

function mockPage<T>(items: T[], query: Query = {}): Page<T> {
  return { items: items.slice(0, Number(query.limit ?? 100)), next_cursor: null };
}

const mockTriage = (finding: Finding): TriageResult => ({
  verdict: "needs_review",
  sensitivity: finding.severity,
  reasoning: "Demo mode: rules-based result, no LLM was consulted.",
  remediation_steps: finding.remediation,
  policy_suggestion: "Route this tool through the Local Gateway.",
  engine: "rules",
  model: "rules-v1",
  latency_ms: 4,
  redacted_input_preview: finding.evidence.redacted_snippet,
});

// ---- Transport -----------------------------------------------------------------------------------
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function qs(query: Query = {}): string {
  const entries = Object.entries(query).filter((entry): entry is [string, string | number] => entry[1] !== undefined);
  const params = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]));
  return entries.length ? `?${params}` : "";
}

/** Uses the live engine when reachable, otherwise the demo fallback. */
async function live<T>(call: () => Promise<T>, demo: () => T | Promise<T>): Promise<T> {
  return (await probeEngine()) ? call() : demo();
}

// ---- Endpoints (master spec §5) ------------------------------------------------------------------
export const api = {
  getHealth: () =>
    live(
      () => request<Health>("/health"),
      (): Health => ({ status: "ok", version: "demo", uptime_s: 0, collectors: {}, llm_engine: "rules" }),
    ),
  getOverview: (window = "24h") => live(() => request<Overview>(`/overview${qs({ window })}`), () => mock<Overview>("overview")),
  getEvents: (query?: Query) =>
    live(
      () => request<Page<AIEvent>>(`/events${qs(query)}`),
      async () => mockPage((await mock<Page<AIEvent>>("events")).items, query),
    ),
  getEvent: (id: string) =>
    live(
      () => request<AIEvent & { findings: Finding[] }>(`/events/${id}`),
      async () => {
        const { items } = await mock<Page<AIEvent>>("events");
        const event = items.find((item) => item.id === id);
        if (!event) throw new Error(`Event ${id} not found`);
        return { ...event, findings: (await mockFindings()).filter((finding) => finding.event_id === id) };
      },
    ),
  getFindings: (query?: Query) =>
    live(
      () => request<Page<Finding>>(`/findings${qs(query)}`),
      async () => mockPage(await mockFindings(), query),
    ),
  getFinding: (id: string) =>
    live(
      () => request<Finding & { event: AIEvent | null }>(`/findings/${id}`),
      async () => {
        const finding = (await mockFindings()).find((item) => item.id === id);
        if (!finding) throw new Error(`Finding ${id} not found`);
        const { items } = await mock<Page<AIEvent>>("events");
        return { ...finding, event: items.find((item) => item.id === finding.event_id) ?? null };
      },
    ),
  updateFinding: (id: string, status: Finding["status"]) =>
    live(
      () => request<Finding>(`/findings/${id}`, json("PATCH", { status })),
      async () => {
        findingOverrides.set(id, { ...findingOverrides.get(id), status });
        const finding = (await mockFindings()).find((item) => item.id === id);
        if (!finding) throw new Error(`Finding ${id} not found`);
        return finding;
      },
    ),
  triageFinding: (id: string, engine: Engine = "auto") =>
    live(
      () => request<TriageResult>(`/findings/${id}/triage`, json("POST", { engine })),
      async () => {
        const finding = (await mockFindings()).find((item) => item.id === id);
        if (!finding) throw new Error(`Finding ${id} not found`);
        return finding.triage ?? mockTriage(finding);
      },
    ),
  getInventory: () => live(() => request<{ items: InventoryItem[] }>("/inventory"), () => mock<{ items: InventoryItem[] }>("inventory")),
  getAgents: () => live(() => request<{ items: AgentSession[] }>("/agents"), () => mock<{ items: AgentSession[] }>("agents")),
  getAgent: (id: string) =>
    live(
      () => request<AgentSession>(`/agents/${id}`),
      async () => {
        const { items } = await mock<{ items: AgentSession[] }>("agents");
        const agent = items.find((item) => item.id === id);
        if (!agent) throw new Error(`Agent ${id} not found`);
        return agent;
      },
    ),
  getGraph: (window = "24h") => live(() => request<GraphData>(`/graph${qs({ window })}`), () => mock<GraphData>("graph")),
  getProviders: () => live(() => request<{ items: Provider[] }>("/providers"), () => mock<{ items: Provider[] }>("providers")),
  getPolicies: () =>
    live(
      () => request<Policy>("/policies"),
      async () => ({ ...(await mock<Policy>("policies")), ...policyOverride }),
    ),
  updatePolicies: (policy: Partial<Policy>) =>
    live(
      () => request<Policy>("/policies", json("PUT", policy)),
      async () => {
        policyOverride = { ...policyOverride, ...policy };
        return { ...(await mock<Policy>("policies")), ...policyOverride };
      },
    ),
  ingest: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return live(
      () => request<IngestResult>("/ingest", { method: "POST", body }),
      (): IngestResult => ({
        file_name: file.name, format: "log", events_created: 0, findings_created: 0, ai_requests: 0, duration_ms: 0,
        warnings: ["Demo mode: the file was not processed."],
      }),
    );
  },
  scan: (text: string, source: "playground" | "extension" | "api" = "playground", context?: { provider?: string; url?: string }) =>
    live(
      () => request<ScanResult>("/scan", json("POST", { text, source, context })),
      (): ScanResult => ({
        findings: [], risk_score: 0, redacted_text: text,
        stats: { chars: text.length, lines: text.split("\n").length, entropy_max: 0, flagged_tokens: 0, duration_ms: 0 },
      }),
    ),
  postObservations: (observations: Observation | Observation[]) =>
    live(
      () => request<{ accepted: number; event_ids: string[] }>("/observations", json("POST", observations)),
      () => ({ accepted: 0, event_ids: [] }),
    ),
  getScenarios: () => live(() => request<{ items: Scenario[] }>("/scenarios"), () => mock<{ items: Scenario[] }>("scenarios")),
  simulate: (scenario_id: string, intensity = 1) =>
    live(
      () => request<{ run_id: string; started: true }>("/simulate", json("POST", { scenario_id, intensity })),
      () => ({ run_id: `run_demo_${Date.now()}`, started: true as const }),
    ),
  getReport: (window = "7d") => live(() => request<ComplianceReport>(`/report${qs({ window })}`), () => mock<ComplianceReport>("report")),
  reportExportUrl: (format: "json" | "csv") => `${API_BASE}/report/export${qs({ format })}`,
  postExtensionEvent: (event: ExtensionEvent) =>
    live(
      () => request<{ event_id: string; findings: Finding[] }>("/extension/event", json("POST", event)),
      () => ({ event_id: `evt_demo_${Date.now()}`, findings: [] }),
    ),
};
