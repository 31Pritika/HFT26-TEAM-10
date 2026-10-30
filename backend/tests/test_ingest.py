import base64
import json
import struct
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from scapy.layers.inet import IP, TCP
from scapy.layers.inet6 import IPv6
from scapy.layers.l2 import Ether
from scapy.utils import PcapNgWriter, wrpcap

from app import db
from app.ingest import pcap
from app.ingest.types import IngestError
from app.ingest import router as ingest_router
from app.main import app

AWS = "AKIAFAKEFAKEFAKE1234"


@pytest.fixture(autouse=True)
def clean_db():
    db.init()
    db.reset()
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def upload(client, name, data):
    return client.post("/api/ingest", files={"file": (name, data)})


def har_entry(url, body=None, **extra):
    request = {"method": "POST", "url": url, "headers": [{"name": "Content-Type", "value": "application/json"}], "bodySize": len(body or "")}
    if body is not None:
        request["postData"] = {"mimeType": "application/json", "text": body}
    return {"startedDateTime": "2026-10-30T09:00:00.123Z", "serverIPAddress": "[2606:4700::1]", "request": request,
            "response": {"status": 200, "content": {"size": 5, "text": "hello"}}, **extra}


def har_file(*entries):
    return json.dumps({"log": {"version": "1.2", "entries": list(entries)}}).encode()


def client_hello(host: str, session_id: bytes = b"") -> bytes:
    name = host.encode()
    server_name = struct.pack("!HBH", len(name) + 3, 0, len(name)) + name
    extensions = struct.pack("!HH", 0x0017, 0) + struct.pack("!HH", 0, len(server_name)) + server_name
    body = b"\x03\x03" + b"\x00" * 32 + bytes([len(session_id)]) + session_id
    body += struct.pack("!H", 2) + b"\x13\x01" + b"\x01\x00" + struct.pack("!H", len(extensions)) + extensions
    handshake = b"\x01" + len(body).to_bytes(3, "big") + body
    return b"\x16\x03\x01" + struct.pack("!H", len(handshake)) + handshake


def tcp(payload, seq, sport=50000, dport=11434, src="127.0.0.1", dst="127.0.0.1"):
    packet = Ether() / IP(src=src, dst=dst) / TCP(sport=sport, dport=dport, seq=seq, flags="PA") / payload
    packet.time = 1793350800.0
    return packet


def capture(tmp_path: Path, packets, name="capture.pcap") -> bytes:
    path = tmp_path / name
    wrpcap(str(path), packets)
    return path.read_bytes()


def http_request(body: bytes, host=b"localhost:11434", path=b"/api/chat") -> bytes:
    return b"POST " + path + b" HTTP/1.1\r\nHost: " + host + b"\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body


# ---- HAR ---------------------------------------------------------------------------------------------
def test_har_keeps_ai_requests_and_finds_secrets(client):
    data = har_file(har_entry("https://api.openai.com/v1/chat/completions", f'{{"model":"gpt-4o","input":"key {AWS}"}}'),
                    har_entry("https://example.com/analytics", f"key {AWS}"))
    result = upload(client, "session.har", data).json()
    assert result["format"] == "har" and result["events_created"] == 1 and result["ai_requests"] == 1 and result["findings_created"] >= 1
    event = db.list_events()[0][0]
    assert event["source"] == "har" and event["dest"]["ip"] == "2606:4700::1" and event["model"] == "gpt-4o"
    assert event["ts"] == "2026-10-30T09:00:00Z" and AWS not in json.dumps(event)


def test_har_decodes_base64_responses():
    from app.ingest.har import _response_text
    assert _response_text({"text": base64.b64encode(b"hi").decode(), "encoding": "base64"}) == "hi"
    assert _response_text({"text": "!!", "encoding": "base64"}) is None


def test_har_skips_entries_without_a_url(client):
    data = har_file(har_entry("https://api.openai.com/v1/chat/completions"), {"request": {}}, "junk")
    result = upload(client, "x.har", data).json()
    assert result["events_created"] == 1 and "2 HAR entries" in result["warnings"][0]


