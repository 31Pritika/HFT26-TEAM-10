"""Small helpers shared across the engine."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

WINDOWS = {"1h": 1, "6h": 6, "24h": 24, "7d": 168}
TS_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime(TS_FORMAT)


def now_iso() -> str:
    return to_iso(now())


def parse_ts(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def normalize_ts(value: str | None) -> str:
    """Any ISO-8601 input becomes the canonical UTC form, so timestamps compare as strings."""
    if not value:
        return now_iso()
    try:
        return to_iso(parse_ts(value))
    except ValueError:
        return now_iso()


def window_start(window: str, moment: datetime | None = None) -> datetime:
    return (moment or now()) - timedelta(hours=WINDOWS[window])


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:12]


def clamp(value: float, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, round(value)))
