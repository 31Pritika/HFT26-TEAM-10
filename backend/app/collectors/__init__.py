"""Collector registry."""
from __future__ import annotations

from .. import config
from .base import Collector
from .dns_sni import DnsSni
from .ip_cache import IpCache
from .loopback import Loopback
from .process_conn import ProcessConn

_collectors: dict[str, Collector] = {collector.name: collector for collector in (IpCache(), ProcessConn(), DnsSni(), Loopback())}
_NOT_BUILT = {"enabled": False, "running": False, "reason": "Not available yet"}


def status() -> dict[str, dict]:
    return {name: _collectors[name].status() if name in _collectors else dict(_NOT_BUILT) for name in config.COLLECTOR_NAMES}


def summary() -> list[dict]:
    return [{"name": name, "running": state["running"]} for name, state in status().items()]


def start_all() -> None:
    for collector in _collectors.values():
        collector.start()


def stop_all() -> None:
    for collector in _collectors.values():
        collector.stop()
