"""WebSocket stream. Keep-alive pings come from uvicorn (--ws-ping-interval, 20 s by default)."""
from __future__ import annotations

import asyncio
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import collectors, config
from ..bus import bus
from ..engine import stats

router = APIRouter()
POLICY_VIOLATION = 1008


def _origin_allowed(origin: str | None) -> bool:
    # Browsers do not apply CORS to WebSockets, so a page on any site could otherwise read this stream.
    return origin is None or origin in config.ALLOWED_ORIGINS or bool(re.fullmatch(config.ALLOWED_ORIGIN_REGEX, origin))


@router.websocket("/ws/stream")
async def stream(socket: WebSocket) -> None:
    if not _origin_allowed(socket.headers.get("origin")):
        await socket.close(code=POLICY_VIOLATION)
        return
    await socket.accept()
    queue = bus.subscribe()

    async def send() -> None:
        await socket.send_json({"type": "stats", "data": await asyncio.to_thread(stats.stream_stats)})
        for name, state in collectors.status().items():
            await socket.send_json({"type": "collector", "data": {"name": name, **state}})
        while True:
            await socket.send_json(await queue.get())

    async def wait_for_close() -> None:
        while True:
            await socket.receive_text()

    tasks = [asyncio.create_task(send()), asyncio.create_task(wait_for_close())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        bus.unsubscribe(queue)
    for result in results:
        if isinstance(result, Exception) and not isinstance(result, (WebSocketDisconnect, RuntimeError)):
            raise result
