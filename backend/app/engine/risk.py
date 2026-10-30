"""Risk scoring, master spec §9."""
from __future__ import annotations

import math
from datetime import datetime

from .. import config
from ..utils import clamp, now, parse_ts

SEVERITY_WEIGHT = {"critical": 60, "high": 40, "medium": 20, "low": 8, "info": 2}
PROVIDER_BASE = {"cloud_llm": 25, "ai_saas": 25, "ai_coding": 20, "unknown": 15, "local_llm": 5}
AGENT_BONUS = 10
LEAK_TYPES = {"secret", "pii", "source_code", "canary"}
SHADOW_TYPES = {"shadow_ai", "policy"}
# Decayed weight at which a component reaches ~63 of 100. Larger means more findings are needed to saturate it.
SATURATION = {"leak": 240.0, "shadow": 120.0, "agent": 160.0, "volume": 60.0}
GRADE_LIMITS = ((20, "A"), (40, "B"), (60, "C"), (80, "D"), (100, "F"))


def provider_base(category: str | None, sanctioned: bool) -> int:
    return 0 if sanctioned else PROVIDER_BASE.get(category or "unknown", PROVIDER_BASE["unknown"])


def event_score(category: str | None, sanctioned: bool, severities: list[str], has_agent_action: bool = False) -> int:
    score = provider_base(category, sanctioned)
    if severities:
        score += max(SEVERITY_WEIGHT[severity] for severity in severities) + 5 * (len(severities) - 1)
    return clamp(score + (AGENT_BONUS if has_agent_action else 0))


def decay(ts: str, moment: datetime | None = None) -> float:
    age_hours = max(((moment or now()) - parse_ts(ts)).total_seconds() / 3600, 0)
    return 0.5 ** (age_hours / config.RISK_HALF_LIFE_H)


def grade(score: int) -> str:
    return next(letter for limit, letter in GRADE_LIMITS if score <= limit)


def _component(findings: list[dict], types: set[str], saturation: float, moment: datetime) -> int:
    total = sum(SEVERITY_WEIGHT[f["severity"]] * decay(f["ts"], moment) for f in findings if f["type"] in types)
    return clamp(100 * (1 - math.exp(-total / saturation)))


def org_score(open_findings: list[dict], moment: datetime | None = None) -> dict:
    """Org risk at `moment`, higher is worse. Only open findings count, weighted by age."""
    moment = moment or now()
    live = [f for f in open_findings if parse_ts(f["ts"]) <= moment]
    leak = _component(live, LEAK_TYPES, SATURATION["leak"], moment)
    shadow = _component(live, SHADOW_TYPES, SATURATION["shadow"], moment)
    agent = _component(live, {"agent_action"}, SATURATION["agent"], moment)
    volume = _component(live, {"exfil_volume"}, SATURATION["volume"], moment)
    score = clamp(0.40 * leak + 0.25 * shadow + 0.25 * agent + 0.10 * volume)
    return {"score": score, "grade": grade(score), "leak": leak, "shadow": shadow, "agent": agent, "volume": volume}
