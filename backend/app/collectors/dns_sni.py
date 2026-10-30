"""Hostnames from DNS queries and TLS ClientHello SNI, which are plaintext. No decryption of any kind."""
from __future__ import annotations

import time
from typing import Any

from .. import pipeline
from ..fingerprints import matcher
from ..ingest.pcap import parse_sni
from . import activity
from .process_conn import describe_process
from .sniffer import Sniffer, tcp_segment

# Only outbound TLS: inbound packets are the bulk of the traffic and hold nothing useful here.
BPF_FILTER = "udp dst port 53 or tcp dst port 443"
HOST_REPEAT_S = 60
MAX_HELLO_BYTES = 16_384
MAX_PENDING_HELLOS = 256


class HelloBuffer:
    """Modern ClientHellos can be larger than one packet, and SNI may sit in the second one."""

    def __init__(self) -> None:
        self._pending: dict[tuple, bytes] = {}

    def feed(self, flow: tuple, payload: bytes) -> str | None:
        if flow in self._pending:
            data = self._pending.pop(flow) + payload
        elif payload[:1] == b"\x16" and payload[5:6] == b"\x01":
            data = payload
        else:
            return None
        host = parse_sni(data)
        record_end = 5 + int.from_bytes(data[3:5], "big")
        if host is None and len(data) < min(record_end, MAX_HELLO_BYTES):
            if len(self._pending) >= MAX_PENDING_HELLOS:
                self._pending.pop(next(iter(self._pending)))
            self._pending[flow] = data
        return host


class DnsSni(Sniffer):
    name = "dns_sni"
    bpf_filter = BPF_FILTER

    def __init__(self) -> None:
        super().__init__()
        self._hellos = HelloBuffer()
        self._last_seen: dict[str, float] = {}

    def interface(self) -> str:
        from scapy.config import conf

        return str(conf.iface)

    def extract(self, packet: Any) -> tuple | None:
        from scapy.layers.dns import DNS, DNSQR

        if packet.haslayer(DNSQR) and packet[DNS].qr == 0:
            return ("dns", packet[DNSQR].qname.decode("ascii", "replace"))
        segment = tcp_segment(packet)
        if segment and segment.dport == 443 and segment.payload:
            return ("tcp", segment)
        return None

    def handle(self, item: tuple) -> None:
        kind, value = item
        if kind == "dns":
            self.observe(value, None, 53, None)
            return
        host = self._hellos.feed((value.src, value.sport, value.dst), value.payload)
        if host:
            self.observe(host, value.dst, 443, value.sport)

    def observe(self, host: str, ip: str | None, port: int, client_port: int | None, now: float | None = None) -> None:
        name = matcher.normalize_host(host)
        now = time.monotonic() if now is None else now
        if now - self._last_seen.get(name, -HOST_REPEAT_S) < HOST_REPEAT_S or matcher.match(host=name, port=443) is None:
            return
        self._last_seen[name] = now
        owner = activity.port_owner(client_port) if client_port else None
        pipeline.process({
            "source": "dns_sni", "process": describe_process(owner["pid"], owner["name"]) if owner else None,
            "dest": {"host": name, "ip": ip, "port": port, "protocol": "tls" if port == 443 else "tcp"},
        })
