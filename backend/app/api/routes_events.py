from __future__ import annotations

from fastapi import APIRouter, Query

from .. import db
from ..models import AIEventDetail, EventPage
from ..utils import normalize_ts
from .errors import not_found

router = APIRouter()


@router.get("/events", response_model=EventPage)
def list_events(limit: int = Query(100, ge=1, le=500), cursor: str | None = None, provider: str | None = None,
                process: str | None = None, source: str | None = None, min_risk: int | None = Query(None, ge=0, le=100),
                since: str | None = None) -> dict:
    items, next_cursor = db.list_events(limit, cursor, provider, process, source, min_risk, normalize_ts(since) if since else None)
    return {"items": items, "next_cursor": next_cursor}


@router.get("/events/{event_id}", response_model=AIEventDetail)
def get_event(event_id: str) -> dict:
    event = db.get_event(event_id)
    if event is None:
        raise not_found("Event", event_id)
    return {**event, "findings": db.findings_for_event(event_id)}
