from __future__ import annotations

import json
import logging
import subprocess
import sys
import time

from fastapi import APIRouter

from .. import config
from ..models import ScenarioList, SimulateRequest
from .errors import not_found

router = APIRouter()
log = logging.getLogger("shadowscope.scenarios")
_cache: tuple[float, list[dict]] | None = None


def simulator_available() -> bool:
    return (config.SIMULATOR_DIR / "run.py").is_file()


def _from_simulator() -> list[dict] | None:
    if not simulator_available():
        return None
    try:
        output = subprocess.run([sys.executable, "-m", "simulator.run", "--list", "--json"], cwd=config.REPO_ROOT,
                                capture_output=True, text=True, timeout=10, check=True).stdout
        return json.loads(output)
    except (subprocess.SubprocessError, ValueError) as error:
        log.warning("simulator scenario list failed: %s", error)
        return None


def load_scenarios() -> list[dict]:
    """The simulator's registry, cached 60 s, or the contract mock until the simulator exists."""
    global _cache
    if _cache and time.monotonic() - _cache[0] < config.SCENARIO_CACHE_S:
        return _cache[1]
    scenarios = _from_simulator()
    if scenarios is None:
        scenarios = json.loads((config.CONTRACTS_MOCK_DIR / "scenarios.json").read_text(encoding="utf-8"))["items"]
    _cache = (time.monotonic(), scenarios)
    return scenarios


@router.get("/scenarios", response_model=ScenarioList)
def scenarios() -> dict:
    return {"items": load_scenarios()}


@router.post("/simulate")
def simulate(body: SimulateRequest) -> dict:
    from .. import simulate as simulator  # Imported here because simulate.py uses this module.

    if body.scenario_id not in {scenario["id"] for scenario in load_scenarios()}:
        raise not_found("Scenario", body.scenario_id)
    return {"run_id": simulator.start(body.scenario_id, body.intensity), "started": True}
