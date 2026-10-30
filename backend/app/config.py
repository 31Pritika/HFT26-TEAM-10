"""Environment and defaults for the engine."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
DETECTOR_DIR = REPO_ROOT / "detector"
SIMULATOR_DIR = REPO_ROOT / "simulator"
CONTRACTS_MOCK_DIR = REPO_ROOT / "contracts" / "mock"


def _load_dotenv(path: Path) -> None:
    """Minimal .env reader. Real environment variables always win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key and not key.startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_dotenv(REPO_ROOT / ".env")

VERSION = "0.2.0"
HOST = os.getenv("SHADOWSCOPE_HOST", "127.0.0.1")
PORT = int(os.getenv("SHADOWSCOPE_PORT", "8787"))
DB_PATH = Path(os.getenv("SHADOWSCOPE_DB", BACKEND_DIR / "data" / "shadowscope.db"))
FRONTEND_ORIGIN = os.getenv("SHADOWSCOPE_FRONTEND_ORIGIN")
ALLOW_REMOTE = os.getenv("SHADOWSCOPE_ALLOW_REMOTE") == "1"
SEED_ON_STARTUP = os.getenv("SHADOWSCOPE_SEED", "1") == "1"

MAX_EVENTS = 50_000
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
DEDUPE_WINDOW_S = 600
PAYLOAD_PREVIEW_CHARS = 500
TRIAGE_TIMEOUT_S = 20
STATS_INTERVAL_S = 3
PRUNE_INTERVAL_S = 600
SCENARIO_CACHE_S = 60
AGENT_ACTIVE_WINDOW_S = 600
RISK_HALF_LIFE_H = 6

COLLECTOR_NAMES = ("process_conn", "ip_cache", "dns_sni", "loopback", "agent_watch")

DEFAULT_POLICY = {
    "sanctioned_providers": ["copilot", "ollama"],
    "sanctioned_processes": ["Code Helper (Plugin)", "ollama"],
    "blocked_providers": ["deepseek"],
    "canary_tokens": ["CANARY-SS-7F3A9"],
    "entropy_threshold": 4.0,
    "alert_min_severity": "medium",
    "redact_in_storage": True,
    "llm_triage": {"enabled": True, "engine": "auto", "model": None},
    "self_exclude": True,
}
