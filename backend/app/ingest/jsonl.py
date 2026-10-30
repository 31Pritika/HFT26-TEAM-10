"""JSON and JSONL request logs. Key names vary between tools, so several spellings are accepted."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit

from ..utils import to_iso
from .types import IngestError, Parsed

URL_KEYS = ("url", "endpoint", "request_url", "uri")
BODY_KEYS = ("body", "request_body", "request", "prompt", "messages", "input", "payload")
RESPONSE_KEYS = ("response", "response_body", "output", "completion")
TS_KEYS = ("ts", "timestamp", "time", "created_at", "date")
PROCESS_KEYS = ("process", "process_name", "app", "application")
RECORD_LIST_KEYS = ("items", "entries", "logs", "records", "requests")


def _first(record: dict, keys: tuple[str, ...]) -> Any:
    return next((record[key] for key in keys if record.get(key) not in (None, "")), None)


def _text(value: Any) -> str | None:
    if value is None or isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _timestamp(value: Any) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value if isinstance(value, str) else None
    seconds = value / 1000 if value > 1e11 else value  # Epoch values may be in milliseconds.
    try:
        return to_iso(datetime.fromtimestamp(seconds, timezone.utc))
    except (OverflowError, OSError, ValueError):
        return None


def _process(value: Any) -> dict:
    if isinstance(value, dict):
        return {key: value[key] for key in ("pid", "name", "exe", "user", "parent", "cmdline_hint") if key in value}
    return {"name": str(value) if value else "Log file"}


def _observation(record: dict) -> dict:
    url = urlsplit(str(_first(record, URL_KEYS) or ""))
    host = url.hostname or record.get("host") or "unknown"
    secure = url.scheme == "https"
    headers = record.get("headers")
    return {
        "source": "log", "ts": _timestamp(_first(record, TS_KEYS)), "process": _process(_first(record, PROCESS_KEYS)),
        "dest": {"host": str(host), "port": url.port or (443 if secure else 80 if url.scheme else 0), "path": url.path or None,
                 "protocol": "https" if secure else "http" if url.scheme else "tcp"},
        "method": record.get("method") if isinstance(record.get("method"), str) else None,
        "headers": {str(k): str(v) for k, v in headers.items()} if isinstance(headers, dict) else None,
        "body_text": _text(_first(record, BODY_KEYS)), "response_text": _text(_first(record, RESPONSE_KEYS)),
    }


def parse_jsonl(text: str) -> Parsed:
    observations, skipped = [], 0
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except ValueError:
            skipped += 1
            continue
        if isinstance(record, dict):
            observations.append(_observation(record))
        else:
            skipped += 1
    if not observations:
        raise IngestError("No JSON records found")
    return Parsed("jsonl", observations, [f"{skipped} lines were not JSON objects"] if skipped else [])


def parse_json(document: Any) -> Parsed:
    if isinstance(document, dict):
        nested = next((document[key] for key in RECORD_LIST_KEYS if isinstance(document.get(key), list)), None)
        records = nested if nested is not None else [document]
    elif isinstance(document, list):
        records = document
    else:
        raise IngestError("JSON file must contain an object or a list")
    usable = [record for record in records if isinstance(record, dict)]
    skipped = len(records) - len(usable)
    return Parsed("json", [_observation(record) for record in usable], [f"{skipped} items were not JSON objects"] if skipped else [])
