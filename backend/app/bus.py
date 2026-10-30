"""In-process pub/sub: anything can publish, each WebSocket client has its own queue."""
from __future__ import annotations

import asyncio
import threading

QUEUE_SIZE = 1000


class Bus:
    def __init__(self) -> None:
        self._queues: set[asyncio.Queue] = set()
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    @property
    def has_subscribers(self) -> bool:
        with self._lock:
            return bool(self._queues)

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        with self._lock:
            self._queues.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        with self._lock:
            self._queues.discard(queue)

    def publish(self, message: dict) -> None:
        """Safe from any thread. Does nothing until the server loop is running."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            if threading.current_thread() is threading.main_thread() and asyncio._get_running_loop() is loop:
                self._fan_out(message)
            else:
                loop.call_soon_threadsafe(self._fan_out, message)
        except RuntimeError:
            pass

    def _fan_out(self, message: dict) -> None:
        with self._lock:
            queues = list(self._queues)
        for queue in queues:
            if queue.full():  # A slow client loses its oldest messages, never blocks the pipeline.
                queue.get_nowait()
            queue.put_nowait(message)


bus = Bus()
