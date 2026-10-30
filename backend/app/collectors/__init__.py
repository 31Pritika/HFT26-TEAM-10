"""Collector status registry. The collectors themselves arrive in Phase 2."""
from __future__ import annotations

from .. import config

_status = {name: {"enabled": False, "running": False, "reason": "Not started yet (Phase 2)"} for name in config.COLLECTOR_NAMES}


def status() -> dict[str, dict]:
    return {name: dict(state) for name, state in _status.items()}


def summary() -> list[dict]:
    return [{"name": name, "running": state["running"]} for name, state in _status.items()]
