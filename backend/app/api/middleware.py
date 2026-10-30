"""Request limits. These run before routing, so nothing large is read into memory first."""
from __future__ import annotations

import json
import time

from fastapi import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .. import config
from .errors import CODES

RATE_WINDOW_S = 60.0
MAX_TRACKED_CLIENTS = 10_000


async def _reject(send: Send, status: int, message: str) -> None:
    body = json.dumps({"error": {"code": CODES[status], "message": message}}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        upload = scope["path"].endswith("/ingest")
        # Multipart wrapping adds a little, and the route gives the exact message for files over the limit.
        limit = config.MAX_UPLOAD_BYTES + 1024 * 1024 if upload else config.MAX_JSON_BYTES
        message = f"Request body is limited to {limit // (1024 * 1024)} MB"
        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > limit:
            await _reject(send, 413, message)
            return
        received = 0

        async def counted() -> Message:  # Content-Length can be missing or wrong, so the bytes themselves are counted.
            nonlocal received
            event = await receive()
            received += len(event.get("body", b""))
            if received > limit:
                raise HTTPException(413, message)
            return event

        await self.app(scope, counted, send)


class RateLimitMiddleware:
    """A fixed window per client. Enough to keep a free public instance usable, not a security boundary."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.windows: dict[str, tuple[float, int]] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].endswith("/health") or scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return
        client = scope["client"][0] if scope.get("client") else "unknown"
        now = time.monotonic()
        if len(self.windows) > MAX_TRACKED_CLIENTS:
            self.windows = {key: value for key, value in self.windows.items() if now - value[0] < RATE_WINDOW_S}
        started, count = self.windows.get(client, (now, 0))
        if now - started >= RATE_WINDOW_S:
            started, count = now, 0
        self.windows[client] = (started, count + 1)
        if count >= config.RATE_LIMIT_PER_MINUTE:
            await _reject(send, 429, "Too many requests. Try again in a minute.")
            return
        await self.app(scope, receive, send)
