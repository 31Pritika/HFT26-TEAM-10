"""Health and dev-only maintenance endpoints."""
from __future__ import annotations

import os
import time

import httpx
from fastapi import APIRouter, Depends

from .. import collectors, config, db, seed
from ..engine import detect_adapter
from .errors import require_loopback

router = APIRouter()
STARTED_AT = time.monotonic()
OLLAMA_CHECK_S = 30.0
OLLAMA_TIMEOUT_S = 0.3
DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2:3b"
_ollama_checked: tuple[float, bool] | None = None


def _ollama_has_model() -> bool:
    """Whether triage could use Ollama. Cached because /health is polled, and marked so `loopback` ignores it."""
    global _ollama_checked
    now = time.monotonic()
    if _ollama_checked and now - _ollama_checked[0] < OLLAMA_CHECK_S:
        return _ollama_checked[1]
    base = (os.getenv("OLLAMA_URL") or DEFAULT_OLLAMA_URL).rstrip("/")
    wanted = os.getenv("OLLAMA_MODEL") or DEFAULT_OLLAMA_MODEL
    try:
        models = httpx.get(f"{base}/api/tags", headers={"X-ShadowScope-Self": "1"}, timeout=OLLAMA_TIMEOUT_S, trust_env=False).json()["models"]
        ready = any(model.get("name") == wanted for model in models)
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        ready = False
    _ollama_checked = (now, ready)
    return ready


def _llm_engine() -> str:
    configured = db.get_policy()["llm_triage"]
    if not configured["enabled"]:
        return "rules"
    if configured["engine"] != "auto":
        return configured["engine"]
    if os.getenv("FEATHERLESS_API_KEY") and os.getenv("FEATHERLESS_MODEL"):
        return "featherless"
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    return "ollama" if _ollama_has_model() else "rules"


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
