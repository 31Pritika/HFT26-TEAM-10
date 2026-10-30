"""Everything that feeds text or observations into the pipeline directly."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from .. import pipeline
from ..models import ExtensionEvent, Observation, ScanRequest, ScanResult
from .errors import ApiError, require_loopback

router = APIRouter()
MAX_SCAN_CHARS = 2_000_000


@router.post("/scan", response_model=ScanResult)
def scan(body: ScanRequest) -> dict:
    if len(body.text) > MAX_SCAN_CHARS:
        raise ApiError(413, f"Text is limited to {MAX_SCAN_CHARS} characters")
    context = body.context.model_dump(exclude_none=True) if body.context else {}
    return pipeline.scan_text(body.text, body.source or "api", context)


@router.post("/observations", dependencies=[Depends(require_loopback)])
def observations(body: Observation | list[Observation] = Body(...)) -> dict:
    results = [pipeline.process(item) for item in (body if isinstance(body, list) else [body])]
    return {"accepted": sum(result is not None for result in results), "event_ids": [r.event["id"] for r in results if r]}


@router.post("/extension/event")
def extension_event(body: ExtensionEvent) -> dict:
    result = pipeline.record_extension_event(body.site, body.url, body.text, body.ts, body.browser, body.kind)
    return {"event_id": result.event["id"], "findings": result.findings}
