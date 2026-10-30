"""What the collectors currently know about processes, shared between them."""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_active: dict[int, dict] = {}
_port_owners: dict[int, dict] = {}
_own_hosts: dict[str, float] = {}


def mark_active(pid: int, process: dict, dest: dict) -> None:
    """Notes that a process talked to an AI provider just now."""
    with _lock:
        _active[pid] = {"process": process, "dest": dest, "seen": time.monotonic()}


def recently_active(window_s: float) -> dict[int, dict]:
    cutoff = time.monotonic() - window_s
    with _lock:
        for pid in [pid for pid, entry in _active.items() if entry["seen"] < cutoff]:
            del _active[pid]
        return dict(_active)


def set_port_owners(owners: dict[int, dict]) -> None:
    global _port_owners
    with _lock:
        _port_owners = dict(owners)


def port_owner(port: int) -> dict | None:
    with _lock:
        return _port_owners.get(port)


def expect_own_traffic(hosts: tuple[str, ...], seconds: float) -> None:
    """ShadowScope is about to contact these hosts itself. Sniffed DNS and SNI carry no marker header to check."""
    until = time.monotonic() + seconds
    with _lock:
        _own_hosts.update(dict.fromkeys(hosts, until))


def is_own_traffic(host: str) -> bool:
    with _lock:
        return _own_hosts.get(host, 0) > time.monotonic()


def clear() -> None:
    with _lock:
        _active.clear()
        _port_owners.clear()
        _own_hosts.clear()
