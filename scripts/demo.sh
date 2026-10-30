#!/usr/bin/env bash
# Runs the demo sequence against a running backend. Start one first with scripts/start.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$ROOT/backend/.venv/bin/python"
API="http://127.0.0.1:8787/api"
SCENARIOS=(shadow_saas_sweep env_file_leak customer_pii_dump proprietary_code rogue_agent canary_trip gateway_block exfil_spike)
GAP_S=4

if ! curl -sf "$API/health" > /dev/null 2>&1; then
  echo "The backend is not running. Start it with scripts/start.sh" >&2
  exit 1
fi

if [ -f "$ROOT/simulator/demo_sequence.py" ]; then
  cd "$ROOT"
  exec "$PY" -m simulator.demo_sequence
fi

echo "simulator/ is not available yet, so this runs the backend's canned scenarios instead."
for scenario in "${SCENARIOS[@]}"; do
  echo "  $scenario"
  curl -sf -X POST "$API/simulate" -H 'Content-Type: application/json' -d "{\"scenario_id\":\"$scenario\"}" > /dev/null
  sleep "$GAP_S"
done
echo "Done."
