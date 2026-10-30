import type {
  AgentSession, AIEvent, ComplianceReport, ExtensionEvent, Finding, GraphData, Health, IngestResult, InventoryItem,
  Observation, Overview, Page, Policy, Provider, ScanResult, Scenario, TriageResult,
} from "./types";
import { triggerMockScenario, injectMockEvent, injectMockFinding } from "./mock/stream";

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:8787/api";
const DEMO_FORCED = import.meta.env.VITE_DEMO_MODE === "true";
const PROBE_TIMEOUT_MS = 1500;
const PROBE_INTERVAL_MS = 15_000;

export const isDemoModeForced = () => DEMO_FORCED;

type Query = Record<string, string | number | undefined>;
type Engine = "featherless" | "groq" | "ollama" | "rules" | "auto";

// ---- Engine probe -------------------------------------------------------------------------------
let engineUp = false;
let manualDemoMode: boolean | null = null;
let lastProbe: Promise<boolean> | null = null;
let lastProbeAt = 0;

export function setManualDemoMode(enabled: boolean | null) {
  manualDemoMode = enabled;
}

export function probeEngine(): Promise<boolean> {
  if (DEMO_FORCED || manualDemoMode === true) return Promise.resolve(false);
  if (lastProbe && Date.now() - lastProbeAt < PROBE_INTERVAL_MS) return lastProbe;
  lastProbeAt = Date.now();
  lastProbe = fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    .then((response) => response.ok)
    .catch(() => false)
    .then((up) => (engineUp = up));
  return lastProbe;
}

export const isEngineLive = () => engineUp && !DEMO_FORCED && manualDemoMode !== true;

// Simulated latency helper for demo mode realism (150-350ms)
const sleep = (ms = 150 + Math.random() * 200) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Mock data (code-split, loaded only in demo mode) --------------------------------------------
const mockFiles = import.meta.glob<{ default: unknown }>("./mock/*.json");

async function mock<T>(name: string): Promise<T> {
  const module = await mockFiles[`./mock/${name}.json`]();
  return JSON.parse(JSON.stringify(module.default)) as T;
}

const findingOverrides = new Map<string, Partial<Finding>>();
let policyOverride: Partial<Policy> = {};

async function mockFindings(): Promise<Finding[]> {
  const { items } = await mock<Page<Finding>>("findings");
  return items.map((finding) => ({ ...finding, ...findingOverrides.get(finding.id) }));
}

function mockPage<T>(items: T[], query: Query = {}): Page<T> {
  const limit = Number(query.limit ?? 100);
  return { items: items.slice(0, limit), next_cursor: null };
}

