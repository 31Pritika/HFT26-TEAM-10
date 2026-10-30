const DASHBOARD_URL = "http://localhost:5173/app";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderCounts(counts) {
  const sites = Object.entries(counts[today()] || {});
  document.getElementById("empty").hidden = sites.length > 0;
  document.getElementById("sites").replaceChildren(...sites.map(([site, entry]) => {
    const row = document.createElement("tr");
    for (const value of [site, entry.events, entry.findings, entry.redacted]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
}

function renderEnabled(enabled) {
  document.getElementById("enabled").checked = enabled;
  document.getElementById("state").textContent = enabled ? "On" : "Off";
}

function renderEngine({ online, queued }) {
  const engine = document.getElementById("engine");
  engine.dataset.online = String(online);
  const waiting = queued ? `, ${queued} queued` : "";
  engine.textContent = `${online ? "● Online" : "○ Offline"}${waiting}`;
}

chrome.storage.local.get(["enabled", "counts"], ({ enabled, counts = {} }) => {
  renderEnabled(enabled !== false);
  renderCounts(counts);
});
chrome.runtime.sendMessage({ type: "status" }, (status) => {
  if (status) renderEngine(status);
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.counts) renderCounts(changes.counts.newValue || {});
});
document.getElementById("enabled").addEventListener("change", (event) => {
  chrome.storage.local.set({ enabled: event.target.checked });
  renderEnabled(event.target.checked);
});
document.getElementById("dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});
