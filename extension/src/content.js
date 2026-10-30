/*
 * Watches paste and submit in AI chat prompt boxes. Scanning happens here, in the page, so raw text never leaves it:
 * everything passed to the background worker is already redacted, and the worker redacts again before it sends.
 */
(function () {
  "use strict";

  if (globalThis.__shadowScopeSensor) return;
  globalThis.__shadowScopeSensor = true;

  const { scan, withFingerprints } = globalThis.ShadowScopeScanner;
  const PROMPT_SELECTOR = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]';
  const SEND_SELECTOR = 'button[data-testid="send-button"], button[aria-label*="send" i], button[type="submit"]';
  const MAX_TOAST_ROWS = 5;
  const OBSERVER_DELAY_MS = 300;
  const SEVERITY_ICON = { critical: "⛔", high: "▲", medium: "◆", low: "●", info: "ℹ" };

  const TOAST_CSS = `
    :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; }
    .toast {
      --critical: #FF3B5C; --high: #FF8A3D; --medium: #FACC15; --low: #34D399; --info: #60A5FA;
      box-sizing: border-box; width: 380px; max-width: calc(100vw - 40px); padding: 16px; color: #E8ECF5;
      font: 13px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background: rgba(17, 22, 39, 0.92); border: 1px solid rgba(148, 163, 255, 0.22); border-radius: 14px;
      -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: 0 0 28px rgba(255, 59, 92, 0.35);
      animation: rise 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
    h2 { margin: 0 0 2px; font: 600 15px/1.3 "Space Grotesk", Inter, ui-sans-serif, system-ui, sans-serif; color: #E8ECF5; }
    p { margin: 0 0 10px; color: #8A93A8; }
    ul { list-style: none; margin: 0 0 12px; padding: 0; }
    li { display: grid; grid-template-columns: 76px 1fr; gap: 2px 8px; padding: 6px 0; border-top: 1px solid rgba(148, 163, 255, 0.10); }
    .severity { font-weight: 600; text-transform: capitalize; }
    .critical { color: var(--critical); } .high { color: var(--high); } .medium { color: var(--medium); }
    .low { color: var(--low); } .info { color: var(--info); }
    code { grid-column: 2; font: 12px/1.4 "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; color: #8A93A8; overflow-wrap: anywhere; }
    .more { color: #8A93A8; padding-top: 6px; border-top: 1px solid rgba(148, 163, 255, 0.10); }
    .actions { display: flex; gap: 8px; }
    button { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(148, 163, 255, 0.22); cursor: pointer; font: 600 13px/1.2 Inter, ui-sans-serif, system-ui, sans-serif; }
    .primary { background: #22D3EE; border-color: #22D3EE; color: #05060A; }
    .secondary { background: transparent; color: #E8ECF5; }
    button:focus-visible { outline: 2px solid #22D3EE; outline-offset: 2px; }
  `;

  let enabled = true;
  let canaryTokens = [];
  let promptBox = null;
  let toastHost = null;
  let bypass = false;
  const allowedValues = new Set();   // raw values the user chose to keep. Never leaves this tab.

  function safely(task) {
    try {
      return task();
    } catch {
      return undefined;   // the extension was reloaded under this page: nothing to report to any more
    }
  }

  function loadSettings() {
    safely(() => chrome.storage.local.get(["enabled", "canaryTokens"], (stored) => {
      enabled = stored.enabled !== false;
      canaryTokens = stored.canaryTokens || [];
    }));
  }

  function browserName() {
    const brands = (navigator.userAgentData?.brands || []).map((entry) => entry.brand);
    if (brands.includes("Microsoft Edge") || navigator.userAgent.includes("Edg/")) return "edge";
    return brands.includes("Google Chrome") || navigator.userAgent.includes("Chrome/") ? "chrome" : "other";
  }

  const siteName = () => location.hostname.replace(/^www\./, "");
  const pageUrl = () => location.origin + location.pathname;   // query strings and fragments can hold anything

  async function report(kind, result) {
    const safe = result ? await withFingerprints(result) : null;
    const event = {
      site: siteName(), url: pageUrl(), kind, ts: new Date().toISOString(), browser: browserName(),
      // A clean prompt is nobody's business: only the fact that it happened is recorded.
      text: safe ? safe.redacted_text : "",
    };
    safely(() => chrome.runtime.sendMessage({ type: "event", event, findings: safe ? safe.findings : [] }));
  }

  function reportDecision(decision) {
    safely(() => chrome.runtime.sendMessage({ type: "decision", site: siteName(), decision }));
  }

  // --- prompt box ---------------------------------------------------------------------------------------------------

  function promptBoxFrom(event) {
    for (const node of event.composedPath()) {
      if (node instanceof Element && node.matches(PROMPT_SELECTOR)) return node;
    }
    return null;
  }

  function isVisible(element) {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }

  function findPromptBoxes(root, found = []) {
    found.push(...root.querySelectorAll(PROMPT_SELECTOR));
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) findPromptBoxes(element.shadowRoot, found);
    }
    return found;
  }

  function discoverPromptBox() {
    if (promptBox?.isConnected) return;
    const boxes = findPromptBoxes(document).filter(isVisible);
    const area = (element) => element.getBoundingClientRect().width * element.getBoundingClientRect().height;
    promptBox = boxes.sort((a, b) => area(b) - area(a))[0] || null;
  }

  function watchForPromptBox() {
    let timer = null;
    new MutationObserver(() => {
      if (timer === null && !promptBox?.isConnected) {
        timer = setTimeout(() => {   // chat apps replace the whole page on navigation, without a reload
          timer = null;
          discoverPromptBox();
        }, OBSERVER_DELAY_MS);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
    discoverPromptBox();
  }

  const readBox = (box) => ("value" in box ? box.value : box.innerText);

  function selectionIn(box) {
    if ("value" in box) return { start: box.selectionStart ?? box.value.length, end: box.selectionEnd ?? box.value.length };
    const selection = box.getRootNode().getSelection?.() || document.getSelection();
    return selection?.rangeCount ? { range: selection.getRangeAt(0).cloneRange() } : {};
  }

  function writeControl(box, text, replace, saved) {
    // React tracks `value` through the prototype setter, so assigning box.value directly would be ignored.
    const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setValue = Object.getOwnPropertyDescriptor(proto, "value").set;
    const start = replace ? 0 : saved.start, end = replace ? box.value.length : saved.end;
    setValue.call(box, box.value.slice(0, start) + text + box.value.slice(end));
    box.selectionStart = box.selectionEnd = start + text.length;
    box.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: text }));
  }

  function writeEditable(box, text, replace, saved) {
    const selection = box.getRootNode().getSelection?.() || document.getSelection();
    selection.removeAllRanges();
    if (replace || !saved.range) {
      const range = document.createRange();
      range.selectNodeContents(box);
      if (!replace) range.collapse(false);
      selection.addRange(range);
    } else {
      selection.addRange(saved.range);
    }
    const before = box.innerText;
    if (document.execCommand("insertText", false, text) && box.innerText !== before) return;
    // ProseMirror and Quill can refuse execCommand, but they all handle paste.
    const data = new DataTransfer();
    data.setData("text/plain", text);
    withBypass(() => box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true, composed: true })));
  }

  function writeBox(box, text, { replace = false, saved = {} } = {}) {
    box.focus();
    ("value" in box ? writeControl : writeEditable)(box, text, replace, saved);
  }

  // --- toast --------------------------------------------------------------------------------------------------------

  function closeToast() {
    toastHost?.remove();
    toastHost = null;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;   // never innerHTML: this text came from the clipboard
    return node;
  }

  function buildRow(finding) {
    const row = element("li");
    row.append(element("span", `severity ${finding.severity}`, `${SEVERITY_ICON[finding.severity]} ${finding.severity}`));
    row.append(element("span", "", finding.title));
    row.append(element("code", "", finding.evidence.match_redacted));
    return row;
  }

  function showToast({ heading, findings, primaryLabel, secondaryLabel, onPrimary, onSecondary, onCancel }) {
    closeToast();
    toastHost = document.createElement("shadowscope-toast");
    const shadow = toastHost.attachShadow({ mode: "closed" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(TOAST_CSS);   // a constructed sheet is not subject to the page's style-src CSP
    shadow.adoptedStyleSheets = [sheet];

    const panel = element("div", "toast");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-label", "ShadowScope found sensitive data");
    panel.append(element("h2", "", heading));
    panel.append(element("p", "", "Scanned on this device. Nothing has been sent."));
    const list = element("ul");
    list.append(...findings.slice(0, MAX_TOAST_ROWS).map(buildRow));
    if (findings.length > MAX_TOAST_ROWS) list.append(element("li", "more", `and ${findings.length - MAX_TOAST_ROWS} more`));
    panel.append(list);

    const primary = element("button", "primary", primaryLabel);
    const secondary = element("button", "secondary", secondaryLabel);
    const finish = (action) => () => {
      closeToast();
      action();
    };
    primary.addEventListener("click", finish(onPrimary));
    secondary.addEventListener("click", finish(onSecondary));
    const actions = element("div", "actions");
    actions.append(primary, secondary);
    panel.append(actions);
    panel.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") finish(onCancel)();
    });
    shadow.append(panel);
    document.documentElement.append(toastHost);
    primary.focus();
  }

  const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

  // --- paste --------------------------------------------------------------------------------------------------------

  function block(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPaste(event) {
    if (!enabled || bypass) return;
    const box = promptBoxFrom(event);
    const text = event.clipboardData?.getData("text/plain");
    if (!box || !text) return;
    promptBox = box;
    const result = scan(text, { policy: { canary_tokens: canaryTokens } });
    if (!result.findings.length) {
      report("paste", null);
      return;
    }
    block(event);
    const redacted = result.redacted_text;
    const values = result.values;
    const findings = result.findings;
    const saved = selectionIn(box);
    report("paste", result);
    showToast({
      heading: `${plural(findings.length, "sensitive item")} in this paste`,
      findings, primaryLabel: "Redact & paste", secondaryLabel: "Paste anyway",
      onPrimary() {
        writeBox(box, redacted, { saved });
        reportDecision("redacted");
      },
      onSecondary() {
        values.forEach((value) => allowedValues.add(value));
        writeBox(box, text, { saved });
        reportDecision("allowed");
      },
      onCancel() {
        box.focus();
        reportDecision("cancelled");
      },
    });
  }

  // --- submit -------------------------------------------------------------------------------------------------------

  /** Fires our own event past the checks. Dispatch is synchronous, so the bypass cannot outlive it and swallow a real paste. */
  function withBypass(fire) {
    bypass = true;
    try {
      fire();
    } finally {
      bypass = false;
    }
  }

  function resubmit(trigger) {
    withBypass(() => {
      if (trigger.button) {
        trigger.button.click();
      } else if (trigger.form) {
        trigger.form.requestSubmit();
      } else {
        trigger.box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
      }
    });
  }

  function checkSubmit(event, box, trigger) {
    if (!enabled || bypass || !box) return;
    const text = readBox(box);
    if (!text.trim()) return;
    const result = scan(text, { policy: { canary_tokens: canaryTokens } });
    const fresh = result.findings.filter((_, i) => !allowedValues.has(result.values[i]));
    if (!fresh.length) {
      report("submit", null);
      allowedValues.clear();
      return;
    }
    block(event);
    report("submit", result);
    const redacted = result.redacted_text;
    const values = result.values;
    showToast({
      heading: `${plural(fresh.length, "sensitive item")} in this message`,
      findings: fresh, primaryLabel: "Redact & paste", secondaryLabel: "Send anyway",
      onPrimary() {
        writeBox(box, redacted, { replace: true });   // the user reads the redacted message and sends it themselves
        reportDecision("redacted");
      },
      onSecondary() {
        values.forEach((value) => allowedValues.add(value));
        reportDecision("allowed");
        resubmit(trigger);
      },
      onCancel() {
        box.focus();
        reportDecision("cancelled");
      },
    });
  }

  function onKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const box = promptBoxFrom(event);
    if (box) checkSubmit(event, box, { box });
  }

  function onClick(event) {
    const button = event.composedPath().find((node) => node instanceof Element && node.matches(SEND_SELECTOR));
    if (button) {
      discoverPromptBox();
      checkSubmit(event, promptBox, { button });
    }
  }

  function onSubmit(event) {
    const box = event.target.querySelector?.(PROMPT_SELECTOR);
    if (box) checkSubmit(event, box, { form: event.target });
  }

  // --- start --------------------------------------------------------------------------------------------------------

  document.addEventListener("paste", onPaste, true);
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("focusin", (event) => {
    promptBox = promptBoxFrom(event) || promptBox;
  }, true);
  safely(() => chrome.storage.onChanged.addListener(loadSettings));
  loadSettings();
  watchForPromptBox();
})();
