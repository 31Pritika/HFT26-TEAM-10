import { API_BASE, probeEngine, isDemoModeForced } from "./api";
import { useAppStore } from "./store";
import type { StreamMessage } from "./types";

const WS_URL = `${API_BASE.replace(/^http/, "ws")}/ws/stream`;
const MAX_BACKOFF_MS = 30_000;

/** Subscribes to the live stream, or the mock stream in demo mode. Returns an unsubscribe function. */
export function connectStream(onMessage?: (message: StreamMessage) => void): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let stopMock: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout>;
  let backoff = 1000;

  const handleMessage = (msg: StreamMessage) => {
    // 1. Update the Zustand store
    const store = useAppStore.getState();
    if (msg.type === "event") {
      store.addEvent(msg.data);
    } else if (msg.type === "finding") {
      store.addFinding(msg.data);
    } else if (msg.type === "stats") {
      store.updateStats(msg.data);
    } else if (msg.type === "collector") {
      store.setCollectorStatus(msg.data.name, msg.data.running, msg.data.reason);
    }

    // 2. Call external callback if registered
    onMessage?.(msg);
  };

  const openLive = () => {
    try {
      socket = new WebSocket(WS_URL);
      socket.onopen = () => {
        backoff = 1000;
        useAppStore.getState().setEngineStatus("live");
      };
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as StreamMessage;
          handleMessage(parsed);
        } catch (err) {
          console.error("Failed to parse websocket message:", err);
        }
      };
      socket.onclose = () => {
        if (closed) return;
        useAppStore.getState().setEngineStatus("connecting");
        retryTimer = setTimeout(openLive, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      };
      socket.onerror = () => {
        // Fall back to mock stream if socket fails
        if (!closed && !stopMock) {
          import("./mock/stream").then(({ startMockStream }) => {
            if (!closed && !stopMock) {
              useAppStore.getState().setEngineStatus("demo");
              stopMock = startMockStream(handleMessage);
            }
          });
        }
      };
    } catch {
      // In case of error opening WebSocket
      useAppStore.getState().setEngineStatus("demo");
    }
  };

  const init = async () => {
    if (closed) return;
    const manualDemo = useAppStore.getState().demoModeOverride;
    const forced = isDemoModeForced();

    if (forced || manualDemo === true) {
      useAppStore.getState().setEngineStatus("demo");
      const { startMockStream } = await import("./mock/stream");
      if (!closed) stopMock = startMockStream(handleMessage);
      return;
    }

    const live = await probeEngine();
    if (closed) return;

    if (live) {
      useAppStore.getState().setEngineStatus("live");
      openLive();
    } else {
      useAppStore.getState().setEngineStatus("demo");
      const { startMockStream } = await import("./mock/stream");
      if (!closed) stopMock = startMockStream(handleMessage);
    }
  };

  void init();

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    if (socket) {
      socket.close();
      socket = null;
    }
    stopMock?.();
  };
}
