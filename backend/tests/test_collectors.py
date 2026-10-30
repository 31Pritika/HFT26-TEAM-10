import asyncio
import threading

import pytest

from app import collectors
from app.bus import bus
from app.collectors.base import Collector


class Sample(Collector):
    name = "sample"
    interval = 0.01

    def __init__(self, reason=None, failures=0):
        super().__init__()
        self.reason, self.failures, self.polls = reason, failures, 0
        self.polled = threading.Event()

    def unavailable_reason(self):
        if isinstance(self.reason, Exception):
            raise self.reason
        return self.reason

    def poll(self):
        self.polls += 1
        if self.polls <= self.failures:
            raise RuntimeError("boom")
        self.report()
        self.polled.set()


def test_runs_and_stops():
    collector = Sample()
    collector.start()
    assert collector.polled.wait(1)
    assert collector.status() == {"enabled": True, "running": True, "reason": None}
    collector.stop()
    assert collector.status() == {"enabled": True, "running": False, "reason": "Stopped"}


def test_missing_permission_disables_with_reason():
    collector = Sample(reason="Needs root")
    collector.start()
    assert collector.status() == {"enabled": False, "running": False, "reason": "Needs root"}
    assert collector.polls == 0


def test_probe_that_raises_does_not_escape():
    collector = Sample(reason=PermissionError("denied"))
    collector.start()
    assert collector.status()["enabled"] is False and "denied" in collector.status()["reason"]


def test_poll_error_is_reported_then_recovers():
    collector = Sample(failures=3)
    collector.start()
    assert collector.polled.wait(1)
    assert collector.status()["running"] is True and collector.polls > 3
    collector.stop()


def test_state_changes_reach_the_stream():
    async def run():
        bus.bind(asyncio.get_running_loop())
        queue = bus.subscribe()
        try:
            collector = Sample(reason="Needs root")
            await asyncio.to_thread(collector.start)
            return await asyncio.wait_for(queue.get(), 1)
        finally:
            bus.unsubscribe(queue)

    message = asyncio.run(run())
    assert message == {"type": "collector", "data": {"name": "sample", "enabled": False, "running": False, "reason": "Needs root"}}


def test_registry_reports_every_collector():
    assert set(collectors.status()) == {"process_conn", "ip_cache", "dns_sni", "loopback", "agent_watch", "gateway"}
    assert {item["name"] for item in collectors.summary()} == set(collectors.status())


@pytest.mark.parametrize("uid_env", [None])
def test_database_is_left_alone_without_sudo(uid_env, tmp_path, monkeypatch):
    from app import db
    calls = []
    monkeypatch.setattr("os.chown", lambda *args: calls.append(args), raising=False)
    monkeypatch.delenv("SUDO_UID", raising=False)
    db._return_to_sudo_user(tmp_path / "x.db")
    assert calls == []


def test_database_goes_back_to_the_sudo_user(tmp_path, monkeypatch):
    from app import db
    calls = []
    monkeypatch.setattr("os.chown", lambda *args: calls.append(args), raising=False)
    monkeypatch.setattr("os.geteuid", lambda: 0, raising=False)
    monkeypatch.setenv("SUDO_UID", "501")
    monkeypatch.setenv("SUDO_GID", "20")
    db._return_to_sudo_user(tmp_path / "x.db")
    assert calls == [(tmp_path, 501, 20), (tmp_path / "x.db", 501, 20)]


# ---- ip_cache ------------------------------------------------------------------------------------------
from app.collectors import activity, ip_cache, process_conn  # noqa: E402
from app.fingerprints import matcher  # noqa: E402


def test_only_concrete_remote_hosts_are_resolved():
    hosts = [host for _, host in ip_cache.provider_hosts()]
    assert "api.openai.com" in hosts and "localhost" not in hosts and not any("*" in host for host in hosts)


def test_cache_confidence():
    cache = ip_cache.build_cache([("openai", {"8.8.8.8", "9.9.9.9"}), ("groq", {"9.9.9.9"}), ("anthropic", {"104.18.1.1"})])
    assert cache["8.8.8.8"] == ("openai", 0.8)
    assert cache["9.9.9.9"][1] == 0.6
    assert cache["104.18.1.1"] == ("anthropic", 0.6)


def test_offline_keeps_the_previous_cache(monkeypatch):
    matcher.set_ip_cache({"8.8.8.8": ("openai", 0.8)})
    monkeypatch.setattr(ip_cache, "resolve", lambda host: set())
    collector = ip_cache.IpCache()
    collector.poll()
    assert matcher.match(host="8.8.8.8", ip="8.8.8.8", port=443) is not None
    assert "Could not resolve" in collector.status()["reason"]
    matcher.set_ip_cache({})


