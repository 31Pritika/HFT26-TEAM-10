"""Works out what an upload is, parses it and feeds it through the pipeline."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from .. import pipeline
from . import har, jsonl, pcap, textlog
from .types import IngestError, Parsed

EXTENSIONS = {".pcap", ".pcapng", ".har", ".json", ".jsonl", ".log", ".txt"}
PCAP_MAGIC = (b"\xa1\xb2\xc3\xd4", b"\xd4\xc3\xb2\xa1", b"\xa1\xb2\x3c\x4d", b"\x4d\x3c\xb2\xa1", b"\x0a\x0d\x0d\x0a")


def _load_json(text: str) -> Any | None:
    try:
        return json.loads(text)
    except ValueError:
        return None


def parse(file_name: str, data: bytes) -> Parsed:
    suffix = Path(file_name).suffix.lower()
    if suffix not in EXTENSIONS:
        raise IngestError(f"Unsupported file type {suffix or '(none)'}. Use one of: {', '.join(sorted(EXTENSIONS))}")
    if not data.strip():
        raise IngestError("The file is empty")
    if data[:4] in PCAP_MAGIC:
        return pcap.parse(data)
    if suffix in (".pcap", ".pcapng"):
        raise IngestError("This is not a readable PCAP file")

    text = data.decode("utf-8-sig", "replace")
    if suffix == ".har":
        document = _load_json(text)
        if document is None or not isinstance(document, dict):
            raise IngestError("Not a HAR file: invalid JSON")
        return har.parse(document)
    if suffix in (".log", ".txt"):
        return textlog.parse(text)

    document = _load_json(text)
    if isinstance(document, dict) and isinstance(document.get("log"), dict) and "entries" in document["log"]:
        return har.parse(document)
    if document is not None and suffix == ".json":
        return jsonl.parse_json(document)
    return jsonl.parse_jsonl(text)


def ingest(file_name: str, data: bytes) -> dict:
    started = time.perf_counter()
    parsed = parse(file_name, data)
    results = [pipeline.process(observation) for observation in parsed.observations]
    kept = [result for result in results if result]
    return {
        "file_name": Path(file_name).name, "format": parsed.format, "events_created": len(kept),
        "findings_created": sum(result.created for result in kept),
        "ai_requests": sum(result.event["provider"] is not None for result in kept),
        "duration_ms": round((time.perf_counter() - started) * 1000), "warnings": parsed.warnings,
    }
