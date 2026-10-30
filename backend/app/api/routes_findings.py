from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import ValidationError

from .. import config, db
from ..bus import bus
from ..collectors import activity
from ..engine import detect_adapter
from ..models import Finding, FindingDetail, FindingPage, FindingPatch, FindingStatus, FindingType, Severity, TriageRequest, TriageResult
from .errors import ApiError, not_found

router = APIRouter()
TRIAGE_HOSTS = ("api.featherless.ai", "api.groq.com")


def _require(finding_id: str) -> dict:
    finding = db.get_finding(finding_id)
    if finding is None:
        raise not_found("Finding", finding_id)
    return finding


@router.get("/findings", response_model=FindingPage)
def list_findings(severity: Severity | None = None, type: FindingType | None = None, status: FindingStatus | None = None,
                  limit: int = Query(100, ge=1, le=500), cursor: str | None = None, q: str | None = None) -> dict:
    items, next_cursor = db.list_findings(limit, cursor, severity, type, status, q)
    return {"items": items, "next_cursor": next_cursor}


@router.get("/findings/{finding_id}", response_model=FindingDetail)
def get_finding(finding_id: str) -> dict:
    finding = _require(finding_id)
    return {**finding, "event": db.get_event(finding["event_id"]) if finding["event_id"] else None}


@router.patch("/findings/{finding_id}", response_model=Finding)
def update_finding(finding_id: str, body: FindingPatch) -> dict:
    finding = {**_require(finding_id), "status": body.status}
    db.update_finding(finding)
    bus.publish({"type": "finding", "data": finding})
    return finding


@router.post("/findings/{finding_id}/triage", response_model=TriageResult)
async def triage_finding(finding_id: str, body: TriageRequest | None = None) -> dict:
    finding = _require(finding_id)
    requested = body.engine if body else None
    cached = finding["triage"]
    if cached and requested in (None, "auto", cached["engine"]):
        return cached

    settings = db.get_policy()["llm_triage"]
    engine = requested or settings["engine"] if settings["enabled"] else "rules"
    event = db.get_event(finding["event_id"]) if finding["event_id"] else None
    context = "\n".join(part for part in (finding["evidence"]["redacted_snippet"], (event or {}).get("payload_preview")) if part)
    activity.expect_own_traffic(TRIAGE_HOSTS, config.TRIAGE_TIMEOUT_S + 5)
    result = await detect_adapter.triage(finding, context, engine_cfg={"engine": engine, "model": settings["model"]})
    try:
        triage = TriageResult.model_validate(result).model_dump()
    except ValidationError as error:
        raise ApiError(502, "The triage engine returned an invalid result") from error
    db.update_finding({**finding, "triage": triage})
    return triage
