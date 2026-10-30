// Real extension, real Chrome, real trusted input, on a page that believes it is chatgpt.com: the resolver maps that name to a
// local server and blocks every other host, so fake secrets cannot reach a provider. Needs Chrome and openssl.
//   node extension/tests/e2e_chrome.mjs [output-dir]         (engine expected on http://127.0.0.1:8787 unless ENGINE=none)
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXTENSION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = process.argv[2] || mkdtempSync(path.join(os.tmpdir(), "sensor-e2e-"));
const PORT = 18443;
const AWS = "AKIA" + "FAKEFAKEFAKE1234";
const OPENAI = "sk-" + "FAKEexampleFAKEexample1234567890";
const API = "http://127.0.0.1:8787/api";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  ok ? (passed += 1) : (failed += 1);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  -> ${JSON.stringify(detail).slice(0, 400)}`}`);
};

const PAGE = `<!doctype html><title>ChatGPT stand-in</title><body style="margin:0;background:#212121;color:#eee;font:15px sans-serif;height:100vh">
<div id="app" style="padding:24px"><h1>stand-in chat app</h1>
<textarea id="prompt" style="width:560px;height:120px"></textarea>
<div id="rich" contenteditable="true" role="textbox" style="margin-top:12px;width:560px;min-height:80px;border:1px solid #666"></div>
<p><button id="send" data-testid="send-button" aria-label="Send prompt">Send</button></p><pre id="sent"></pre></div>
<script>
let sent = [];
document.getElementById("send").addEventListener("click", () => {
  const box = document.getElementById("prompt"), rich = document.getElementById("rich");
  sent.push(box.value || rich.innerText); box.value = ""; rich.textContent = "";
  document.getElementById("sent").textContent = JSON.stringify(sent);
});
// A single-page app replacing its prompt box on navigation.
window.navigateSpa = () => { document.getElementById("app").innerHTML = '<textarea id="prompt2" style="width:560px;height:120px"></textarea>'; };
</script>`;

function certificate(directory) {
  const key = path.join(directory, "key.pem"), cert = path.join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=chatgpt.com"], { stdio: "ignore" });
  return { key: execFileSync("cat", [key]), cert: execFileSync("cat", [cert]) };
}

