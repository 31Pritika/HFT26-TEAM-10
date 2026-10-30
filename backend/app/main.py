"""ShadowScope engine entry point. Run: uvicorn app.main:app --port 8787"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import collectors, config, db, seed
from .api.middleware import BodyLimitMiddleware, RateLimitMiddleware
from .api import (errors, routes_events, routes_findings, routes_health, routes_ingest, routes_inventory, routes_overview, routes_policies,
                  routes_report, routes_scan, routes_scenarios, ws)
from .bus import bus
from .engine import stats
from .utils import now_iso

log = logging.getLogger("shadowscope")


async def _publish_stats() -> None:
    while True:
        await asyncio.sleep(config.STATS_INTERVAL_S)
        if bus.has_subscribers:
            bus.publish({"type": "stats", "data": await asyncio.to_thread(stats.stream_stats)})


async def _record_risk() -> None:
    while True:
        await asyncio.to_thread(lambda: db.record_risk(now_iso(), stats.org_risk()["score"]))
        await asyncio.sleep(config.RISK_RECORD_INTERVAL_S)


async def _prune_events() -> None:
    while True:
        await asyncio.sleep(config.PRUNE_INTERVAL_S)
        await asyncio.to_thread(db.prune)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    db.init()
    bus.bind(asyncio.get_running_loop())
    if config.SEED_ON_STARTUP:
        await asyncio.to_thread(seed.seed_if_empty)
    if config.COLLECTORS_ENABLED:
        await asyncio.to_thread(collectors.start_all)
    elif config.CLOUD:
        collectors.disable_all("Disabled in cloud mode: no local traffic to observe")
    tasks = [asyncio.create_task(job()) for job in (_publish_stats, _record_risk, _prune_events)]
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await asyncio.to_thread(collectors.stop_all)
    db.close()


app = FastAPI(title="ShadowScope Engine", version=config.VERSION, lifespan=lifespan)
app.add_middleware(BodyLimitMiddleware)
if config.CLOUD:
    app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_origin_regex=config.ALLOWED_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)
errors.register(app)

api = APIRouter(prefix="/api")
for module in (routes_health, routes_overview, routes_events, routes_findings, routes_inventory, routes_policies,
               routes_scan, routes_scenarios, routes_report, routes_ingest, ws):
    api.include_router(module.router)
app.include_router(api)