def test_bad_har_is_rejected(client):
    assert upload(client, "x.har", b"{not json").status_code == 400
    response = upload(client, "x.har", b'{"log": {}}')
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_file"


def test_har_named_json_is_recognised(client):
    data = har_file(har_entry("https://api.anthropic.com/v1/messages", "hello"))
    assert upload(client, "export.json", data).json()["format"] == "har"


# ---- JSON / JSONL ------------------------------------------------------------------------------------
def test_jsonl_with_lenient_keys(client):
    lines = [
        {"url": "https://api.openai.com/v1/chat/completions", "messages": [{"role": "user", "content": f"key {AWS}"}], "timestamp": 1793350800},
        {"endpoint": "https://api.groq.com/openai/v1/chat/completions", "prompt": "hello", "process_name": "worker", "ts": "2026-10-30T09:00:00Z"},
        {"url": "http://localhost:11434/api/generate", "request_body": "hi", "time": 1793350800000},
    ]
    data = "\n".join(json.dumps(line) for line in lines).encode()
    result = upload(client, "agent.jsonl", data).json()
    assert result["format"] == "jsonl" and result["events_created"] == 3 and result["ai_requests"] == 3
    providers = {event["provider"]["id"] for event in db.list_events()[0]}
    assert providers == {"openai", "groq", "ollama"}
    assert db.get_inventory("worker") is not None


def test_jsonl_warns_about_bad_lines(client):
    data = b'{"url":"https://api.openai.com/v1/responses","input":"x"}\nnot json\n[1]\n'
    result = upload(client, "a.jsonl", data).json()
    assert result["events_created"] == 1 and "2 lines" in result["warnings"][0]


def test_json_array_and_wrapped_records(client):
    record = {"url": "https://api.openai.com/v1/responses", "input": "x"}
    assert upload(client, "a.json", json.dumps([record, record]).encode()).json()["events_created"] == 2
    assert upload(client, "b.json", json.dumps({"logs": [record]}).encode()).json()["events_created"] == 1
    assert upload(client, "c.json", json.dumps(record).encode()).json()["format"] == "json"


def test_jsonl_with_nothing_usable_is_rejected(client):
    assert upload(client, "a.jsonl", b"nope\nnope\n").status_code == 400


# ---- Text logs -----------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", ["app.log", "notes.txt"])
def test_text_log_with_a_secret_is_kept(client, name):
    result = upload(client, name, f"2026 user pasted {AWS}\n".encode()).json()
    assert result["format"] == "log" and result["events_created"] == 1 and result["ai_requests"] == 0 and result["findings_created"] == 1
    assert db.list_events()[0][0]["provider"] is None


def test_clean_text_log_creates_nothing(client):
    assert upload(client, "app.log", b"all good\n").json()["events_created"] == 0


# ---- Upload limits -------------------------------------------------------------------------------------
def test_unsupported_and_empty_uploads(client):
    assert upload(client, "a.exe", b"MZ").status_code == 400
    assert upload(client, "a.log", b"  \n").status_code == 400
    assert upload(client, "noext", b"x").status_code == 400


