import { API_BASE, probeEngine } from "./api";
import type { StreamMessage } from "./types";

const WS_URL = `${API_BASE.replace(/^http/, "ws")}/ws/stream`;
const MAX_BACKOFF_MS = 30_000;

/** Subscribes to the live stream, or the mock stream in demo mode. Returns an unsubscribe function. */
export function connectStream(onMessage: (message: StreamMessage) => void): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let stopMock: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout>;
  let backoff = 1000;

  const open = () => {
    socket = new WebSocket(WS_URL);
    socket.onopen = () => (backoff = 1000);
    socket.onmessage = (message) => onMessage(JSON.parse(message.data) as StreamMessage);
    socket.onclose = () => {
      if (closed) return;
      retryTimer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };
  };

  void probeEngine().then(async (live) => {
    if (closed) return;
    if (live) return open();
    const { startMockStream } = await import("./mock/stream");
    if (!closed) stopMock = startMockStream(onMessage);
  });

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    socket?.close();
    stopMock?.();
  };
}
