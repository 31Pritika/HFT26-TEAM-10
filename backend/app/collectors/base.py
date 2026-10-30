"""Collector base class. A collector can fail or lack permission, but it can never take the app down."""
from __future__ import annotations

import logging
import threading
from abc import ABC, abstractmethod

from ..bus import bus

log = logging.getLogger("shadowscope.collectors")
STOP_TIMEOUT_S = 3


class Collector(ABC):
    name: str
    interval: float = 2.0

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._state = {"enabled": False, "running": False, "reason": "Not started"}

    def unavailable_reason(self) -> str | None:
        """Why this collector cannot run here, or None. Called once before starting."""
        return None

    @abstractmethod
    def poll(self) -> None:
        """One unit of work. Raising is fine: the error is reported and the next run still happens."""

    def run(self) -> None:
        while not self._stop.is_set():
            try:
                self.poll()
            except Exception as error:
                log.exception("%s failed", self.name)
                self.report(running=False, reason=f"{type(error).__name__}: {error}"[:200])
            self._stop.wait(self.interval)

    def start(self) -> None:
        try:
            reason = self.unavailable_reason()
        except Exception as error:
            log.exception("%s probe failed", self.name)
            reason = f"{type(error).__name__}: {error}"[:200]
        if reason:
            self._set(enabled=False, running=False, reason=reason)
            return
        self._stop.clear()
        self._set(enabled=True, running=True, reason=None)
        self._thread = threading.Thread(target=self._guarded_run, name=f"collector-{self.name}", daemon=True)
        self._thread.start()

    def _guarded_run(self) -> None:
        try:
            self.run()
        except Exception as error:
            log.exception("%s stopped", self.name)
            self._set(enabled=True, running=False, reason=f"{type(error).__name__}: {error}"[:200])

    def disable(self, reason: str) -> None:
        """Marks this collector as deliberately not started."""
        self._set(enabled=False, running=False, reason=reason)

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(STOP_TIMEOUT_S)
            self._thread = None
        if self._state["enabled"]:
            self._set(enabled=True, running=False, reason="Stopped")

    def status(self) -> dict:
        return dict(self._state)

    def report(self, running: bool = True, reason: str | None = None) -> None:
        """Updates health while running. `reason` with running=True means working in a reduced mode."""
        self._set(enabled=True, running=running, reason=reason)

    def _set(self, enabled: bool, running: bool, reason: str | None) -> None:
        state = {"enabled": enabled, "running": running, "reason": reason}
        if state != self._state:
            self._state = state
            bus.publish({"type": "collector", "data": {"name": self.name, **state}})
