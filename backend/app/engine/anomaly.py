"""Per-process traffic anomalies: unusual upload sizes, sustained upload volume, and request bursts."""
from __future__ import annotations

import math
import threading
from collections import defaultdict, deque

from ..utils import fingerprint, parse_ts

Z_THRESHOLD = 3.0
MIN_BASELINE = 10
BASELINE_SIZE = 200
MIN_STD_BYTES = 1024.0  # Near-identical requests have almost no spread, and any small change would look extreme.
VOLUME_WINDOW_S = 60
# Volume rule: a process with no history has no baseline, and equal-sized payloads have no deviation.
VOLUME_LIMIT_BYTES = 5 * 1024 * 1024
BURST_WINDOW_S = 60
BURST_MIN_REQUESTS = 6
BURST_MAX_MEAN_GAP_S = 2.0
RECENT_REQUESTS = 60
METADATA_SOURCES = {"live_conn", "dns_sni"}  # Connection reports, not requests, and macOS gives them 0 bytes.

_lock = threading.Lock()
_sizes: dict[str, deque] = defaultdict(lambda: deque(maxlen=BASELINE_SIZE))
_uploads: dict[str, deque] = defaultdict(deque)
_requests: dict[str, deque] = defaultdict(lambda: deque(maxlen=RECENT_REQUESTS))


def reset() -> None:
    with _lock:
        _sizes.clear()
        _uploads.clear()
        _requests.clear()


def z_score(value: float, history: deque | list) -> float | None:
    """How unusual `value` is against the history, or None without enough history."""
    if len(history) < MIN_BASELINE:
        return None
    mean = sum(history) / len(history)
    variance = sum((item - mean) ** 2 for item in history) / len(history)
    return (value - mean) / max(math.sqrt(variance), MIN_STD_BYTES)


def _megabytes(value: float) -> str:
    return f"{value / (1024 * 1024):.1f} MB"


def _finding(process_name: str, detail: str, confidence: float) -> dict:
    return {
        "type": "exfil_volume", "subtype": "bytes_out_spike", "severity": "high", "confidence": confidence,
        "title": f"Exfiltration volume spike: {process_name}", "description": detail,
        "evidence": {"redacted_snippet": detail, "match_redacted": detail, "entropy": None, "line": None, "offset": None,
                     "fingerprint": fingerprint(f"exfil:{process_name}")},
        "detector": "anomaly", "compliance": [], "remediation": [],
    }


def check_bytes(process_name: str, ts: str, bytes_out: int, source: str) -> dict | None:
    """Records one request's upload size. Returns a finding when it is unusual."""
    if source in METADATA_SOURCES or bytes_out <= 0:
        return None
    moment = parse_ts(ts)
    with _lock:
        score = z_score(bytes_out, _sizes[process_name])
        _sizes[process_name].append(bytes_out)
        uploads = _uploads[process_name]
        uploads.append((moment, bytes_out))
        while uploads and (moment - uploads[0][0]).total_seconds() > VOLUME_WINDOW_S:
            uploads.popleft()
        total = sum(size for _, size in uploads)
    if total >= VOLUME_LIMIT_BYTES:
        return _finding(process_name, f"{_megabytes(total)} sent in {VOLUME_WINDOW_S} s by {process_name}", 0.9)
    if score is not None and score > Z_THRESHOLD:
        return _finding(process_name, f"{_megabytes(bytes_out)} request from {process_name} (z-score {score:.1f})", 0.8)
    return None


def track_request(process_name: str, ts: str, source: str) -> tuple[int, float]:
    """Records one request. Returns the requests in the last minute and their mean gap in seconds."""
    if source in METADATA_SOURCES:
        return 0, float("inf")
    moment = parse_ts(ts)
    with _lock:
        _requests[process_name].append(moment)
        window = sorted(item for item in _requests[process_name] if 0 <= (moment - item).total_seconds() <= BURST_WINDOW_S)
    if len(window) < 2:
        return len(window), float("inf")
    gaps = [(later - earlier).total_seconds() for earlier, later in zip(window, window[1:])]
    return len(window), sum(gaps) / len(gaps)


def is_burst(requests: int, mean_gap: float) -> bool:
    return requests >= BURST_MIN_REQUESTS and mean_gap < BURST_MAX_MEAN_GAP_S
