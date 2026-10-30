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
