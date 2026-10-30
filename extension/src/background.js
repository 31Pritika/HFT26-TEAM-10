/*
 * Service worker: posts redacted events to the local engine and keeps per-site counters. Talks to localhost and nothing else.
 * The worker can be stopped at any moment, so all state lives in chrome.storage. With no `alarms` permission, the offline queue
 * is flushed whenever something wakes the worker: the next event, the popup, or browser start.
 */
importScripts("scanner.js");

const API = "http://localhost:8787/api";
const MAX_QUEUE = 200;
const MAX_EVENT_CHARS = 100000;
const REQUEST_TIMEOUT_MS = 4000;
const KEEP_DAYS = 7;
const EVENT_FIELDS = ["site", "url", "kind", "text", "ts", "browser"];

let chain = Promise.resolve();

/** Storage has no transactions, so every read-then-write runs in turn. */
function serial(task) {
  chain = chain.then(task, task);
  return chain;
}

function today(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function bump(site, changes) {
  const { counts = {} } = await chrome.storage.local.get("counts");
  const day = today();
  const entry = { events: 0, findings: 0, critical: 0, redacted: 0, allowed: 0, cancelled: 0, ...counts[day]?.[site] };
  for (const [key, amount] of Object.entries(changes)) entry[key] += amount;
  counts[day] = { ...counts[day], [site]: entry };
  const oldest = today(new Date(Date.now() - KEEP_DAYS * 86400000));
  for (const key of Object.keys(counts)) if (key < oldest) delete counts[key];
  await chrome.storage.local.set({ counts });
}

async function post(payload) {
  const response = await fetch(`${API}/extension/event`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status >= 500) throw new Error(`engine answered ${response.status}`);
  return response.ok;   // a 4xx will never succeed, so it must not sit in the queue
}

async function flushQueue() {
  const { queue = [] } = await chrome.storage.local.get("queue");
  while (queue.length) {
    try {
      await post(queue[0]);
    } catch {
      break;
    }
    queue.shift();
    await chrome.storage.local.set({ queue });
  }
}

async function enqueue(payload) {
  const { queue = [] } = await chrome.storage.local.get("queue");
  queue.push(payload);
  await chrome.storage.local.set({ queue: queue.slice(-MAX_QUEUE) });
}

/** Content scripts send redacted text already. Redacting again here means one bug there is not enough to leak. */
function buildPayload(event, findings) {
  const payload = Object.fromEntries(EVENT_FIELDS.map((field) => [field, event[field]]));
  payload.text = ShadowScopeScanner.redact(String(event.text || "")).slice(0, MAX_EVENT_CHARS);
  payload.findings = Array.isArray(findings) ? findings : [];
  return payload;
}

async function handleEvent({ event, findings }) {
  const payload = buildPayload(event, findings);
  await bump(payload.site, {
    events: 1, findings: payload.findings.length, critical: payload.findings.filter((f) => f.severity === "critical").length,
  });
  await flushQueue();
  try {
    await post(payload);
  } catch {
    await enqueue(payload);
  }
}

async function refreshPolicy() {
  try {
    const response = await fetch(`${API}/policies`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.ok) await chrome.storage.local.set({ canaryTokens: (await response.json()).canary_tokens || [] });
  } catch {
    // keep the last tokens we saw: the engine may just be down
  }
}

async function status() {
  await flushQueue();
  await refreshPolicy();
  const { queue = [] } = await chrome.storage.local.get("queue");
  try {
    const response = await fetch(`${API}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const health = await response.json();
    return { online: response.ok, version: health.version ?? null, queued: queue.length };
  } catch {
    return { online: false, version: null, queued: queue.length };
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message.type === "event") {
    serial(() => handleEvent(message));
  } else if (message.type === "decision" && ["redacted", "allowed", "cancelled"].includes(message.decision)) {
    serial(() => bump(message.site, { [message.decision]: 1 }));
  } else if (message.type === "status") {
    serial(status).then(respond);
    return true;
  }
  return false;
});

chrome.runtime.onStartup.addListener(() => serial(status));
chrome.runtime.onInstalled.addListener(() => serial(status));
