"""Error envelope (master §5) and request guards."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from .. import config

log = logging.getLogger("shadowscope.api")
LOOPBACK_CLIENTS = {"127.0.0.1", "::1", "localhost", "testclient"}
CODES = {400: "bad_request", 403: "forbidden", 404: "not_found", 405: "method_not_allowed", 409: "conflict",
         413: "payload_too_large", 415: "unsupported_media_type", 422: "validation_error", 502: "bad_gateway"}


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str | None = None) -> None:
        self.status = status
        self.message = message
        self.code = code or CODES.get(status, "error")


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def not_found(kind: str, item_id: str) -> ApiError:
    return ApiError(404, f"{kind} {item_id} not found")


def require_loopback(request: Request) -> None:
    client = request.client.host if request.client else ""
    if client not in LOOPBACK_CLIENTS and not config.ALLOW_REMOTE:
        raise ApiError(403, "This endpoint only accepts requests from this machine")


def register(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def on_api_error(_: Request, error: ApiError) -> JSONResponse:
        return JSONResponse(_body(error.code, error.message), status_code=error.status)

    @app.exception_handler(HTTPException)
    async def on_http_error(_: Request, error: HTTPException) -> JSONResponse:
        return JSONResponse(_body(CODES.get(error.status_code, "error"), str(error.detail)), status_code=error.status_code)

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        # Only field names and reasons: the rejected value could be a secret.
        problems = [f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in error.errors()]
        return JSONResponse(_body("validation_error", "; ".join(problems)), status_code=422)

    @app.exception_handler(Exception)
    async def on_unexpected_error(_: Request, error: Exception) -> JSONResponse:
        log.exception("unhandled error", exc_info=error)
        return JSONResponse(_body("internal_error", "Something went wrong in the engine"), status_code=500)
