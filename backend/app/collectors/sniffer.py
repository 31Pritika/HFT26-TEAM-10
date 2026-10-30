"""Shared packet capture. Packets are queued so slow analysis never stalls the capture thread."""
from __future__ import annotations

import logging
import queue
import time
from abc import abstractmethod
from dataclasses import dataclass
from typing import Any

from .base import Collector

log = logging.getLogger("shadowscope.collectors")
NEEDS_ROOT = "Needs packet capture permission (sudo on macOS and Linux, Npcap on Windows)"
PROBE_TIMEOUT_S = 0.05
QUEUE_SIZE = 20_000
TICK_S = 0.5


@dataclass(frozen=True)
class Segment:
    src: str
    sport: int
    dst: str
    dport: int
    seq: int
    fin_or_rst: bool
    payload: bytes


def tcp_segment(packet: Any) -> Segment | None:
    from scapy.layers.inet import IP, TCP
    from scapy.layers.inet6 import IPv6

    network = packet.getlayer(IP) or packet.getlayer(IPv6)
    if network is None or not packet.haslayer(TCP):
        return None
    tcp = packet[TCP]
    return Segment(network.src, int(tcp.sport), network.dst, int(tcp.dport), int(tcp.seq), bool(int(tcp.flags) & 0x05), bytes(tcp.payload))


def _is_permission_problem(error: Exception) -> bool:
    text = str(error).lower()
    return isinstance(error, PermissionError) or any(hint in text for hint in ("permission", "not permitted", "npcap", "winpcap", "libpcap"))


class Sniffer(Collector):
    bpf_filter: str | None = None

    def __init__(self) -> None:
        super().__init__()
        self._queue: queue.Queue = queue.Queue(QUEUE_SIZE)
        self.dropped = 0

    @abstractmethod
    def interface(self) -> str:
        ...

    @abstractmethod
    def extract(self, packet: Any) -> Any | None:
        """Runs on the capture thread, so it only pulls out the fields needed. None skips the packet."""

    @abstractmethod
    def handle(self, item: Any) -> None:
        ...

    def tick(self) -> None:
        """Called regularly for time-based work."""

    def poll(self) -> None:  # Sniffers use run() instead.
        raise NotImplementedError

    def unavailable_reason(self) -> str | None:
        try:
            from scapy.sendrecv import sniff
        except ImportError:
            return "scapy is not installed"
        try:
            sniff(iface=self.interface(), filter=self.bpf_filter, timeout=PROBE_TIMEOUT_S, store=False)
            return None
        except Exception as error:
            if _is_permission_problem(error):
                return NEEDS_ROOT
            log.warning("%s: BPF filter failed (%s), filtering in Python", self.name, error)
        self.bpf_filter = None
        try:
            sniff(iface=self.interface(), timeout=PROBE_TIMEOUT_S, store=False)
            return None
        except Exception as error:
            return NEEDS_ROOT if _is_permission_problem(error) else f"{type(error).__name__}: {error}"[:200]

    def _capture(self, packet: Any) -> None:
        try:
            item = self.extract(packet)
            if item is not None:
                self._queue.put_nowait(item)
        except queue.Full:
            self.dropped += 1
        except Exception:
            log.exception("%s could not read a packet", self.name)

    def run(self) -> None:
        from scapy.sendrecv import AsyncSniffer

        sniffer = AsyncSniffer(iface=self.interface(), filter=self.bpf_filter, prn=self._capture, store=False)
        sniffer.start()
        last_tick = time.monotonic()
        try:
            while not self._stop.is_set():
                try:
                    self.handle(self._queue.get(timeout=TICK_S))
                except queue.Empty:
                    pass
                except Exception as error:
                    log.exception("%s could not process a packet", self.name)
                    self.report(reason=f"Last error: {type(error).__name__}")
                if time.monotonic() - last_tick >= TICK_S:
                    last_tick = time.monotonic()
                    self.tick()
                    if not sniffer.running:
                        raise RuntimeError(f"Capture stopped: {sniffer.exception or 'unknown reason'}")
        finally:
            try:
                sniffer.stop(join=False)
            except Exception:
                pass
