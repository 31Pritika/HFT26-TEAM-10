"""PCAP / PCAPNG: plaintext HTTP gives full payloads, TLS gives the hostname from the ClientHello SNI."""
from __future__ import annotations

import re
import struct
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from ..utils import to_iso
from .types import IngestError, Parsed

PROCESS = {"name": "Captured traffic (PCAP)"}
TLS_WARNING = "443 traffic: hostnames only, payload encrypted"
_REQUEST_LINE = re.compile(rb"^([A-Z]{3,7}) (\S+) HTTP/1\.[01]$")
_RESPONSE_LINE = re.compile(rb"^HTTP/1\.[01] \d{3}")

FlowKey = tuple[str, int, str, int]


@dataclass
class HttpMessage:
    start: bytes
    headers: dict[str, str]
    body: bytes


def reassemble(segments: dict[int, bytes]) -> bytes:
    """Orders TCP segments by sequence number, dropping retransmitted bytes."""
    stream = bytearray()
    next_seq: int | None = None
    for seq in sorted(segments):
        payload = segments[seq]
        if next_seq is not None and seq < next_seq:
            payload = payload[next_seq - seq:]
        stream += payload
        next_seq = max(next_seq or 0, seq + len(segments[seq]))
    return bytes(stream)


def _dechunk(data: bytes, position: int) -> tuple[bytes, int]:
    body = bytearray()
    while True:
        line_end = data.find(b"\r\n", position)
        if line_end < 0:
            return bytes(body), len(data)
        try:
            size = int(data[position:line_end].split(b";")[0], 16)
        except ValueError:
            return bytes(body), len(data)
        position = line_end + 2
        if size == 0:
            trailer = data.find(b"\r\n", position)
            return bytes(body), trailer + 2 if trailer >= 0 else len(data)
        body += data[position:position + size]
        position += size + 2


def read_http(data: bytes, first_line: re.Pattern, body_until_close: bool) -> list[HttpMessage]:
    """All HTTP/1.x messages in one direction of a connection, which may be keep-alive."""
    messages, position = [], 0
    while position < len(data):
        head_end = data.find(b"\r\n\r\n", position)
        if head_end < 0:
            break
        lines = data[position:head_end].split(b"\r\n")
        if not first_line.match(lines[0]):
            break
        headers = {}
        for line in lines[1:]:
            name, _, value = line.partition(b":")
            headers[name.decode("latin-1").strip().lower()] = value.decode("latin-1").strip()
        position = head_end + 4
        if "chunked" in headers.get("transfer-encoding", "").lower():
            body, position = _dechunk(data, position)
        elif headers.get("content-length", "").isdigit():
            length = int(headers["content-length"])
            body, position = data[position:position + length], position + length
        elif body_until_close:
            body, position = data[position:], len(data)
        else:
            body = b""
        messages.append(HttpMessage(lines[0], headers, body))
    return messages


def parse_sni(data: bytes) -> str | None:
    """Server name from a TLS ClientHello, or None. Every length is bounds-checked: this is untrusted input."""
    try:
        if len(data) < 44 or data[0] != 0x16 or data[5] != 0x01:
            return None
        position = 43
        position += 1 + data[position]  # session id
        position += 2 + struct.unpack_from("!H", data, position)[0]  # cipher suites
        position += 1 + data[position]  # compression
        extensions_end = position + 2 + struct.unpack_from("!H", data, position)[0]
        position += 2
        while position + 4 <= min(extensions_end, len(data)):
            kind, length = struct.unpack_from("!HH", data, position)
            position += 4
            if kind == 0:  # server_name: list length (2), name type (1), name length (2), name
                name_length = struct.unpack_from("!H", data, position + 3)[0]
                return data[position + 5:position + 5 + name_length].decode("ascii") or None
            position += length
    except (IndexError, struct.error, UnicodeDecodeError):
        return None
    return None


def _read_flows(data: bytes) -> tuple[dict[FlowKey, dict[int, bytes]], dict[FlowKey, float]]:
    from scapy.error import Scapy_Exception
    from scapy.layers.inet import IP, TCP
    from scapy.layers.inet6 import IPv6
    from scapy.utils import PcapReader

    flows: dict[FlowKey, dict[int, bytes]] = defaultdict(dict)
    started: dict[FlowKey, float] = {}
    with tempfile.NamedTemporaryFile(suffix=".pcap") as capture:
        capture.write(data)
        capture.flush()
        try:
            with PcapReader(capture.name) as reader:
                for packet in reader:
                    network = packet.getlayer(IP) or packet.getlayer(IPv6)
                    if network is None or not packet.haslayer(TCP):
                        continue
                    tcp = packet[TCP]
                    key = (network.src, int(tcp.sport), network.dst, int(tcp.dport))
                    started.setdefault(key, float(packet.time))
                    payload = bytes(tcp.payload)
                    if payload:
                        flows[key].setdefault(int(tcp.seq), payload)
        except (Scapy_Exception, EOFError, struct.error) as error:
            if not flows:
                raise IngestError("This is not a readable PCAP file") from error
    return flows, started


def _timestamp(seconds: float | None) -> str | None:
    return to_iso(datetime.fromtimestamp(seconds, timezone.utc)) if seconds else None


def _http_observations(key: FlowKey, stream: bytes, reply: bytes, ts: str | None) -> list[dict]:
    source_ip, _, dest_ip, dest_port = key
    responses = read_http(reply, _RESPONSE_LINE, body_until_close=True)
    observations = []
    for index, request in enumerate(read_http(stream, _REQUEST_LINE, body_until_close=False)):
        line = _REQUEST_LINE.match(request.start)
        assert line is not None
        response = responses[index] if index < len(responses) else None
        compressed = response is not None and "content-encoding" in response.headers
        observations.append({
            "source": "pcap", "ts": ts, "process": {**PROCESS, "parent": source_ip},
            "dest": {"host": request.headers.get("host") or dest_ip, "ip": dest_ip, "port": dest_port,
                     "path": line.group(2).decode("latin-1"), "protocol": "http"},
            "method": line.group(1).decode("ascii"), "headers": request.headers,
            "body_text": request.body.decode("utf-8", "replace") or None,
            "response_text": response.body.decode("utf-8", "replace") if response and not compressed else None,
            "bytes_out": len(request.body), "bytes_in": len(response.body) if response else 0,
        })
    return observations


def parse(data: bytes) -> Parsed:
    flows, started = _read_flows(data)
    observations: list[dict] = []
    saw_tls = False
    for key, segments in flows.items():
        stream = reassemble(segments)
        ts = _timestamp(started.get(key))
        if stream[:1] == b"\x16":
            server_name = parse_sni(stream)
            if server_name:
                saw_tls = True
                observations.append({
                    "source": "pcap", "ts": ts, "process": {**PROCESS, "parent": key[0]},
                    "dest": {"host": server_name, "ip": key[2], "port": key[3], "protocol": "tls"},
                    "bytes_out": len(stream), "bytes_in": len(reassemble(flows.get((key[2], key[3], key[0], key[1]), {}))),
                })
        elif _REQUEST_LINE.match(stream.split(b"\r\n", 1)[0]):
            reply = reassemble(flows.get((key[2], key[3], key[0], key[1]), {}))
            observations += _http_observations(key, stream, reply, ts)
    return Parsed("pcap", observations, [TLS_WARNING] if saw_tls else [])
