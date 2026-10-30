"""Writes samples/demo.har, demo.pcap, agent_session.jsonl and leaky.log: `python -m simulator.make_samples`.

Built from what the scenarios really send, captured by a dry run, so samples cannot drift from the simulator. All values
are fake. Timestamps and ids are fixed, so rebuilding gives identical files.
"""
from __future__ import annotations

import json
import struct
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import fakes
from .client import SWEEP_HOSTS, Context
from .scenarios import BY_ID

OUTPUT_DIR = Path(__file__).parent / "samples"
_START = datetime(2026, 10, 30, 10, 0, 0, tzinfo=timezone.utc)
_STEP = timedelta(seconds=1)
_HTTP_SCENARIOS = ("env_file_leak", "customer_pii_dump", "proprietary_code", "rogue_agent", "canary_trip", "local_llm_chat")
_LOOPBACK = "127.0.0.1"
_OLLAMA_PORT = 11434
_MSS = 1400
_CLIENT_PORT = 50000
_DOC_NETWORK = "203.0.113."    # TEST-NET-3: never a real provider address


@dataclass
class _Recorder(Context):
    """A dry run that keeps its observations instead of printing them."""
    dry_run: bool = True
    run_id: str = "run_sample"
    records: list[dict] = field(default_factory=list)

    def report(self, observation: dict) -> None:
        self.records.append(observation)

    def say(self, message: str) -> None:
        pass


def observations(scenario_id: str) -> list[dict]:
    recorder = _Recorder(scenario_id)
    BY_ID[scenario_id].run(recorder)
    return recorder.records


def _timestamp(index: int) -> str:
    return (_START + _STEP * index).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_har() -> dict:
    entries = []
    for index, record in enumerate(r for scenario in _HTTP_SCENARIOS for r in observations(scenario)):
        dest, body, reply = record["dest"], record["body_text"], record["response_text"]
        local = dest["host"] == "localhost"
        url = f"http://localhost:{dest['port']}{dest['path']}" if local else f"https://{dest['host']}{dest['path']}"
        entries.append({
            "startedDateTime": _timestamp(index), "time": 180, "cache": {},
            "timings": {"blocked": 0, "dns": 0, "connect": 0, "ssl": 0, "send": 1, "wait": 170, "receive": 9},
            "request": {
                "method": "POST", "url": url, "httpVersion": "HTTP/1.1", "cookies": [], "queryString": [],
                "headers": [{"name": "Content-Type", "value": "application/json"}], "headersSize": -1,
                "bodySize": len(body.encode()), "postData": {"mimeType": "application/json", "text": body},
            },
            "response": {
                "status": 200, "statusText": "OK", "httpVersion": "HTTP/1.1", "cookies": [], "redirectURL": "",
                "headers": [{"name": "Content-Type", "value": "application/json"}], "headersSize": -1,
                "bodySize": len(reply.encode()),
                "content": {"size": len(reply.encode()), "mimeType": "application/json", "text": reply},
            },
        })
    return {"log": {"version": "1.2", "creator": {"name": "ShadowScope simulator", "version": "0.2.0"}, "entries": entries}}


def build_jsonl() -> str:
    lines = []
    for index, record in enumerate(observations("rogue_agent")):
        dest = record["dest"]
        lines.append(json.dumps({
            "ts": _timestamp(index), "url": f"https://{dest['host']}{dest['path']}", "method": "POST",
            "process": {"name": "python3", "cmdline_hint": record["process"]["cmdline_hint"]},
            "body": record["body_text"], "response": record["response_text"],
        }, ensure_ascii=False))
    return "\n".join(lines) + "\n"


def build_log() -> str:
    customer = fakes.fake_customers(1)[0]
    rows = (
        ("INFO", "worker started"),
        ("INFO", f"loaded config: OPENAI_API_KEY={fakes.OPENAI_KEY}"),
        ("ERROR", f"connection failed for {fakes.DB_URL}"),
        ("WARN", f"retrying with token {fakes.fake_jwt()}"),
        ("INFO", f"customer lookup: {customer.email} {customer.phone} PAN {customer.pan}"),
        ("DEBUG", f"aadhaar on file: {customer.aadhaar}"),
        ("INFO", f"upstream host db01.prod.internal resolved to 10.20.30.40, payment card {fakes.TEST_CARDS[0]}"),
        ("INFO", "worker finished"),
    )
    return "".join(f"{_timestamp(index)} {level:<5} {message}\n" for index, (level, message) in enumerate(rows))


