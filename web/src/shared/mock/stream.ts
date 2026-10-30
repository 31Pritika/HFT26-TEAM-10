import type { AIEvent, Finding, Overview, StreamMessage } from "../types";
import events from "./events.json";
import findings from "./findings.json";
import overview from "./overview.json";

const EVENTS = events.items as unknown as AIEvent[];
const FINDINGS = findings.items as unknown as Finding[];
const STATS = overview as unknown as Overview;

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const uid = (prefix: string) => `${prefix}_mock_${Math.random().toString(36).slice(2, 10)}`;

/** Fake WebSocket: an event every 1–3 s, a finding every ~6 s, stats every 3 s. Returns a stop function. */
export function startMockStream(onMessage: (message: StreamMessage) => void): () => void {
  let eventTimer: ReturnType<typeof setTimeout>;

  const emitEvent = () => {
    const ts = new Date().toISOString();
    onMessage({ type: "event", data: { ...pick(EVENTS), id: uid("evt"), ts } });
    eventTimer = setTimeout(emitEvent, 1000 + Math.random() * 2000);
  };
  eventTimer = setTimeout(emitEvent, 1000 + Math.random() * 2000);

  const findingTimer = setInterval(() => {
    const ts = new Date().toISOString();
    onMessage({ type: "finding", data: { ...pick(FINDINGS), id: uid("fnd"), ts } });
  }, 6000);

  const statsTimer = setInterval(() => {
    const { risk_score, risk_grade, totals } = STATS;
    onMessage({ type: "stats", data: { risk_score, risk_grade, totals } });
  }, 3000);

  return () => {
    clearTimeout(eventTimer);
    clearInterval(findingTimer);
    clearInterval(statsTimer);
  };
}
