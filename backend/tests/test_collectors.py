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
