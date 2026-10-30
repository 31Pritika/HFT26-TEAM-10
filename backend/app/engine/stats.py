"""Aggregates shared by the overview, the report and the WebSocket stats message."""
from __future__ import annotations

from datetime import datetime

from .. import db
from ..utils import now, to_iso, window_start
from . import risk


def totals(since: str) -> dict:
    events = db.event_stats(since)
    return {
        "events": events["events"], "ai_requests": events["ai_requests"], **db.finding_totals(since),
        "shadow_tools": sum(not item["sanctioned"] for item in db.list_inventory()), "bytes_out": events["bytes_out"],
    }


def org_risk(moment: datetime | None = None) -> dict:
    return risk.org_score(db.open_findings(), moment)


def stream_stats() -> dict:
    """Master §5 `stats` message: a subset of Overview for the default 24 h window."""
    org = org_risk()
    return {"risk_score": org["score"], "risk_grade": org["grade"], "totals": totals(to_iso(window_start("24h", now())))}
