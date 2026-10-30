"""Scenario registry, in the order of contracts/mock/scenarios.json."""
from __future__ import annotations

from . import canary_trip, customer_pii_dump, env_file_leak, proprietary_code, rogue_agent, shadow_saas_sweep
from .base import Scenario

SCENARIOS: tuple[Scenario, ...] = tuple(module.SCENARIO for module in (shadow_saas_sweep, env_file_leak, customer_pii_dump, proprietary_code, rogue_agent, canary_trip, ))
BY_ID: dict[str, Scenario] = {scenario.id: scenario for scenario in SCENARIOS}
