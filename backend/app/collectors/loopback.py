"""Plaintext HTTP to local LLM servers, read from the loopback interface and paired into request + response."""
from __future__ import annotations

import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable

from .. import pipeline
from ..ingest.pcap import REQUEST_LINE, RESPONSE_LINE, HttpMessage, http_observation, read_complete_http, read_http
from ..utils import now_iso
from . import activity
from .process_conn import describe_process, parse_lsof
from .sniffer import Segment, Sniffer, tcp_segment

WATCHED_PORTS = (11434, 1234, 8080, 8000, 5000, 7860, 1337, 4891, 8788)
BPF_FILTER = " or ".join(f"tcp port {port}" for port in WATCHED_PORTS)
MAX_STREAM_BYTES = 5 * 1024 * 1024
IDLE_S = 60.0  # A local model can think for a long time before its first byte.
CLOSE_GRACE_S = 0.5
MAX_OUT_OF_ORDER = 256
UNKNOWN_CLIENT = {"name": "Local client"}
SIM_HEADER = "x-shadowscope-sim"


class TcpStream:
    """One direction of a connection, reassembled as packets arrive."""

    def __init__(self) -> None:
        self.data = bytearray()
        self._next: int | None = None
        self._held: dict[int, bytes] = {}

    def add(self, seq: int, payload: bytes) -> None:
        if self._next is None:
            self._next = seq
        if seq > self._next:
            self._held[seq] = payload
            if len(self._held) <= MAX_OUT_OF_ORDER:
                return
            self._next = min(self._held)  # A packet was lost for good: carry on after the gap.
            seq, payload = self._next, self._held.pop(self._next)
        self._append(seq, payload)
        while self._next in self._held:
            self._append(self._next, self._held.pop(self._next))

    def _append(self, seq: int, payload: bytes) -> None:
        assert self._next is not None
        fresh = payload[max(self._next - seq, 0):]  # Retransmitted bytes are dropped here.
        self.data += fresh
        self._next += len(fresh)


@dataclass
class Connection:
    client_ip: str
    client_port: int
    server_ip: str
    server_port: int
    last_seen: float
    process: dict = field(default_factory=lambda: dict(UNKNOWN_CLIENT))
    requests: TcpStream = field(default_factory=TcpStream)
    responses: TcpStream = field(default_factory=TcpStream)
    waiting: list[HttpMessage] = field(default_factory=list)
    closing: bool = False


class HttpFlows:
    """Turns TCP segments into observations. Holds no capture code, so it can be tested with plain bytes."""

    def __init__(self, ports: tuple[int, ...] = WATCHED_PORTS, on_new_connection: Callable[[Connection], None] | None = None) -> None:
        self.ports = set(ports)
        self.connections: dict[tuple, Connection] = {}
        self._on_new_connection = on_new_connection

    def _connection(self, segment: Segment, now: float) -> tuple[Connection, bool] | None:
        outbound = segment.dport in self.ports
        if not outbound and segment.sport not in self.ports:
            return None
        client, server = ((segment.src, segment.sport), (segment.dst, segment.dport)) if outbound else ((segment.dst, segment.dport), (segment.src, segment.sport))
        key = (*client, *server)
        connection = self.connections.get(key)
        if connection is None:
            connection = Connection(client[0], client[1], server[0], server[1], now)
            self.connections[key] = connection
            if self._on_new_connection:
                self._on_new_connection(connection)
        return connection, outbound

    def _observation(self, connection: Connection, request: HttpMessage, response: HttpMessage | None) -> dict:
        return http_observation(request, response, "loopback", now_iso(), connection.process, connection.server_ip, connection.server_port)

    def _drain(self, connection: Connection) -> list[dict]:
        requests, used = read_complete_http(bytes(connection.requests.data), REQUEST_LINE)
        del connection.requests.data[:used]
        connection.waiting += requests
        responses, used = read_complete_http(bytes(connection.responses.data), RESPONSE_LINE)
        del connection.responses.data[:used]
        return [self._observation(connection, connection.waiting.pop(0), response) for response in responses if connection.waiting]

    def _finish(self, key: tuple) -> list[dict]:
        """Ends a connection, keeping whatever arrived even if it was cut off."""
        connection = self.connections.pop(key)
        connection.waiting += read_http(bytes(connection.requests.data), REQUEST_LINE, body_until_close=False)
        responses = read_http(bytes(connection.responses.data), RESPONSE_LINE, body_until_close=True)
        return [self._observation(connection, request, responses[index] if index < len(responses) else None)
                for index, request in enumerate(connection.waiting)]

    def feed(self, segment: Segment, now: float) -> list[dict]:
        found = self._connection(segment, now)
        if found is None:
            return []
        connection, outbound = found
        connection.last_seen = now
        connection.closing = connection.closing or segment.fin_or_rst
        if segment.payload:
            (connection.requests if outbound else connection.responses).add(segment.seq, segment.payload)
        observations = self._drain(connection)
        if len(connection.requests.data) + len(connection.responses.data) > MAX_STREAM_BYTES:
            key = (connection.client_ip, connection.client_port, connection.server_ip, connection.server_port)
            observations += self._finish(key)
        return observations

    def expire(self, now: float) -> list[dict]:
        observations = []
        for key, connection in list(self.connections.items()):
            quiet = now - connection.last_seen
            if quiet >= IDLE_S or (connection.closing and quiet >= CLOSE_GRACE_S):
                observations += self._finish(key)
        return observations


def is_simulator_traffic(observation: dict) -> bool:
    """The simulator reports each request through /observations too, so capturing it here would count it twice."""
    return any(key.lower() == SIM_HEADER and value == "1" for key, value in (observation.get("headers") or {}).items())


def lookup_client(port: int) -> dict | None:
    """Which process owns this local port, or None. Short-lived clients are gone before the 2 s poll sees them."""
    known = activity.port_owner(port)
    if known:
        return describe_process(known["pid"], known["name"])
    try:
        result = subprocess.run(["lsof", "-n", "-P", "+c", "0", f"-iTCP:{port}"], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    owner = next((item for item in parse_lsof(result.stdout) if item.local_port == port), None)
    return describe_process(owner.pid, owner.name) if owner else None


class Loopback(Sniffer):
    name = "loopback"
    bpf_filter = BPF_FILTER

    def __init__(self) -> None:
        super().__init__()
        self._lookups = ThreadPoolExecutor(1, thread_name_prefix="loopback-owner")
        self.flows = HttpFlows(on_new_connection=self._find_owner)

    def _find_owner(self, connection: Connection) -> None:
        def run() -> None:
            owner = lookup_client(connection.client_port)
            if owner:
                connection.process = owner

        self._lookups.submit(run)

    def interface(self) -> str:
        from scapy.config import conf

        return str(conf.loopback_name or ("lo0" if sys.platform == "darwin" else "lo"))

    def extract(self, packet: Any) -> Segment | None:
        return tcp_segment(packet)

    def _send(self, observations: list[dict]) -> None:
        for observation in observations:
            if not is_simulator_traffic(observation):
                pipeline.process(observation)

    def handle(self, item: Segment) -> None:
        self._send(self.flows.feed(item, time.monotonic()))

    def tick(self) -> None:
        self._send(self.flows.expire(time.monotonic()))
