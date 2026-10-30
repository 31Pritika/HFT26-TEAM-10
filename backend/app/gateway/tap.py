"""Opt-in local AI gateway: app → http://localhost:8789/{provider_id}/... (plain) → provider (TLS). Spec 01 §A5.

Nothing is decrypted: the app sends here on purpose, and this forwards over its own TLS connection.
"""
from __future__ import annotations

import asyncio
import logging
import socket
import threading
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import anyio
import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import Route

from .. import config, db, pipeline
from ..collectors import activity
from ..collectors.base import Collector
from ..collectors.process_conn import describe_process
from ..engine import detect_adapter
from ..fingerprints import matcher

log = logging.getLogger("shadowscope.gateway")
BIND_HOST = "127.0.0.1"  # Requests here carry real API keys: never expose this beyond the machine.
SELF_HEADER = "x-shadowscope-self"
HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"}
DROPPED_REQUEST_HEADERS = HOP_BY_HOP | {"host", "content-length", "accept-encoding", SELF_HEADER}
MAX_BODY_BYTES = config.MAX_UPLOAD_BYTES
MAX_CAPTURE_BYTES = 2 * 1024 * 1024
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
TIMEOUT = httpx.Timeout(120.0, connect=15.0)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def upstream_host(provider: dict | None) -> str | None:
    """The real host for a provider. Local and wildcard-only providers cannot be forwarded to."""
    if provider is None or provider["category"] == "local_llm" or provider["id"] == "mock_ai":
        return None
    return next((host for host in provider["hosts"] if "*" not in host), None)


def upstream_url(host: str, path: str, query: str) -> httpx.URL:
    """The host is passed separately, so nothing in the request path can change where this goes."""
    override = urlsplit(config.GATEWAY_UPSTREAM or "")
    if override.hostname in matcher.LOCAL_HOSTS:
        return httpx.URL(scheme=override.scheme, host=override.hostname, port=override.port, path=f"/{path}", query=query.encode())
    return httpx.URL(scheme="https", host=host, path=f"/{path}", query=query.encode())


def _client_process(request: Request) -> dict:
    owner = activity.port_owner(request.client.port) if request.client else None
    process = describe_process(owner["pid"], owner["name"]) if owner else {"name": "Gateway client"}
    agent = request.headers.get("user-agent")
    return {**process, "cmdline_hint": process.get("cmdline_hint") or (detect_adapter.harden(agent)[:200] if agent else None)}


def _observation(request: Request, provider: dict, host: str, path: str, text: str | None) -> dict:
    return {
        "source": "gateway", "process": _client_process(request), "method": request.method, "headers": dict(request.headers),
        "dest": {"host": host, "port": 443, "path": f"/{path}", "protocol": "https"}, "body_text": text,
        "meta": {"provider_id": provider["id"]},
    }


def _blocking_finding(scan: dict | None) -> dict | None:
    if scan is None or not db.get_policy().get("block_on_critical", True):
        return None
    return next((finding for finding in scan["findings"] if finding["severity"] == "critical"), None)


async def _record(observation: dict, scan: dict | None) -> None:
    with anyio.CancelScope(shield=True):  # A client hanging up mid-stream must not lose the record.
        await asyncio.to_thread(pipeline.process, observation, prescan={"scan": scan})


async def proxy(request: Request) -> Response:
    provider = matcher.provider_by_id(request.path_params["provider_id"])
    host = upstream_host(provider)
    if provider is None or host is None:
        return _error(404, "unknown_provider", f"No forwardable provider called {request.path_params['provider_id']}")
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        return _error(413, "payload_too_large", "Request body is too large for the gateway")

    path = request.path_params["path"]
    is_self = request.headers.get(SELF_HEADER) == "1"
    text = body.decode("utf-8", "replace") if body else None
    observation = _observation(request, provider, host, path, text)
    scan = None
    if text and not is_self:
        scan = await asyncio.to_thread(detect_adapter.scan_text, text, context={"source": "gateway"}, policy=db.get_policy())

    blocking = _blocking_finding(scan)
    if blocking:
        await _record({**observation, "meta": {**observation["meta"], "tags": ["blocked"]}}, scan)
        return JSONResponse({"error": f"blocked by ShadowScope: {blocking['title']}"}, status_code=403)

    headers = [(name, value) for name, value in request.headers.items() if name.lower() not in DROPPED_REQUEST_HEADERS]
    headers.append(("accept-encoding", "identity"))  # Compressed replies could not be analysed.
    client: httpx.AsyncClient = request.app.state.client
    upstream_request = client.build_request(request.method, upstream_url(host, path, request.url.query), headers=headers, content=body)
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as error:
        if not is_self:
            await _record(observation, scan)
        return _error(502, "upstream_unreachable", f"Could not reach {provider['name']}: {type(error).__name__}")

    async def relay() -> AsyncIterator[bytes]:
        captured = bytearray()
        try:
            async for chunk in upstream.aiter_raw():
                if len(captured) < MAX_CAPTURE_BYTES:
                    captured += chunk[:MAX_CAPTURE_BYTES - len(captured)]
                yield chunk
        finally:
            await upstream.aclose()
            if not is_self:
                readable = "content-encoding" not in upstream.headers
                reply = captured.decode("utf-8", "replace") if readable else None
                await _record({**observation, "response_text": reply, "bytes_in": len(captured)}, scan)

    response_headers = {name: value for name, value in upstream.headers.items() if name.lower() not in HOP_BY_HOP}
    return StreamingResponse(relay(), status_code=upstream.status_code, headers=response_headers)


def build_app(transport: httpx.AsyncBaseTransport | None = None) -> Starlette:
    @asynccontextmanager
    async def lifespan(app: Starlette) -> AsyncIterator[None]:
        app.state.client = httpx.AsyncClient(timeout=TIMEOUT, transport=transport, follow_redirects=False)
        yield
        await app.state.client.aclose()

    return Starlette(routes=[Route("/{provider_id}/{path:path}", proxy, methods=METHODS)], lifespan=lifespan)


class Gateway(Collector):
    """Runs on its own thread and event loop, so forwarding can never slow down the main API."""

    name = "gateway"

    def __init__(self) -> None:
        super().__init__()
        self._socket: socket.socket | None = None
        self._server: uvicorn.Server | None = None

    def unavailable_reason(self) -> str | None:
        # Bound here because uvicorn calls sys.exit on a bind failure, which would take the main API with it.
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listener.bind((BIND_HOST, config.GATEWAY_PORT))
        except OSError as error:
            listener.close()
            return f"Port {config.GATEWAY_PORT} is unavailable: {error.strerror}"
        self._socket = listener
        return None

    def poll(self) -> None:
        raise NotImplementedError

    def run(self) -> None:
        assert self._socket is not None
        uvicorn_config = uvicorn.Config(build_app(), log_level="warning", access_log=False)
        self._server = uvicorn.Server(uvicorn_config)
        asyncio.run(self._server.serve(sockets=[self._socket]))

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        super().stop()
        if self._socket is not None:
            self._socket.close()
            self._socket = None