class Browser {
  constructor(profile) {
    this.id = 0; this.waiting = new Map(); this.buffer = "";
    this.process = spawn(CHROME, ["--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", `--user-data-dir=${profile}`,
      "--no-first-run", "--no-default-browser-check", "--ignore-certificate-errors", "--window-size=1100,800",
      `--host-resolver-rules=MAP chatgpt.com 127.0.0.1:${PORT},MAP * ~NOTFOUND,EXCLUDE localhost,EXCLUDE 127.0.0.1`, "about:blank"],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    this.process.stdio[4].on("data", (chunk) => {
      this.buffer += chunk.toString();
      for (let end = this.buffer.indexOf("\0"); end >= 0; end = this.buffer.indexOf("\0")) {
        const message = JSON.parse(this.buffer.slice(0, end));
        this.buffer = this.buffer.slice(end + 1);
        const pending = this.waiting.get(message.id);
        if (pending) {
          this.waiting.delete(message.id);
          message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result);
        }
      }
    });
  }
  send(method, params = {}, sessionId) {
    this.id += 1;
    this.process.stdio[3].write(`${JSON.stringify({ id: this.id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    return new Promise((resolve, reject) => this.waiting.set(this.id, { resolve, reject }));
  }
  async open(url) {
    const { targetId } = await this.send("Target.createTarget", { url });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    return new Page(this, sessionId, targetId);
  }
}

class Page {
  constructor(browser, sessionId, targetId) { this.browser = browser; this.sessionId = sessionId; this.targetId = targetId; }
  send(method, params) { return this.browser.send(method, params, this.sessionId); }
  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 300));
    return result.value;
  }
  async key(key, code, keyCode, modifiers = 0, commands) {
    const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(key === "Enter" ? { text: "\r" } : {}), ...(commands ? { commands } : {}) });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }
  /** A trusted paste: the real clipboard, then the real paste command. */
  async paste(selector, text) {
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await this.eval(`navigator.clipboard.writeText(${JSON.stringify(text)})`);
    await this.key("v", "KeyV", 86, 4, ["paste"]);
    await sleep(250);
  }
  async toast() {
    const { root } = await this.send("DOM.getDocument", { depth: -1, pierce: true });
    const found = [];
    const walk = (node) => {
      if (node.nodeName === "BUTTON" && node.attributes?.includes("class")) found.push(node);
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) walk(child);
    };
    const host = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector: "shadowscope-toast" });
    if (!host.nodeId) return null;
    walk(root);
    return found;
  }
  async clickToast(index) {
    const buttons = await this.toast();
    const { model } = await this.send("DOM.getBoxModel", { backendNodeId: buttons[index].backendNodeId });
    const [x1, y1, , , x2, y2] = model.content;
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", { type, x: (x1 + x2) / 2, y: (y1 + y2) / 2, button: type === "mouseMoved" ? "none" : "left", clickCount: 1 });
    }
    await sleep(250);
  }
  async screenshot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUTPUT, name), Buffer.from(data, "base64"));
  }
}

const stored = (worker, keys) => worker.eval(`chrome.storage.local.get(${JSON.stringify(keys)})`);

/** Stands in for the engine coming back: the popup opening must deliver everything queued while it was away. */
async function checkQueueDrains(browser, id, worker) {
  const { queue } = await stored(worker, ["queue"]);
  const received = [];
  const engine = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      if (request.url.endsWith("/extension/event")) received.push(JSON.parse(body));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(request.url.endsWith("/policies") ? '{"canary_tokens":["CANARY-E2E-1234"]}' : '{"version":"stub"}');
    });
  }).listen(8787, "127.0.0.1");
  const popup = await browser.open(`chrome-extension://${id}/src/popup.html`);
  await popup.send("Runtime.enable");
  await sleep(1500);
  engine.close();
  const after = await stored(worker, ["queue", "canaryTokens"]);
  check("queue drains when the engine returns", received.length === queue.length && !after.queue.length, [received.length, queue.length]);
  check("canary tokens are fetched from the policy", after.canaryTokens?.[0] === "CANARY-E2E-1234", after.canaryTokens);
  const body = JSON.stringify(received);
  check("queued events hold no raw value", !body.includes(AWS) && !body.includes(OPENAI));
  const keys = new Set(received.flatMap((event) => Object.keys(event)));
  check("events match ExtensionEvent plus findings", [...keys].sort().join() === "browser,findings,kind,site,text,ts,url", [...keys]);
  check("clean events carry no text", received.some((event) => event.text === "" && !event.findings.length));
  check("flagged events carry masked text and fingerprints", received.some((event) => event.text.includes("•") && /^[0-9a-f]{12}$/.test(event.findings[0]?.evidence.fingerprint)));
  check("browser is identified", received.every((event) => event.browser === "chrome"), received[0]?.browser);
  writeFileSync(path.join(OUTPUT, "received.json"), JSON.stringify(received, null, 1));
}

/** test.html has to work when opened as a plain file, with no extension involved. */
async function checkTestPage(browser) {
  const page = await browser.open(`file://${path.join(EXTENSION, "test.html")}`);
  await page.send("DOM.enable"); await page.send("Runtime.enable");
  await sleep(500);
  await page.eval(`(() => {
    const data = new DataTransfer();
    data.setData("text/plain", SAMPLES["AWS key"]);
    document.getElementById("plain").focus();
    document.getElementById("plain").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
  })()`);
  await sleep(250);
  check("test.html runs the real scanner and toast from a file", (await page.toast())?.length === 2);
  await page.clickToast(0);
  check("test.html logs the redacted message", (await page.eval(`document.getElementById("messages").textContent`)).includes("redacted"));
}

async function main() {
  mkdirSync(OUTPUT, { recursive: true });
  const scratch = mkdtempSync(path.join(os.tmpdir(), "sensor-profile-"));
  const server = https.createServer(certificate(scratch), (_, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(PAGE);
  }).listen(PORT, "127.0.0.1");
  const browser = new Browser(path.join(scratch, "profile"));
  let lastPage = null;
  try {
    await sleep(1500);
    const { id } = await browser.send("Extensions.loadUnpacked", { path: EXTENSION });
    check("Chrome loads the unpacked extension", Boolean(id), id);
    await browser.send("Browser.grantPermissions", { origin: "https://chatgpt.com", permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });

    const page = await browser.open("https://chatgpt.com/c/demo?secret=1#frag");
    await page.send("Page.enable"); await page.send("DOM.enable"); await page.send("Runtime.enable");
    lastPage = page;
    await sleep(1000);
    const injected = await page.eval(`document.title`);
    check("page is the local stand-in, not the real site", injected === "ChatGPT stand-in", injected);

    await page.paste("#prompt", "Please summarise these meeting notes.");
    check("clean paste goes straight in", (await page.eval(`document.getElementById("prompt").value`)) === "Please summarise these meeting notes.");
    check("clean paste shows no toast", (await page.toast()) === null);
    await page.eval(`document.getElementById("prompt").value = ""`);

    await page.paste("#prompt", `my key is ${AWS} and ${OPENAI}`);
    check("trusted paste with secrets is held back", (await page.eval(`document.getElementById("prompt").value`)) === "");
    const buttons = await page.toast();
    check("toast shows two buttons in a closed shadow root", buttons?.length === 2, buttons?.length);
    await page.screenshot("toast.png");
    check("toast is not reachable from page script", (await page.eval(`document.querySelector("shadowscope-toast").shadowRoot`)) === null);

    await page.clickToast(0);
    const redacted = await page.eval(`document.getElementById("prompt").value`);
    check("[Redact & paste] inserts masked text", redacted.includes("AKIA") && redacted.includes("•") && !redacted.includes(AWS), redacted);
    await page.eval(`document.getElementById("prompt").value = ""`);

    await page.paste("#prompt", `again ${AWS}`);
    await page.clickToast(1);
    check("[Paste anyway] inserts the original", (await page.eval(`document.getElementById("prompt").value`)) === `again ${AWS}`);
    await page.eval(`document.getElementById("send").click()`);
    await sleep(200);
    check("a value already allowed is not asked about twice", (await page.eval(`document.getElementById("sent").textContent`)).includes(AWS));

    await page.paste("#rich", `rich ${AWS}`);
    check("contenteditable paste is held back", (await page.eval(`document.getElementById("rich").innerText`)).trim() === "");
    await page.clickToast(0);
    const rich = await page.eval(`document.getElementById("rich").innerText`);
    check("[Redact & paste] works in contenteditable", rich.includes("•") && !rich.includes(AWS), rich);
    await page.eval(`document.getElementById("rich").textContent = ""`);

    await page.eval(`(() => { const b = document.getElementById("prompt"); b.focus(); b.value = "typed ${AWS}"; })()`);
    await page.key("Enter", "Enter", 13);
    await sleep(250);
    check("Enter with a typed secret is stopped", (await page.toast())?.length === 2);
    await page.key("Escape", "Escape", 27);
    await sleep(150);
    check("Escape closes the toast and keeps the text", (await page.toast()) === null && (await page.eval(`document.getElementById("prompt").value`)).includes(AWS));

    await page.eval(`document.getElementById("send").click()`);
    await sleep(250);
    check("Send click with a secret is stopped", (await page.toast())?.length === 2 && !(await page.eval(`document.getElementById("sent").textContent`)).includes("typed"));
    await page.clickToast(1);
    check("[Send anyway] really sends", (await page.eval(`document.getElementById("sent").textContent`)).includes("typed"));

    await page.eval(`document.getElementById("prompt").value = ""`);
    await page.paste("#prompt", `next ${AWS}`);
    check("a paste right after [Send anyway] is still scanned", (await page.toast())?.length === 2 && (await page.eval(`document.getElementById("prompt").value`)) === "");
    await page.key("Escape", "Escape", 27);
    await sleep(150);

    await page.eval(`navigateSpa()`);
    await sleep(600);
    await page.paste("#prompt2", `spa ${AWS}`);
    const spaToast = await page.toast();
    check("still works after the SPA replaces the prompt box", spaToast?.length === 2, await page.eval(
      `({ active: document.activeElement?.id, value: document.getElementById("prompt2")?.value, focus: document.hasFocus() })`));
    await page.key("Escape", "Escape", 27);

    const targets = (await browser.send("Target.getTargets")).targetInfos;
    const workerInfo = targets.find((t) => t.type === "service_worker" && t.url.includes(id));
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId: workerInfo.targetId, flatten: true });
    const worker = new Page(browser, sessionId, workerInfo.targetId);
    await sleep(600);
    const { counts, queue = [] } = await stored(worker, ["counts", "queue"]);
    const day = Object.values(counts)[0]["chatgpt.com"];
    check("worker counted per site", day.events === 9 && day.findings === 8 && day.redacted === 2 && day.allowed === 2 && day.cancelled === 3, day);
    console.log(`     counters ${JSON.stringify(day)}  queued ${queue.length}`);

    const popup = await browser.open(`chrome-extension://${id}/src/popup.html`);
    await popup.send("Page.enable"); await popup.send("Runtime.enable");
    await sleep(1200);
    const engine = await popup.eval(`document.getElementById("engine").textContent`);
    const sites = await popup.eval(`document.getElementById("sites").innerText`);
    check("popup lists today's site", sites.includes("chatgpt.com"), sites);
    console.log(`     engine: ${engine}`);
    await popup.screenshot("popup.png");

    if (process.env.ENGINE !== "none") {
      const events = (await (await fetch(`${API}/events?limit=200&source=extension`)).json()).items;
      check("engine stored extension events", events.length >= 8, events.length);
      check("urls lose their query string", events.every((e) => !e.dest.path?.includes("secret")), events.map((e) => e.dest.path));
      const findings = (await (await fetch(`${API}/findings?limit=200`)).json()).items;
      const dump = JSON.stringify(events) + JSON.stringify(findings);
      check("no raw value reached the engine", !dump.includes(AWS) && !dump.includes(OPENAI));
      const ours = findings.filter((f) => events.some((e) => e.id === f.event_id));
      console.log(`     ${events.length} events, ${ours.length} linked findings: ${[...new Set(ours.map((f) => f.subtype))]}`);
      if (process.env.EXPECT_FINDINGS) check("extension findings reached the dashboard", ours.some((f) => f.subtype === "aws_access_key"), ours.map((f) => f.subtype));
    }
    if (process.env.ENGINE === "none") await checkQueueDrains(browser, id, worker);
    await checkTestPage(browser);
    await popup.eval(`document.getElementById("enabled").click()`);
    await sleep(200);
    await page.eval(`document.getElementById("prompt2").focus()`);
    await page.paste("#prompt2", `off ${AWS}`);
    check("toggle off stops scanning", (await page.toast()) === null && (await page.eval(`document.getElementById("prompt2").value`)).includes(AWS));
  } finally {
    await lastPage?.eval(`navigator.clipboard.writeText("")`).catch(() => {});   // the test uses the real system clipboard
    browser.process.kill();
    server.close();
    await sleep(300);
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed (screenshots in ${OUTPUT})`);
  process.exitCode = failed ? 1 : 0;
}

if (!existsSync(CHROME)) {
  console.log(`Chrome not found at ${CHROME}. Set CHROME to its path.`);
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
