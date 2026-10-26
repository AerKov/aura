import { type ClientEvent, parseServerEvent } from "@crew/shared";
import { useEffect, useState } from "react";
import { WS_URL } from "@/lib/api";

export type RealtimeState =
  | { kind: "connecting" }
  | { kind: "open"; serverVersion: string; latencyMs: number | null }
  | { kind: "closed" };

const PING_MS = 5_000;
const RECONNECT_MS = 2_000;

/** Keeps one WebSocket to the server open, reconnecting on close, and measures ping latency. */
export function useRealtime(): RealtimeState {
  const [state, setState] = useState<RealtimeState>({ kind: "connecting" });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const pending = new Map<string, number>();

    const connect = () => {
      setState({ kind: "connecting" });
      ws = new WebSocket(WS_URL);

      ws.onmessage = (message) => {
        const event = parseServerEvent(String(message.data));
        if (!event) return;
        if (event.type === "hello") {
          setState({ kind: "open", serverVersion: event.serverVersion, latencyMs: null });
          ping();
          pingTimer = setInterval(ping, PING_MS);
        } else if (event.type === "pong") {
          const sentAt = pending.get(event.nonce);
          pending.delete(event.nonce);
          if (sentAt === undefined) return;
          const latencyMs = Math.round(performance.now() - sentAt);
          setState((prev) => (prev.kind === "open" ? { ...prev, latencyMs } : prev));
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        pending.clear();
        if (disposed) return;
        setState({ kind: "closed" });
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };
    };

    const ping = () => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      const event: ClientEvent = { type: "ping", nonce: crypto.randomUUID() };
      pending.set(event.nonce, performance.now());
      ws.send(JSON.stringify(event));
    };

    connect();
    return () => {
      disposed = true;
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return state;
}