def test_partial_failure_is_reported(monkeypatch):
    monkeypatch.setattr(ip_cache, "resolve", lambda host: {"8.8.8.8"} if host == "api.openai.com" else set())
    collector = ip_cache.IpCache()
    collector.poll()
    assert "did not resolve" in collector.status()["reason"]
    matcher.set_ip_cache({})


# ---- process_conn --------------------------------------------------------------------------------------
LSOF = r"""COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
Google\x20Chrome 501 v 20u IPv4 0x1 0t0 TCP 192.168.1.5:50000->104.18.1.1:443 (ESTABLISHED)
Cursor\x20Helper\x20(Plugin) 502 v 21u IPv6 0x2 0t0 TCP [2001:db8::1]:50001->[2606:4700::1]:443 (ESTABLISHED)
curl 503 v 5u IPv4 0x3 0t0 TCP 127.0.0.1:50002->127.0.0.1:11434 (ESTABLISHED)
ollama 504 v 3u IPv4 0x4 0t0 TCP 127.0.0.1:11434 (LISTEN)
mDNSResponder 505 v 7u IPv4 0x5 0t0 UDP *:5353
notes 506 v 8u IPv4 0x6 0t0 TCP 192.168.1.5:50003->8.8.8.8:443 (CLOSE_WAIT)
"""
CONN = process_conn.Connection


def test_lsof_parsing():
    assert process_conn.parse_lsof(LSOF) == [
        CONN(501, "Google Chrome", 50000, "104.18.1.1", 443),
        CONN(502, "Cursor Helper (Plugin)", 50001, "2606:4700::1", 443),
        CONN(503, "curl", 50002, "127.0.0.1", 11434),
    ]


@pytest.fixture
def known_ip():
    matcher.set_ip_cache({"8.8.8.8": ("openai", 0.8)})
    activity.clear()
    yield
    matcher.set_ip_cache({})
    activity.clear()


def test_new_ai_connection_is_reported_once_then_every_minute(known_ip):
    collector = process_conn.ProcessConn()
    connection = CONN(999999, "python3", 50000, "8.8.8.8", 443)
    first = collector.scan([connection], 0)
    assert len(first) == 1 and first[0]["source"] == "live_conn" and first[0]["dest"]["host"] == "api.openai.com"
    assert first[0]["meta"]["provider_id"] == "openai"
    assert collector.scan([connection], 30) == []
    assert len(collector.scan([connection], 60)) == 1


def test_many_sockets_to_one_provider_are_one_report(known_ip):
    collector = process_conn.ProcessConn()
    sockets = [CONN(999999, "python3", port, "8.8.8.8", 443) for port in range(50000, 50010)]
    assert len(collector.scan(sockets, 0)) == 1


def test_reconnecting_counts_as_new(known_ip):
    collector = process_conn.ProcessConn()
    connection = CONN(999999, "python3", 50000, "8.8.8.8", 443)
    collector.scan([connection], 0)
    collector.scan([], 2)
    assert len(collector.scan([connection], 4)) == 1


def test_unrelated_and_own_traffic_is_ignored(known_ip):
    import os
    collector = process_conn.ProcessConn()
    assert collector.scan([CONN(1, "x", 50000, "1.2.3.4", 443), CONN(os.getpid(), "me", 50001, "8.8.8.8", 443)], 0) == []


def test_a_remote_host_on_a_local_llm_port_is_not_local(known_ip):
    assert process_conn.ProcessConn().scan([CONN(1, "x", 50000, "1.2.3.4", 1234)], 0) == []


def test_local_llm_connection_is_seen(known_ip):
    observation = process_conn.ProcessConn().scan([CONN(999999, "curl", 50000, "127.0.0.1", 11434)], 0)[0]
    assert observation["dest"]["host"] == "localhost" and observation["meta"]["provider_id"] == "ollama"


def test_lsof_is_the_fallback_when_psutil_is_denied(monkeypatch):
    import psutil
    def denied(kind):
        raise psutil.AccessDenied()
    monkeypatch.setattr(psutil, "net_connections", denied)
    monkeypatch.setattr(process_conn, "lsof_connections", lambda: [CONN(1, "x", 1, "1.2.3.4", 443)])
    connections, reason = process_conn.ProcessConn()._snapshot()
    assert len(connections) == 1 and "lsof" in reason