const mockTriage = (finding: Finding): TriageResult => ({
  verdict: finding.severity === "critical" || finding.severity === "high" ? "true_positive" : "needs_review",
  sensitivity: finding.severity,
  reasoning: `Demo mode analysis: detected signature of pattern '${finding.subtype}' with confidence ${(finding.confidence * 100).toFixed(0)}%. Payload matches unmonitored shadow traffic without TLS inspection compromise.`,
  remediation_steps: finding.remediation.length > 0 ? finding.remediation : [
    "Rotate exposed secret in credential vault",
    "Notify security officer of potential exfiltration",
    "Update endpoint policy to block unsanctioned tool calls",
  ],
  policy_suggestion: "Add process allowlisting rule in ShadowScope Policy Manager.",
  engine: "rules",
  model: "shadowscope-analyst-v2",
  latency_ms: 184,
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

/** Uses the live engine when reachable, otherwise the demo fallback with simulated latency. */
async function live<T>(call: () => Promise<T>, demo: () => T | Promise<T>): Promise<T> {
  if (manualDemoMode !== true && !DEMO_FORCED && (await probeEngine())) {
    return call();
  }
  await sleep();
  return demo();
}

// Client-side regex scanner for demo mode /scan
function clientSideScan(text: string): ScanResult {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  
  // AWS Key regex
  const awsMatch = text.match(/\b(AKIA|ASIA)[0-9A-Z]{16}\b/);
  if (awsMatch) {
    findings.push({
      id: `fnd_scan_${Date.now()}_aws`,
      ts: new Date().toISOString(),
      event_id: null,
      type: "secret",
      subtype: "aws_access_key",
      severity: "critical",
      confidence: 1.0,
      title: "AWS Access Key Exposed",
      description: "AWS IAM user/role access key identifier discovered in scanned input.",
      evidence: {
        redacted_snippet: `access_key = "${awsMatch[0].slice(0, 4)}****************"`,
        match_redacted: `${awsMatch[0].slice(0, 4)}****************`,
        entropy: 4.1,
        line: 1,
        offset: awsMatch.index ?? 0,
        fingerprint: "a9b2c3d4e5f6",
      },
      detector: "regex",
      provider_id: null,
      process_name: "ShadowScope Playground",
      status: "open",
      compliance: ["SOC2", "ISO27001", "PCI-DSS"],
      remediation: ["Deactivate key in IAM console", "Rotate immediately", "Scan repos for committed keys"],
      triage: null,
    });
  }

  // OpenAI Key regex
  const openaiMatch = text.match(/\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/);
  if (openaiMatch) {
    findings.push({
      id: `fnd_scan_${Date.now()}_oai`,
      ts: new Date().toISOString(),
      event_id: null,
      type: "secret",
      subtype: "openai_key",
      severity: "critical",
      confidence: 0.99,
      title: "OpenAI API Secret Key Discovered",
      description: "Live OpenAI API authentication token detected.",
      evidence: {
        redacted_snippet: `sk-proj-********************`,
        match_redacted: `sk-proj-********************`,
        entropy: 4.5,
        line: 1,
        offset: openaiMatch.index ?? 0,
        fingerprint: "f1e2d3c4b5a6",
      },
      detector: "regex",
      provider_id: "openai",
      process_name: "ShadowScope Playground",
      status: "open",
      compliance: ["SOC2", "ISO27001"],
      remediation: ["Revoke API key in OpenAI Dashboard", "Switch to temporary project keys"],
      triage: null,
    });
  }

  // PII email regex
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    findings.push({
      id: `fnd_scan_${Date.now()}_email`,
      ts: new Date().toISOString(),
      event_id: null,
      type: "pii",
      subtype: "email",
      severity: "medium",
      confidence: 0.95,
      title: "Customer Email Address Disclosed",
      description: "PII email address discovered in payload.",
      evidence: {
        redacted_snippet: `user: ***@***.***`,
        match_redacted: `***@***.***`,
        entropy: null,
        line: 1,
        offset: emailMatch.index ?? 0,
        fingerprint: "e1a2b3c4d5e6",
      },
      detector: "regex",
      provider_id: null,
      process_name: "ShadowScope Playground",
      status: "open",
      compliance: ["GDPR", "DPDP"],
      remediation: ["Anonymize user records", "Mask email before LLM transmission"],
      triage: null,
    });
  }

  let redacted = text;
  if (awsMatch) redacted = redacted.replace(awsMatch[0], "AKIA****************");
  if (openaiMatch) redacted = redacted.replace(openaiMatch[0], "sk-********************");

  const riskScore = findings.some((f) => f.severity === "critical") ? 95 : findings.some((f) => f.severity === "high") ? 75 : findings.length > 0 ? 45 : 0;

  return {
    findings,
    risk_score: riskScore,
    redacted_text: redacted,
    stats: {
      chars: text.length,
      lines: lines.length,
      entropy_max: 4.6,
      flagged_tokens: findings.length,
      duration_ms: 18,
    },
  };
}

// ---- Endpoints (master spec §5) ------------------------------------------------------------------
export const api = {
  getHealth: () =>
    live(
      () => request<Health>("/health"),
      (): Health => ({
        status: "ok",
        version: "0.9.4-demo",
        uptime_s: 3600,
        collectors: {
          process_conn: { enabled: true, running: true },
          ip_cache: { enabled: true, running: true },
          dns_sni: { enabled: true, running: true },
          loopback: { enabled: true, running: true },
          agent_watch: { enabled: true, running: true },
        },
        llm_engine: "rules",
      }),
    ),
  getOverview: (window = "24h") =>
    live(
      () => request<Overview>(`/overview${qs({ window })}`),
      async () => {
        const data = await mock<Overview>("overview");
        // Apply status overrides to totals count
        let resolvedCount = 0;
        findingOverrides.forEach((val) => {
          if (val.status === "resolved" || val.status === "false_positive") resolvedCount++;
        });
        return {
          ...data,
          totals: {
            ...data.totals,
            findings_open: Math.max(0, data.totals.findings_open - resolvedCount),
          },
        };
      },
    ),
  getEvents: (query?: Query) =>
    live(
      () => request<Page<AIEvent>>(`/events${qs(query)}`),
      async () => {
        const { items } = await mock<Page<AIEvent>>("events");
        let filtered = items;
        if (query?.provider) filtered = filtered.filter((i) => i.provider?.id === query.provider);
        if (query?.source && query.source !== "all") filtered = filtered.filter((i) => i.source === query.source);
        if (query?.min_risk) filtered = filtered.filter((i) => i.risk_score >= Number(query.min_risk));
        return mockPage(filtered, query);
      },
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
      async () => {
        let items = await mockFindings();
        if (query?.severity && query.severity !== "all") items = items.filter((f) => f.severity === query.severity);
        if (query?.status && query.status !== "all") items = items.filter((f) => f.status === query.status);
        if (query?.type && query.type !== "all") items = items.filter((f) => f.type === query.type);
        if (query?.q) {
          const q = String(query.q).toLowerCase();
          items = items.filter((f) => f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.subtype.toLowerCase().includes(q));
        }
        return mockPage(items, query);
      },
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
        const result = finding.triage ?? mockTriage(finding);
        findingOverrides.set(id, { ...findingOverrides.get(id), triage: result });
        return result;
      },
    ),
  getInventory: () =>
    live(
      () => request<{ items: InventoryItem[] }>("/inventory"),
      () => mock<{ items: InventoryItem[] }>("inventory"),
    ),
  getAgents: () =>
    live(
      () => request<{ items: AgentSession[] }>("/agents"),
      () => mock<{ items: AgentSession[] }>("agents"),
    ),
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
  getGraph: (window = "24h") =>
    live(
      () => request<GraphData>(`/graph${qs({ window })}`),
      () => mock<GraphData>("graph"),
    ),
  getProviders: () =>
    live(
      () => request<{ items: Provider[] }>("/providers"),
      () => mock<{ items: Provider[] }>("providers"),
    ),
  getPolicies: () =>
    live(
      () => request<Policy>("/policies"),
      async () => ({ ...(await mock<Policy>("policies")), ...policyOverride }),
    ),
  updatePolicies: (policy: Partial<Policy>) =>
    live(
      () => request<Policy>(`/policies`, json("PUT", policy)),
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
      (): IngestResult => {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "log";
        const format = (["pcap", "har", "jsonl", "json", "log"].includes(ext) ? ext : "log") as IngestResult["format"];
        return {
          file_name: file.name,
          format,
          events_created: 14 + Math.floor(Math.random() * 8),
          findings_created: 4 + Math.floor(Math.random() * 4),
          ai_requests: 12 + Math.floor(Math.random() * 6),
          duration_ms: 342,
          warnings: ["Sanitized 2 proprietary API tokens during offline parse"],
        };
      },
    );
  },
  scan: (text: string, source: "playground" | "extension" | "api" = "playground", context?: { provider?: string; url?: string }) =>
    live(
      () => request<ScanResult>("/scan", json("POST", { text, source, context })),
      (): ScanResult => clientSideScan(text),
    ),
  postObservations: (observations: Observation | Observation[]) =>
    live(
      () => request<{ accepted: number; event_ids: string[] }>("/observations", json("POST", observations)),
      () => {
        const obsList = Array.isArray(observations) ? observations : [observations];
        obsList.forEach((obs) => {
          injectMockEvent({
            source: obs.source,
            bytes_out: obs.bytes_out ?? 1024,
            payload_preview: obs.body_text ?? null,
            payload_visible: Boolean(obs.body_text),
          });
        });
        return { accepted: obsList.length, event_ids: obsList.map(() => `evt_obs_${Date.now()}`) };
      },
    ),
  getScenarios: () =>
    live(
      () => request<{ items: Scenario[] }>("/scenarios"),
      () => mock<{ items: Scenario[] }>("scenarios"),
    ),
  simulate: (scenario_id: string, intensity = 1) =>
    live(
      () => request<{ run_id: string; started: true }>("/simulate", json("POST", { scenario_id, intensity })),
      () => {
        triggerMockScenario(scenario_id);
        return { run_id: `run_sim_${Date.now()}`, started: true as const };
      },
    ),
  getReport: (window = "7d") =>
    live(
      () => request<ComplianceReport>(`/report${qs({ window })}`),
      () => mock<ComplianceReport>("report"),
    ),
  reportExportUrl: (format: "json" | "csv") => `${API_BASE}/report/export${qs({ format })}`,
  postExtensionEvent: (event: ExtensionEvent) =>
    live(
      () => request<{ event_id: string; findings: Finding[] }>("/extension/event", json("POST", event)),
      () => {
        const scan = clientSideScan(event.text);
        const evt = injectMockEvent({
          source: "extension",
          payload_preview: event.text.slice(0, 500),
          payload_visible: true,
          risk_score: scan.risk_score,
          tags: ["extension", event.kind, event.browser],
        });
        scan.findings.forEach((f) => {
          injectMockFinding({ ...f, event_id: evt.id });
        });
        return { event_id: evt.id, findings: scan.findings };
      },
    ),
};
