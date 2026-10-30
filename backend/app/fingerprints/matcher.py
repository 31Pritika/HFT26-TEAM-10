"""Maps host / ip / port / path to a known AI provider, with a confidence."""
from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatchcase
from pathlib import Path

import yaml

MIN_CONFIDENCE = 0.5
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
# Ordinary dev servers use these ports too, so the port alone is not evidence of an LLM.
AMBIGUOUS_LOCAL_PORTS = {8000, 8080, 5000}
UNKNOWN_PROVIDER = {"id": "unknown", "name": "Unknown AI endpoint", "category": "unknown", "hosts": [], "ports": [], "paths": []}


@dataclass(frozen=True)
class Match:
    provider: dict
    confidence: float
    reason: str


def _load() -> tuple[list[dict], list[str]]:
    data = yaml.safe_load((Path(__file__).parent / "providers.yaml").read_text(encoding="utf-8"))
    return data["providers"], data["generic_paths"]


PROVIDERS, GENERIC_PATHS = _load()
_BY_ID = {provider["id"]: provider for provider in PROVIDERS}
_EXACT_HOSTS: dict[str, dict] = {}
_WILDCARDS: list[tuple[str, dict]] = []
_LOCAL_PORTS: dict[int, dict] = {}

for _provider in PROVIDERS:
    if _provider["category"] == "local_llm" or _provider["id"] == "mock_ai":
        for _port in _provider["ports"]:
            _LOCAL_PORTS.setdefault(_port, _provider)
        continue
    for _host in _provider["hosts"]:
        if _host.startswith("*."):
            _WILDCARDS.append((_host[1:], _provider))
        else:
            _EXACT_HOSTS[_host] = _provider

_ip_cache: dict[str, tuple[str, float]] = {}


def set_ip_cache(entries: dict[str, tuple[str, float]]) -> None:
    """Replaces the IP → (provider id, confidence) map. Fed by the ip_cache collector."""
    global _ip_cache
    _ip_cache = dict(entries)


def provider_by_id(provider_id: str | None) -> dict | None:
    return _BY_ID.get(provider_id or "")


def normalize_host(host: str | None) -> str:
    value = (host or "").strip().lower().rstrip(".")
    if value.startswith("["):  # [::1]:11434
        return value[1:].split("]", 1)[0]
    if value.count(":") == 1:
        value = value.split(":", 1)[0]
    return value


def _path_matches(path: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        if pattern.startswith(":"):
            if pattern in path:
                return True
        elif fnmatchcase(path, pattern) or path == pattern or path.startswith(f"{pattern}/"):
            return True
    return False


def _match_host(host: str) -> dict | None:
    if host in _EXACT_HOSTS:
        return _EXACT_HOSTS[host]
    return next((provider for suffix, provider in _WILDCARDS if host.endswith(suffix) and host != suffix[1:]), None)


def match(host: str | None = None, ip: str | None = None, port: int | None = None, path: str | None = None) -> Match | None:
    """Best provider for a destination, or None when nothing clears MIN_CONFIDENCE."""
    name = normalize_host(host)
    clean_path = (path or "").split("?", 1)[0]

    provider = _match_host(name)
    if provider:
        wildcard = name not in _EXACT_HOSTS
        if clean_path and _path_matches(clean_path, provider["paths"]):
            return Match(provider, 0.99, "host+path")
        return Match(provider, 0.9 if wildcard else 0.97, "wildcard" if wildcard else "host")

    if name in LOCAL_HOSTS or not name or ip in LOCAL_HOSTS:
        provider = _LOCAL_PORTS.get(port or 0)
        if provider:
            if clean_path and _path_matches(clean_path, provider["paths"] + GENERIC_PATHS):
                return Match(provider, 0.98, "local port+path")
            confidence = 0.4 if port in AMBIGUOUS_LOCAL_PORTS else 0.85
            if confidence >= MIN_CONFIDENCE:
                return Match(provider, confidence, "local port")

    if ip and ip in _ip_cache:
        provider_id, confidence = _ip_cache[ip]
        provider = _BY_ID.get(provider_id)
        if provider and confidence >= MIN_CONFIDENCE:
            return Match(provider, confidence, "ip cache")

    if clean_path and _path_matches(clean_path, GENERIC_PATHS):
        return Match(UNKNOWN_PROVIDER, 0.6, "generic path")
    return None
