"""ShadowScope engine entry point. Run: uvicorn app.main:app --port 8787"""
import os
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

VERSION = "0.1.0"
STARTED_AT = time.monotonic()

ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
if frontend_origin := os.getenv("SHADOWSCOPE_FRONTEND_ORIGIN"):
    ALLOWED_ORIGINS.append(frontend_origin)

app = FastAPI(title="ShadowScope Engine", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": VERSION,
        "uptime_s": round(time.monotonic() - STARTED_AT, 1),
        "collectors": {},
        "llm_engine": "rules",
    }
