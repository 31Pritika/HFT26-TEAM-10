"""Scenario registry, in the order of contracts/mock/scenarios.json."""
from __future__ import annotations

from .base import Scenario

SCENARIOS: tuple[Scenario, ...] = tuple(module.SCENARIO for module in ())
BY_ID: dict[str, Scenario] = {scenario.id: scenario for scenario in SCENARIOS}