def test_command_lines_are_masked(monkeypatch):
    import psutil
    class Fake:
        def __init__(self, pid): pass
        def name(self): return "python3"
        def exe(self): return "/usr/bin/python3"
        def username(self): return "dev"
        def parent(self): return None
        def cmdline(self): return ["python3", "agent.py", "--key", "AKIAFAKEFAKEFAKE1234"]
    monkeypatch.setattr(psutil, "Process", Fake)
    info = process_conn.describe_process(1)
    assert "AKIAFAKEFAKEFAKE1234" not in info["cmdline_hint"] and info["name"] == "python3" and info["parent"] is None


def test_vanished_process_still_gives_a_usable_record():
    assert process_conn.describe_process(99999999, "gone")["name"] == "gone"


def test_poll_feeds_the_pipeline_and_port_owners(known_ip, monkeypatch):
    from app import db
    db.init()
    db.reset()
    collector = process_conn.ProcessConn()
    monkeypatch.setattr(collector, "_snapshot", lambda: ([CONN(999999, "python3", 50000, "8.8.8.8", 443)], "Using lsof"))
    collector.poll()
    event = db.list_events()[0][0]
    assert event["source"] == "live_conn" and event["provider"]["id"] == "openai" and event["payload_visible"] is False
    assert "bytes-unavailable" in event["tags"]
    assert activity.port_owner(50000)["name"] == "python3" and 999999 in activity.recently_active(60)
    assert collector.status()["reason"] == "Using lsof"


# ---- sniffers ------------------------------------------------------------------------------------------

from app.collectors import dns_sni, loopback, sniffer  # noqa: E402
from app.collectors.sniffer import Segment  # noqa: E402
from app.ingest import pcap  # noqa: E402
from tests.test_ingest import client_hello, http_request  # noqa: E402


def test_no_permission_gives_a_clear_reason(monkeypatch):
    import scapy.sendrecv
    def denied(**kwargs):
        raise OSError("Permission denied: could not open /dev/bpf0")
    monkeypatch.setattr(scapy.sendrecv, "sniff", denied)
    for collector in (loopback.Loopback(), dns_sni.DnsSni()):
        collector.start()
        assert collector.status() == {"enabled": False, "running": False, "reason": sniffer.NEEDS_ROOT}


def test_filter_failure_falls_back_to_python_filtering(monkeypatch):
    import scapy.sendrecv
    calls = []
    def probe(**kwargs):
        calls.append(kwargs.get("filter"))
        if kwargs.get("filter"):
            raise ValueError("cannot compile filter")
    monkeypatch.setattr(scapy.sendrecv, "sniff", probe)
    collector = loopback.Loopback()
    assert collector.unavailable_reason() is None and collector.bpf_filter is None and calls[-1] is None


def test_packets_are_decoded_from_real_frames():
    from scapy.layers.dns import DNS, DNSQR
    from scapy.layers.inet import IP, TCP, UDP
    from scapy.layers.l2 import Loopback as LoopbackFrame
    frame = LoopbackFrame(type=2) / IP(src="127.0.0.1", dst="127.0.0.1") / TCP(sport=50000, dport=11434, seq=7, flags="FA") / b"hi"
    segment = sniffer.tcp_segment(LoopbackFrame(bytes(frame)))
    assert (segment.sport, segment.dport, segment.seq, segment.fin_or_rst, segment.payload) == (50000, 11434, 7, True, b"hi")
    query = IP(dst="1.1.1.1") / UDP(sport=5000, dport=53) / DNS(rd=1, qd=DNSQR(qname="api.openai.com"))
    assert dns_sni.DnsSni().extract(IP(bytes(query))) == ("dns", "api.openai.com.")
    answer = IP() / UDP(sport=53, dport=5000) / DNS(qr=1, qd=DNSQR(qname="api.openai.com"))
    assert dns_sni.DnsSni().extract(IP(bytes(answer))) is None


def test_full_hello_gives_the_host():
    assert dns_sni.HelloBuffer().feed(("c", 1, "s"), client_hello("api.openai.com")) == "api.openai.com"


def test_hello_split_across_packets():
    hello = client_hello("api.anthropic.com", b"\x01" * 32)
    buffer = dns_sni.HelloBuffer()
    assert buffer.feed(("c", 1, "s"), hello[:70]) is None
    assert buffer.feed(("c", 1, "s"), hello[70:]) == "api.anthropic.com"