def client_hello(host: str) -> bytes:
    """The smallest TLS ClientHello that carries an SNI extension."""
    name = host.encode()
    server_names = struct.pack("!HBH", len(name) + 3, 0, len(name)) + name
    extension = struct.pack("!HH", 0, len(server_names)) + server_names
    body = (b"\x03\x03" + bytes(32) + b"\x00" + struct.pack("!H", 2) + b"\x13\x01" + b"\x01\x00"
            + struct.pack("!H", len(extension)) + extension)
    handshake = b"\x01" + len(body).to_bytes(3, "big") + body
    return b"\x16\x03\x01" + struct.pack("!H", len(handshake)) + handshake


def _http_messages(record: dict) -> tuple[bytes, bytes, int]:
    dest, body, reply = record["dest"], record["body_text"].encode(), record["response_text"].encode()
    port = _OLLAMA_PORT if dest["host"] == "localhost" else dest["port"]
    host = f"localhost:{port}" if dest["host"] == "localhost" else dest["host"]
    request = (f"POST {dest['path']} HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\n"
               f"Content-Length: {len(body)}\r\nUser-Agent: python-httpx/0.28\r\n\r\n").encode() + body
    response = (f"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                f"Content-Length: {len(reply)}\r\n\r\n").encode() + reply
    return request, response, port


def _segments(data: bytes) -> list[bytes]:
    return [data[offset:offset + _MSS] for offset in range(0, len(data), _MSS)]


def _flow(client: str, server: str, sport: int, dport: int, request: bytes, response: bytes) -> list:
    """One TCP connection: handshake, request, response, close."""
    from scapy.layers.inet import IP, TCP
    from scapy.layers.l2 import Ether
    from scapy.packet import Raw

    def packet(outbound: bool, flags: str, seq: int, ack: int, payload: bytes = b""):
        src, dst, source, target = (client, server, sport, dport) if outbound else (server, client, dport, sport)
        frame = Ether(src="02:00:00:00:00:01", dst="02:00:00:00:00:02") / IP(src=src, dst=dst, id=1) / TCP(
            sport=source, dport=target, flags=flags, seq=seq, ack=ack, window=65535)
        return frame / Raw(payload) if payload else frame

    client_seq, server_seq = 1001, 5001
    frames = [packet(True, "S", client_seq - 1, 0), packet(False, "SA", server_seq - 1, client_seq),
              packet(True, "A", client_seq, server_seq)]
    for chunk in _segments(request):
        frames.append(packet(True, "PA", client_seq, server_seq, chunk))
        client_seq += len(chunk)
    for chunk in _segments(response):
        frames.append(packet(False, "PA", server_seq, client_seq, chunk))
        server_seq += len(chunk)
    frames += [packet(True, "FA", client_seq, server_seq), packet(False, "FA", server_seq, client_seq + 1)]
    return frames


def build_pcap() -> list:
    frames = []
    records = [r for scenario in ("env_file_leak", "customer_pii_dump", "proprietary_code", "local_llm_chat")
               for r in observations(scenario)]
    for index, record in enumerate(records):
        request, response, port = _http_messages(record)
        frames += _flow(_LOOPBACK, _LOOPBACK, _CLIENT_PORT + index, port, request, response)
    for index, host in enumerate(SWEEP_HOSTS, start=1):
        frames += _flow("192.0.2.10", f"{_DOC_NETWORK}{index}", _CLIENT_PORT + 100 + index, 443, client_hello(host), b"")
    for index, frame in enumerate(frames):
        frame.time = _START.timestamp() + index * 0.01
    return frames


def write_all(directory: Path = OUTPUT_DIR) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    written = {
        "demo.har": json.dumps(build_har(), ensure_ascii=False, indent=1) + "\n",
        "agent_session.jsonl": build_jsonl(),
        "leaky.log": build_log(),
    }
    paths = []
    for name, text in written.items():
        (directory / name).write_text(text, encoding="utf-8")
        paths.append(directory / name)
    try:
        from scapy.utils import wrpcap
    except ImportError:
        print("scapy is not installed, skipping demo.pcap (pip install -r simulator/requirements.txt)", file=sys.stderr)
        return paths
    wrpcap(str(directory / "demo.pcap"), build_pcap())
    return [*paths, directory / "demo.pcap"]


def main() -> int:
    for path in write_all():
        print(f"{path}  {path.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
