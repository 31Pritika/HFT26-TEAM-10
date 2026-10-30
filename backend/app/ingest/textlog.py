"""Plain .log / .txt: the whole file is one observation with no known provider."""
from __future__ import annotations

from .types import Parsed


def parse(text: str) -> Parsed:
    observation = {"source": "log", "process": {"name": "Log file"}, "dest": {"host": "unknown", "port": 0, "protocol": "tcp"}, "body_text": text}
    return Parsed("log", [observation])
