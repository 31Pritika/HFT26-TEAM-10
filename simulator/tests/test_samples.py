"""Sample files: reproducible, in the shape Part A's ingest parsers read, and carrying what the demo needs."""
import json
import pathlib
import struct

import pytest

from shadowscope_detect import scan_text
from simulator import fakes, make_samples

COMMITTED = pathlib.Path(make_samples.__file__).parent / "samples"


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    directory = tmp_path_factory.mktemp("samples")
    make_samples.write_all(directory)
    return directory


@pytest.mark.parametrize("name", ["demo.har", "agent_session.jsonl", "leaky.log", "demo.pcap"])
def test_committed_samples_match_a_fresh_build(built, name):
    assert (built / name).read_bytes() == (COMMITTED / name).read_bytes()


def test_har_has_the_fields_ingest_reads(built):
    entries = json.loads((built / "demo.har").read_text())["log"]["entries"]
    assert len(entries) == 14
    for entry in entries:
        assert entry["startedDateTime"] and entry["request"]["method"] == "POST"
        assert entry["request"]["postData"]["text"] and entry["response"]["content"]["text"]
        assert entry["request"]["url"].startswith(("https://", "http://localhost"))


def test_har_never_names_the_mock_as_the_real_port(built):
    urls = [e["request"]["url"] for e in json.loads((built / "demo.har").read_text())["log"]["entries"]]
    assert "https://api.openai.com/v1/chat/completions" in urls


def test_jsonl_is_the_rogue_session(built):
    records = [json.loads(line) for line in (built / "agent_session.jsonl").read_text().splitlines()]
    assert len(records) == 9
    assert all({"ts", "url", "body", "response", "process"} <= set(record) for record in records)
    assert "tool_calls" in records[0]["response"]


def test_log_holds_secrets_and_pii(built):
    found = {f["subtype"] for f in scan_text((built / "leaky.log").read_text())["findings"]}
    assert {"openai_key", "db_connection_url", "jwt", "pan", "aadhaar", "email", "phone_in", "credit_card"} <= found


def test_client_hello_carries_the_server_name():
    hello = make_samples.client_hello("api.groq.com")
    assert hello[0] == 0x16 and hello[5] == 0x01
    assert struct.unpack("!H", hello[3:5])[0] == len(hello) - 5
    assert hello.endswith(b"api.groq.com")


def test_pcap_has_http_on_loopback_ports_and_sni_on_443(built):
    rdpcap = pytest.importorskip("scapy.utils").rdpcap
    from scapy.layers.inet import IP, TCP
    packets = rdpcap(str(built / "demo.pcap"))
    ports = {packet[TCP].dport for packet in packets if packet[TCP].flags == "S"}
    assert {8788, 11434, 443} <= ports
    assert all(packet[IP].dst == "127.0.0.1" for packet in packets if packet[TCP].dport in (8788, 11434))
    payload = b"".join(bytes(packet[TCP].payload) for packet in packets if packet[TCP].dport == 443)
    assert all(host.encode() in payload for host in ("api.openai.com", "huggingface.co"))


def test_pcap_uses_documentation_addresses_for_remote_hosts(built):
    rdpcap = pytest.importorskip("scapy.utils").rdpcap
    from scapy.layers.inet import IP
    assert {p[IP].dst for p in rdpcap(str(built / "demo.pcap")) if p[IP].dst.startswith("203.")}


@pytest.mark.parametrize("name", ["demo.har", "agent_session.jsonl", "leaky.log"])
def test_samples_only_use_known_fakes(built, name):
    text = (built / name).read_text()
    assert fakes.AWS_ACCESS_KEY in text or fakes.OPENAI_KEY in text
    assert "@gmail.com" not in text
