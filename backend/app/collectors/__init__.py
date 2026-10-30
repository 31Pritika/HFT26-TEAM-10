"""Collector registry."""
from __future__ import annotations

from .agent_watch import AgentWatch
from .base import Collector
from .dns_sni import DnsSni
from .ip_cache import IpCache
from .loopback import Loopback
from .process_conn import ProcessConn

_collectors: dict[str, Collector] = {}


def _build() -> dict[str, Collector]:
    if not _collectors:
        from ..gateway.tap import Gateway  # The gateway imports from this package.

        for collector in (IpCache(), ProcessConn(), DnsSni(), Loopback(), AgentWatch(), Gateway()):
            _collectors[collector.name] = collector
    return _collectors


def status() -> dict[str, dict]:
    return {name: collector.status() for name, collector in _build().items()}


def summary() -> list[dict]:
    return [{"name": name, "running": state["running"]} for name, state in status().items()]


def start_all() -> None:
    for collector in _build().values():
        collector.start()


def stop_all() -> None:
    for collector in _build().values():
        collector.stop()