def test_oversized_upload(client, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    response = upload(client, "a.log", b"x" * 11)
    assert response.status_code == 413 and response.json()["error"]["code"] == "payload_too_large"


def test_file_name_path_is_stripped(client):
    assert upload(client, "../../etc/a.log", b"AKIAFAKEFAKEFAKE1234").json()["file_name"] == "a.log"


# ---- PCAP ----------------------------------------------------------------------------------------------
def test_pcap_plain_http_payload(client, tmp_path):
    body = json.dumps({"model": "llama3.2:3b", "messages": [{"content": f"key {AWS}"}]}).encode()
    data = capture(tmp_path, [tcp(http_request(body), 1), tcp(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok", 900, 11434, 50000)])
    result = upload(client, "demo.pcap", data).json()
    assert result["format"] == "pcap" and result["events_created"] == 1 and result["ai_requests"] == 1 and result["warnings"] == []
    event = db.list_events()[0][0]
    assert event["provider"]["id"] == "ollama" and event["source"] == "pcap" and event["dest"]["path"] == "/api/chat"
    assert event["model"] == "llama3.2:3b" and event["bytes_in"] == 2 and event["ts"].startswith("2026-")
    assert any(f["subtype"] == "aws_access_key" for f in db.list_findings()[0]) and AWS not in json.dumps(event)


def test_pcap_segments_out_of_order_with_retransmit(client, tmp_path):
    message = http_request(f"key {AWS}".encode())
    first, second = message[:40], message[40:]
    packets = [tcp(second, 41), tcp(first, 1), tcp(first, 1), tcp(second[:10], 41)]
    upload(client, "a.pcap", capture(tmp_path, packets))
    assert any(f["subtype"] == "aws_access_key" for f in db.list_findings()[0])


def test_reassemble_handles_overlap():
    assert pcap.reassemble({100: b"abcd", 102: b"cdef"}) == b"abcdef"
    assert pcap.reassemble({100: b"abcdef", 101: b"bc"}) == b"abcdef"
    assert pcap.reassemble({}) == b""


def test_pcap_keep_alive_and_chunked(client, tmp_path):
    first = http_request(b"one")
    second = b"POST /api/chat HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n\r\n3\r\ntwo\r\n0\r\n\r\n"
    result = upload(client, "a.pcap", capture(tmp_path, [tcp(first + second, 1)])).json()
    assert result["events_created"] == 2


def test_host_header_identifies_the_mock_provider_target(client, tmp_path):
    message = http_request(b"hi", host=b"api.openai.com", path=b"/v1/chat/completions")
    upload(client, "a.pcap", capture(tmp_path, [tcp(message, 1, dport=8788)]))
    assert db.list_events()[0][0]["provider"]["id"] == "openai"


def test_pcap_tls_gives_hostname_only(client, tmp_path):
    packets = [tcp(client_hello("api.anthropic.com", b"\x01" * 32), 1, dport=443, dst="160.79.104.10"),
               tcp(client_hello("example.com"), 1, sport=50001, dport=443, dst="93.184.216.34")]
    result = upload(client, "a.pcap", capture(tmp_path, packets)).json()
    assert result["events_created"] == 1 and result["warnings"] == [pcap.TLS_WARNING]
    event = db.list_events()[0][0]
    assert event["provider"]["id"] == "anthropic" and event["dest"]["protocol"] == "tls"
    assert event["payload_visible"] is False and event["dest"]["ip"] == "160.79.104.10"


def test_pcapng_and_ipv6(client, tmp_path):
    path = tmp_path / "a.pcapng"
    packet = Ether() / IPv6(src="::1", dst="::1") / TCP(sport=50000, dport=11434, seq=1, flags="PA") / http_request(b"hi", host=b"[::1]:11434")
    with PcapNgWriter(str(path)) as writer:
        writer.write(packet)
    result = upload(client, "a.pcapng", path.read_bytes()).json()
    assert result["format"] == "pcap" and result["ai_requests"] == 1


@pytest.mark.parametrize("data", [b"", b"\x16", b"\x16\x03\x01\x00\x10\x01" + b"\x00" * 40, client_hello("x.com")[:60], b"\x16\x03\x01" + b"\xff" * 100])
def test_sni_parser_survives_bad_input(data):
    assert pcap.parse_sni(data) in (None, "x.com")


def test_sni_parser_reads_a_valid_hello():
    assert pcap.parse_sni(client_hello("api.openai.com")) == "api.openai.com"


def test_corrupt_pcap_is_rejected(client):
    assert upload(client, "a.pcap", b"this is not a capture").status_code == 400
    response = upload(client, "a.pcap", b"\xd4\xc3\xb2\xa1" + b"\x00" * 3)
    assert response.status_code == 400


def test_parse_rejects_unknown_type_directly():
    with pytest.raises(IngestError):
        ingest_router.parse("a.bin", b"x")