def test_split_never_returns_a_partial_hostname():
    hello = client_hello("api.anthropic.com")
    assert all(pcap.parse_sni(hello[:cut]) in (None, "api.anthropic.com") for cut in range(len(hello)))


def test_non_hello_tls_is_ignored_and_buffer_stays_bounded():
    buffer = dns_sni.HelloBuffer()
    assert buffer.feed(("c", 1, "s"), b"\x17\x03\x03\x00\x10" + b"x" * 16) is None
    truncated = client_hello("x.com")[:50]
    for port in range(1000):
        buffer.feed(("c", port, "s"), truncated)
    assert len(buffer._pending) <= dns_sni.MAX_PENDING_HELLOS


@pytest.fixture
def empty_db():
    from app import db
    db.init()
    db.reset()
    yield db


def test_dns_and_sni_become_events_once_per_minute(empty_db):
    collector = dns_sni.DnsSni()
    collector.observe("api.openai.com.", None, 53, None, now=100)
    collector.observe("api.openai.com", "1.2.3.4", 443, 50000, now=120)
    collector.observe("api.openai.com", "1.2.3.4", 443, 50000, now=161)
    events = empty_db.list_events()[0]
    assert len(events) == 2 and {event["source"] for event in events} == {"dns_sni"} and events[0]["payload_visible"] is False


def test_unrelated_hosts_are_ignored(empty_db):
    dns_sni.DnsSni().observe("example.com", None, 53, None, now=0)
    assert empty_db.is_empty()


def segment(payload, seq, outbound=True, fin=False, port=50000):
    ends = ("127.0.0.1", port, "127.0.0.1", 11434) if outbound else ("127.0.0.1", 11434, "127.0.0.1", port)
    return Segment(*ends, seq, fin, payload)


def response(body=b"ok"):
    return b"HTTP/1.1 200 OK\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body


def test_request_and_response_are_paired():
    flows = loopback.HttpFlows()
    assert flows.feed(segment(http_request(b'{"prompt":"hi"}'), 1), 0) == []
    observation = flows.feed(segment(response(b'{"response":"yo"}'), 1, outbound=False), 1)[0]
    assert observation["source"] == "loopback" and observation["body_text"] == '{"prompt":"hi"}' and observation["response_text"] == '{"response":"yo"}'
    assert observation["dest"]["port"] == 11434 and observation["dest"]["path"] == "/api/chat" and observation["method"] == "POST"


def test_nothing_is_emitted_for_a_half_received_body():
    flows = loopback.HttpFlows()
    message = http_request(b"x" * 500)
    flows.feed(segment(message[:100], 1), 0)
    assert flows.feed(segment(response(), 1, outbound=False), 1) == []
    observation = flows.feed(segment(message[100:], 101), 2)
    assert flows.connections and observation == []


def test_out_of_order_and_retransmitted_segments():
    stream = loopback.TcpStream()
    stream.add(1, b"abc")
    stream.add(7, b"ghi")
    stream.add(4, b"def")
    stream.add(4, b"def")
    stream.add(2, b"bcd")
    assert bytes(stream.data) == b"abcdefghi"


def test_lost_packet_does_not_block_forever():
    stream = loopback.TcpStream()
    stream.add(1, b"a")
    for index in range(loopback.MAX_OUT_OF_ORDER + 1):
        stream.add(1000 + index, b"b")
    assert len(stream.data) > 1


def test_streaming_chunked_response_is_one_exchange():
    flows = loopback.HttpFlows()
    flows.feed(segment(http_request(b"hi"), 1), 0)
    head = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
    chunks = [head, b"6\r\n{\"a\":1\r\n", b"2\r\n}\n\r\n", b"0\r\n\r\n"]
    seq, results = 1, []
    for chunk in chunks:
        results.append(flows.feed(segment(chunk, seq, outbound=False), 1))
        seq += len(chunk)
    assert results[:3] == [[], [], []] and results[3][0]["response_text"] == '{"a":1}\n'


def test_keep_alive_pairs_in_order():
    flows = loopback.HttpFlows()
    first, second = http_request(b"one"), http_request(b"two")
    flows.feed(segment(first, 1), 0)
    flows.feed(segment(second, 1 + len(first)), 0)
    a = flows.feed(segment(response(b"r1"), 1, outbound=False), 1)
    b = flows.feed(segment(response(b"r2"), 1 + len(response(b"r1")), outbound=False), 1)
    assert (a[0]["body_text"], a[0]["response_text"], b[0]["body_text"], b[0]["response_text"]) == ("one", "r1", "two", "r2")


