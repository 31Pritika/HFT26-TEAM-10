#!/usr/bin/env bash
# Checks live packet capture, which needs root on macOS. Run from anywhere: sudo scripts/verify_capture.sh
# Sends one fake secret to the local Ollama server only, then writes the results to backend/data/verify_capture.txt.
set -u
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo $0"
  exit 1
fi
cd "$(dirname "$0")/../backend" || exit 1
OUT=data/verify_capture.txt
LOG=data/verify_capture_server.log
MODEL="${1:-gemma3:4b}"
mkdir -p data
: > "$OUT"

.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787 > "$LOG" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null; wait "$SERVER" 2>/dev/null; [ -n "${SUDO_UID:-}" ] && chown "$SUDO_UID:${SUDO_GID:-}" "$OUT" "$LOG"' EXIT

for _ in $(seq 1 50); do
  curl -sf localhost:8787/api/health > /dev/null && break
  sleep 0.2
done
sleep 3
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PROMPT='My email is fake.person@example.com and my key is AKIAFAKEFAKEFAKE1234. Reply with OK.'
BODY=$(printf '{"model":"%s","prompt":"%s","stream":false,"options":{"num_predict":8}}' "$MODEL" "$PROMPT")
OLLAMA=$(curl -s -o /dev/null -w '%{http_code}' -m 120 localhost:11434/api/generate -d "$BODY")
STREAMED=$(curl -s -o /dev/null -w '%{http_code}' -m 120 localhost:11434/api/generate \
  -d "$(printf '{"model":"%s","prompt":"Second request, contact fake.second@example.com","options":{"num_predict":8}}' "$MODEL")")
curl -s -o /dev/null -m 5 https://api.openai.com/ 
sleep 4

.venv/bin/python - "$OLLAMA" "$STREAMED" "$STARTED" >> "$OUT" <<'PY'
import json, sys, urllib.request

def get(path):
    return json.load(urllib.request.urlopen(f"http://localhost:8787/api{path}", timeout=10))

since = sys.argv[3]  # Seeded history also uses these sources, so only this run counts.
health = get("/health")
print("ollama_http", sys.argv[1], "streamed_http", sys.argv[2], "detector", health["detector"]["active"])
for name, state in health["collectors"].items():
    print(f"collector {name}: running={state['running']} reason={state['reason']}")
for source in ("loopback", "dns_sni", "live_conn"):
    items = get(f"/events?source={source}&limit=200&since={since}")["items"]
    print(f"events {source}: {len(items)}")
    for event in items[:3]:
        print(" ", event["provider"]["id"] if event["provider"] else None, event["process"]["name"], event["dest"]["host"],
              "visible", event["payload_visible"], "model", event["model"], "findings", len(event["finding_ids"]))
        if source == "loopback":
            print("   preview:", (event["payload_preview"] or "")[:160])
items = get(f"/events?source=loopback&limit=200&since={since}")["items"]
ids = [fid for event in items for fid in event["finding_ids"]]
print("loopback findings:", sorted({get(f"/findings/{fid}")["subtype"] for fid in ids}))
raw = json.dumps(items)
print("raw key stored:", "AKIAFAKEFAKEFAKE1234" in raw, "| raw email stored:", "fake.person@example.com" in raw)
PY
ls -l data >> "$OUT"
echo "Done. Results are in backend/$OUT"
