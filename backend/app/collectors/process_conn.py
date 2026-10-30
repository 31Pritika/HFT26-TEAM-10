"""Maps sockets to processes and reports connections to AI providers. Metadata only, never payloads."""
from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass

import psutil

from .. import pipeline
from ..engine.detect_adapter import harden
from ..fingerprints import matcher
from . import activity
from .base import Collector

REPEAT_S = 60
LSOF_TIMEOUT_S = 10
CMDLINE_CHARS = 200
BYTES_UNAVAILABLE = "bytes-unavailable"
_LSOF_ADDRESS = re.compile(r"^(?:\[(.+)\]|([^:\[\]]+)):(\d+)->(?:\[(.+)\]|([^:\[\]]+)):(\d+)$")


@dataclass(frozen=True)
class Connection:
    pid: int
    name: str
    local_port: int
    remote_ip: str
    remote_port: int


def parse_lsof(output: str) -> list[Connection]:
    """Established TCP sockets from `lsof -i -n -P +c 0`, which writes spaces in names as \\x20."""
    connections = []
    for line in output.splitlines():
        columns = line.split()
        if len(columns) < 10 or columns[-1] != "(ESTABLISHED)" or not columns[1].isdigit():
            continue
        address = _LSOF_ADDRESS.match(columns[-2])
        if address:
            connections.append(Connection(int(columns[1]), columns[0].replace("\\x20", " "), int(address[3]),
                                          address[4] or address[5], int(address[6])))
    return connections


def psutil_connections() -> list[Connection]:
    connections = []
    for item in psutil.net_connections(kind="tcp"):
        if item.status == psutil.CONN_ESTABLISHED and item.raddr and item.pid:
            connections.append(Connection(item.pid, "", item.laddr.port, item.raddr.ip, item.raddr.port))
    return connections


def lsof_connections() -> list[Connection]:
    result = subprocess.run(["lsof", "-i", "-n", "-P", "+c", "0"], capture_output=True, text=True, timeout=LSOF_TIMEOUT_S)
    return parse_lsof(result.stdout)


def describe_process(pid: int, fallback_name: str = "") -> dict:
    """What we can learn about a process. Command lines can hold secrets, so they are masked first."""
    info = {"pid": pid, "name": fallback_name or "unknown", "exe": None, "user": None, "parent": None, "cmdline_hint": None}
    try:
        process = psutil.Process(pid)
        info["name"] = process.name() or info["name"]
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return info
    for key, read in (("exe", process.exe), ("user", process.username), ("parent", lambda: process.parent().name()),
                      ("cmdline_hint", lambda: harden(" ".join(process.cmdline()))[:CMDLINE_CHARS] or None)):
        try:
            info[key] = read()
        except (psutil.Error, AttributeError, OSError):
            pass
    return info


class ProcessConn(Collector):
    name = "process_conn"
    interval = 2.0

    def __init__(self) -> None:
        super().__init__()
        self._last_sent: dict[tuple[int, str], float] = {}
        self._written: dict[int, int] = {}
        self._clock = 0.0

    def _snapshot(self) -> tuple[list[Connection], str | None]:
        try:
            return psutil_connections(), None
        except psutil.AccessDenied:
            pass
        try:
            return lsof_connections(), "Using lsof: only this user's processes are visible (run with sudo for all)"
        except (OSError, subprocess.SubprocessError) as error:
            return [], f"Cannot list connections: {type(error).__name__}"

    def _bytes_out(self, pid: int) -> int | None:
        """Bytes written since the last report, or None where the platform does not expose it (macOS)."""
        try:
            written = psutil.Process(pid).io_counters().write_bytes  # type: ignore[attr-defined]
        except (AttributeError, psutil.Error):
            return None
        previous = self._written.get(pid, written)
        self._written[pid] = written
        return max(written - previous, 0)

    def _observation(self, connection: Connection, provider: dict) -> dict:
        local = connection.remote_ip in matcher.LOCAL_HOSTS
        host = "localhost" if local else provider["hosts"][0]
        dest = {"host": host, "ip": connection.remote_ip, "port": connection.remote_port, "protocol": "tcp"}
        process = describe_process(connection.pid, connection.name)
        activity.mark_active(connection.pid, process, dest)
        bytes_out = self._bytes_out(connection.pid)
        return {"source": "live_conn", "process": process, "dest": dest, "bytes_out": bytes_out,
                "meta": {"provider_id": provider["id"], "tags": [] if bytes_out is not None else [BYTES_UNAVAILABLE]}}

    def scan(self, connections: list[Connection], now: float) -> list[dict]:
        """Observations for connections that are new, or still active after REPEAT_S."""
        observations, active = [], set()
        for connection in connections:
            if connection.pid == os.getpid():
                continue
            found = matcher.match(host=connection.remote_ip, ip=connection.remote_ip, port=connection.remote_port)
            if found is None:
                continue
            key = (connection.pid, found.provider["id"])
            active.add(key)
            if key not in self._last_sent or now - self._last_sent[key] >= REPEAT_S:
                self._last_sent[key] = now
                observations.append(self._observation(connection, found.provider))
        self._last_sent = {key: sent for key, sent in self._last_sent.items() if key in active}
        return observations

    def poll(self) -> None:
        connections, reason = self._snapshot()
        activity.set_port_owners({item.local_port: {"pid": item.pid, "name": item.name} for item in connections})
        self._clock += self.interval
        for observation in self.scan(connections, self._clock):
            pipeline.process(observation)
        self.report(reason=reason)