def test_interleaved_connections_stay_separate():
    flows = loopback.HttpFlows()
    flows.feed(segment(http_request(b"from-a"), 1, port=50000), 0)
    flows.feed(segment(http_request(b"from-b"), 1, port=50001), 0)
    b = flows.feed(segment(response(b"to-b"), 1, outbound=False, port=50001), 1)
    a = flows.feed(segment(response(b"to-a"), 1, outbound=False, port=50000), 1)
    assert (a[0]["body_text"], a[0]["response_text"], b[0]["body_text"], b[0]["response_text"]) == ("from-a", "to-a", "from-b", "to-b")


def test_interim_100_continue_does_not_steal_the_response():
    flows = loopback.HttpFlows()
    flows.feed(segment(http_request(b"hi"), 1), 0)
    interim = b"HTTP/1.1 100 Continue\r\n\r\n"
    assert flows.feed(segment(interim, 1, outbound=False), 1) == []
    assert flows.feed(segment(response(b"done"), 1 + len(interim), outbound=False), 2)[0]["response_text"] == "done"


def test_response_ending_at_close():
    flows = loopback.HttpFlows()
    flows.feed(segment(http_request(b"hi"), 1), 0)
    raw = b"HTTP/1.0 200 OK\r\n\r\nall of it"
    assert flows.feed(segment(raw, 1, outbound=False, fin=True), 1) == []
    assert flows.expire(1.1) == []
    assert flows.expire(2)[0]["response_text"] == "all of it"
    assert not flows.connections


def test_request_with_no_reply_is_kept_after_idle():
    flows = loopback.HttpFlows()
    flows.feed(segment(http_request(b"hi"), 1), 0)
    assert flows.expire(10) == []
    assert flows.expire(loopback.IDLE_S + 1)[0]["response_text"] is None


def test_oversized_stream_is_cut_off_but_still_scanned():
    flows = loopback.HttpFlows()
    body = b"x" * (loopback.MAX_STREAM_BYTES + 1000)
    message = b"POST /api/chat HTTP/1.1\r\nHost: localhost\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body[:loopback.MAX_STREAM_BYTES + 500]
    observation = flows.feed(segment(message, 1), 0)
    assert len(observation) == 1 and not flows.connections


def test_other_traffic_and_binary_streams_are_ignored():
    flows = loopback.HttpFlows()
    other = Segment("127.0.0.1", 50000, "127.0.0.1", 3000, 1, False, b"GET / HTTP/1.1\r\n\r\n")
    assert flows.feed(other, 0) == [] and not flows.connections
    assert flows.feed(segment(b"\x00\x01binary\r\n\r\n", 1), 0) == []
    assert not flows.connections[("127.0.0.1", 50000, "127.0.0.1", 11434)].requests.data


def test_loopback_payload_reaches_the_pipeline_with_findings(empty_db):
    collector = loopback.Loopback()
    body = b'{"model":"gemma3:4b","prompt":"mail fake.person@example.com key AKIAFAKEFAKEFAKE1234"}'
    collector.handle(segment(http_request(body, path=b"/api/generate"), 1))
    collector.handle(segment(response(b'{"response":"ok"}'), 1, outbound=False))
    event = empty_db.list_events()[0][0]
    assert event["source"] == "loopback" and event["payload_visible"] is True and event["provider"]["id"] == "ollama"
    assert event["model"] == "gemma3:4b" and "AKIAFAKEFAKEFAKE1234" not in event["payload_preview"]
    assert {f["subtype"] for f in empty_db.list_findings()[0]} >= {"aws_access_key", "email"}


def test_self_traffic_is_not_recorded(empty_db):
    collector = loopback.Loopback()
    message = b"POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\nX-ShadowScope-Self: 1\r\nContent-Length: 2\r\n\r\nhi"
    collector.handle(segment(message, 1))
    collector.handle(segment(response(), 1, outbound=False))
    assert empty_db.is_empty()


def test_pcap_upload_parser_still_handles_interim_responses():
    responses = pcap.read_http(b"HTTP/1.1 100 Continue\r\n\r\n" + response(b"r"), pcap.RESPONSE_LINE, True)
    assert [item.body for item in responses] == [b"r"]


# ---- agent_watch ---------------------------------------------------------------------------------------
import subprocess  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402

from app.collectors import agent_watch  # noqa: E402


