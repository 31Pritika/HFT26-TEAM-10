#!/usr/bin/env bash
# Starts ShadowScope: backend on :8787, the mock provider if present, and the web app on :5173.
#
#   scripts/start.sh                  this machine only, without sudo (some collectors stay off)
#   scripts/start.sh --sudo           all collectors (asks for your password once)
#   scripts/start.sh --host           reachable from other laptops on this network
#   scripts/start.sh --host 10.0.0.5  bind one address
#   scripts/start.sh --no-web         backend only
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
VENV="$BACKEND/.venv"
PORT=8787
LOGS="$BACKEND/data"

USE_SUDO=0
HOST=127.0.0.1
RUN_WEB=1
while [ $# -gt 0 ]; do
  case "$1" in
    --sudo) USE_SUDO=1; shift ;;
    --host)
      HOST=0.0.0.0; shift
      if [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; then HOST="$1"; shift; fi ;;
    --no-web) RUN_WEB=0; shift ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

find_python() {
  local candidate
  for candidate in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidate" > /dev/null 2>&1 &&
       "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2> /dev/null; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

port_busy() {
  "$1" - "$2" <<'PY'
import socket, sys
with socket.socket() as probe:
    probe.settimeout(0.5)
    sys.exit(0 if probe.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0 else 1)
PY
}

lan_address() {
  ipconfig getifaddr en0 2> /dev/null || ipconfig getifaddr en1 2> /dev/null || hostname -I 2> /dev/null | awk '{print $1}' || true
}

if ! PYTHON="$(find_python)"; then
  echo "ShadowScope needs Python 3.11 or newer." >&2
  echo "On macOS: brew install python@3.12" >&2
  exit 1
fi
if [ "$RUN_WEB" = 1 ] && ! command -v npm > /dev/null 2>&1; then
  echo "npm was not found. Install Node.js, or use --no-web for the backend only." >&2
  exit 1
fi
if port_busy "$PYTHON" "$PORT"; then
  echo "Port $PORT is already in use. Stop whatever is using it, then try again." >&2
  exit 1
fi

mkdir -p "$LOGS"
[ -x "$VENV/bin/python" ] || { echo "Creating the Python environment with $PYTHON..."; "$PYTHON" -m venv "$VENV"; }
PY="$VENV/bin/python"
STAMP="$VENV/.installed"
WANTED="$(cat "$BACKEND/requirements.txt" "$ROOT/detector/pyproject.toml" | cksum)"
if [ "$(cat "$STAMP" 2> /dev/null || true)" != "$WANTED" ]; then
  echo "Installing backend dependencies..."
  "$PY" -m pip install --quiet --disable-pip-version-check -r "$BACKEND/requirements.txt"
  "$PY" -m pip install --quiet --disable-pip-version-check -e "$ROOT/detector"
  echo "$WANTED" > "$STAMP"
fi

BACKEND_PID=""
MOCK_PID=""
WEB_PID=""
cleanup() {
  trap - EXIT INT TERM
  echo
  echo "Stopping ShadowScope..."
  [ -n "$WEB_PID" ] && { pkill -TERM -P "$WEB_PID" 2> /dev/null || true; kill "$WEB_PID" 2> /dev/null || true; }
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2> /dev/null || true
  if [ -n "$BACKEND_PID" ]; then
    if [ "$USE_SUDO" = 1 ]; then sudo kill "$BACKEND_PID" 2> /dev/null || true; else kill "$BACKEND_PID" 2> /dev/null || true; fi
  fi
  wait 2> /dev/null || true
}
trap cleanup EXIT INT TERM

LAN=""
ORIGINS="${SHADOWSCOPE_CORS_ORIGINS:-}"
if [ "$HOST" != 127.0.0.1 ]; then
  LAN="$(lan_address)"
  [ "$HOST" != 0.0.0.0 ] && LAN="$HOST"
  [ -n "$LAN" ] && ORIGINS="${ORIGINS:+$ORIGINS,}http://$LAN:5173"
  echo "Warning: the API has no login. Anyone on this network can read it. Use only on a network you trust."
fi

cd "$BACKEND"
SERVER=("$PY" -m uvicorn app.main:app --host "$HOST" --port "$PORT")
if [ "$USE_SUDO" = 1 ]; then
  echo "Asking for your password so the backend can capture packets..."
  sudo -v
  sudo env "SHADOWSCOPE_CORS_ORIGINS=$ORIGINS" "${SERVER[@]}" > "$LOGS/backend.log" 2>&1 &
else
  SHADOWSCOPE_CORS_ORIGINS="$ORIGINS" "${SERVER[@]}" > "$LOGS/backend.log" 2>&1 &
fi
BACKEND_PID=$!

echo "Starting the backend (the first run seeds demo data)..."
for _ in $(seq 1 150); do
  curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1 && break
  if ! kill -0 "$BACKEND_PID" 2> /dev/null; then
    echo "The backend stopped during startup. Last lines of backend/data/backend.log:" >&2
    tail -n 15 "$LOGS/backend.log" >&2
    exit 1
  fi
  sleep 0.2
done
if ! curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
  echo "The backend did not answer in time. See backend/data/backend.log" >&2
  exit 1
fi

if [ -f "$ROOT/simulator/mock_provider.py" ]; then
  (cd "$ROOT" && exec "$PY" -m simulator.mock_provider) > "$LOGS/mock_provider.log" 2>&1 &
  MOCK_PID=$!
fi

if [ "$RUN_WEB" = 1 ]; then
  cd "$ROOT/web"
  [ -d node_modules ] || { echo "Installing web dependencies..."; npm install --silent; }
  npm run dev > "$LOGS/web.log" 2>&1 &
  WEB_PID=$!
fi

echo
echo "ShadowScope is running. Press Ctrl+C to stop."
[ "$RUN_WEB" = 1 ] && echo "  Dashboard:  http://localhost:5173/app"
echo "  API:        http://localhost:$PORT/api/health"
echo "  Gateway:    http://localhost:8789/{provider}/...  (this machine only)"
if [ -n "$LAN" ]; then
  echo
  echo "  From another laptop:"
  [ "$RUN_WEB" = 1 ] && echo "    Open  http://$LAN:5173/app"
  echo "    Or run its own web app with:  VITE_API_BASE=http://$LAN:$PORT/api npm run dev"
  echo "    (PowerShell:  \$env:VITE_API_BASE=\"http://$LAN:$PORT/api\"; npm run dev)"
fi
[ "$USE_SUDO" = 0 ] && echo "  dns_sni and loopback need packet capture: restart with --sudo to turn them on."
echo "  Logs:       backend/data/*.log"

wait "$BACKEND_PID"
