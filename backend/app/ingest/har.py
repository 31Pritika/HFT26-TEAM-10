"""HAR (Chrome / Edge DevTools "Save all as HAR with content")."""
from __future__ import annotations

import base64
import binascii
from urllib.parse import urlsplit

from .types import IngestError, Parsed

PROCESS = {"name": "Browser (HAR)"}


def _response_text(content: dict) -> str | None:
    text = content.get("text")
    if not text or content.get("encoding") != "base64":
        return text
    try:
        return base64.b64decode(text, validate=True).decode("utf-8", "replace")
    except (binascii.Error, ValueError):
        return None


def _observation(entry: dict) -> dict | None:
    request = entry.get("request") or {}
    response = entry.get("response") or {}
    url = urlsplit(request.get("url") or "")
    if not url.hostname:
        return None
    secure = url.scheme == "https"
    body = (request.get("postData") or {}).get("text")
    content = response.get("content") or {}
    return {
        "source": "har", "ts": entry.get("startedDateTime"), "process": PROCESS,
        "dest": {"host": url.hostname, "ip": (entry.get("serverIPAddress") or "").strip("[]") or None,
                 "port": url.port or (443 if secure else 80), "path": url.path or "/", "protocol": "https" if secure else "http"},
        "method": request.get("method"),
        "headers": {h["name"]: h["value"] for h in request.get("headers") or [] if "name" in h and "value" in h},
        "body_text": body, "response_text": _response_text(content),
        "bytes_out": max(request.get("bodySize") or 0, 0) or None, "bytes_in": max(content.get("size") or 0, 0) or None,
    }


def parse(document: dict) -> Parsed:
    log = document.get("log")
    if not isinstance(log, dict) or not isinstance(log.get("entries"), list):
        raise IngestError("Not a HAR file: log.entries is missing")
    observations, skipped = [], 0
    for entry in log["entries"]:
        observation = _observation(entry) if isinstance(entry, dict) else None
        if observation:
            observations.append(observation)
        else:
            skipped += 1
    return Parsed("har", observations, [f"{skipped} HAR entries had no usable URL"] if skipped else [])
