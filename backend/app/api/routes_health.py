"""Health and dev-only maintenance endpoints."""
from __future__ import annotations

import os
import time

from fastapi import APIRouter

from .. import collectors, config
from ..engine import detect_adapter

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
