"""Health and dev-only maintenance endpoints."""
from __future__ import annotations

import os
import time

from fastapi import APIRouter, Depends

from .. import collectors, config, db, seed
from ..engine import detect_adapter
from .errors import require_loopback

router = APIRouter()
STARTED_AT = time.monotonic()


def _llm_engine() -> str:
    if os.getenv("FEATHERLESS_API_KEY"):
        return "featherless"
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    return "rules"


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok", "version": config.VERSION, "uptime_s": round(time.monotonic() - STARTED_AT, 1),
        "collectors": collectors.status(), "llm_engine": _llm_engine(), "detector": detect_adapter.status(),
    }


@router.post("/admin/reset", dependencies=[Depends(require_loopback)])
def reset() -> dict:
    """Dev only: clears everything and re-seeds."""
    db.reset()
    return seed.run()