@pytest.mark.parametrize("path,process,expected", [
    ("/Users/dev/.ssh/id_rsa", "python3", "critical"),
    ("/etc/shadow", "python3", "critical"),
    ("/Users/dev/.aws/credentials", "python3", "high"),
    ("/repo/.env", "python3", "high"),
    ("/repo/.env.example", "python3", None),
    ("/repo/src/environment.py", "python3", None),
    ("/Users/dev/Library/Google/Chrome/Default/Cookies", "python3", "high"),
    ("C:\\Users\\dev\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data", "python.exe", "high"),
    ("/Users/dev/Library/Application Support/Claude/Cookies", "Claude Helper", None),
    ("/Users/dev/Library/Application Support/Codex/Partitions/x/Cookies", "Codex (Service)", None),
    ("/Users/dev/Library/Application Support/Cursor/Cookies", "python3", None),
    ("/Users/dev/Library/Google/Chrome/Default/Cookies", "Google Chrome Helper", None),
    ("/Users/dev/Library/Google/Chrome/Default/Login Data", "Microsoft Edge", None),
    ("/Users/dev/.ssh/id_rsa", "Google Chrome", "critical"),
    ("/tmp/notes.txt", "python3", None),
])
def test_sensitive_paths(path, process, expected):
    found = agent_watch.classify_path(path, process)
    assert (found[1] if found else None) == expected


def test_shell_command_lines_are_masked():
    analysis = agent_watch.shell_analysis("python3", "sh", "sh -c 'curl -H key:AKIAFAKEFAKEFAKE1234 x'")
    assert "AKIAFAKEFAKEFAKE1234" not in str(analysis) and analysis["findings"][0]["subtype"] == "shell_spawn"


DEST = {"host": "localhost", "ip": "127.0.0.1", "port": 11434, "protocol": "tcp"}


def test_real_child_shell_is_reported_once(empty_db):
    activity.clear()
    collector = agent_watch.AgentWatch()
    me = __import__("os").getpid()
    activity.mark_active(me, {"pid": me, "name": "python3"}, DEST)
    child = subprocess.Popen(["sh", "-c", "sleep 5; true"])  # Two commands, or sh would exec straight into sleep.
    try:
        time.sleep(0.1)
        collector.poll()
        collector.poll()
    finally:
        child.kill()
        child.wait()
        activity.clear()
    findings = empty_db.list_findings()[0]
    assert [f["subtype"] for f in findings if f["subtype"] == "shell_spawn"] == ["shell_spawn"]
    session = empty_db.find_agent("python3", "unknown")
    assert session is not None and session["permissions"]["shell"]


def test_real_sensitive_open_file_is_reported(empty_db, tmp_path):
    activity.clear()
    secret_dir = tmp_path / ".aws"
    secret_dir.mkdir()
    path = secret_dir / "credentials"
    path.write_text("fake")
    script = f"import time\nf=open({str(path)!r})\ntime.sleep(5)\n"
    child = subprocess.Popen([sys.executable, "-c", script])
    try:
        time.sleep(0.4)
        activity.mark_active(child.pid, {"pid": child.pid, "name": "worker"}, DEST)
        collector = agent_watch.AgentWatch()
        collector.poll()
    finally:
        child.kill()
        child.wait()
        activity.clear()
    assert any(f["subtype"] == "sensitive_file_read" and f["severity"] == "high" for f in empty_db.list_findings()[0])


def test_gone_processes_are_forgotten_without_error(empty_db):
    activity.clear()
    activity.mark_active(99999999, {"pid": 99999999, "name": "gone"}, DEST)
    collector = agent_watch.AgentWatch()
    collector.poll()
    assert empty_db.is_empty()
    activity.clear()


# ---- Self-exclusion ------------------------------------------------------------------------------------
def test_our_own_sni_is_skipped_by_port_owner(empty_db):
    import os
    activity.clear()
    activity.set_port_owners({50000: {"pid": os.getpid(), "name": "python"}})
    dns_sni.DnsSni().observe("api.groq.com", "1.2.3.4", 443, 50000, now=0)
    assert empty_db.is_empty()
    activity.clear()


def test_our_own_dns_lookups_are_skipped_during_triage(empty_db):
    activity.clear()
    activity.expect_own_traffic(("api.groq.com",), 30)
    collector = dns_sni.DnsSni()
    collector.observe("api.groq.com.", None, 53, None, now=0)
    assert empty_db.is_empty()
    activity.clear()
    collector.observe("api.groq.com.", None, 53, None, now=100)
    assert empty_db.table_count("events") == 1
