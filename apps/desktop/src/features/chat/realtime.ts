import { type ClientEvent, parseServerEvent } from "@aura/shared";
import { loadAppearance } from "@/features/customize/appearance";
import { loadCustomize } from "@/features/customize/customize-view";
import { showNotification } from "@/features/devices/push";
import { NeedsPairingError, resetSession, wsUrl } from "@/lib/api";
import { loadTasks, refreshProjectsSoon, reportError, resync } from "./actions";
import { appendDelta, getState, removeMessage, setState, upsertChat, upsertMessage } from "./store";

const PING_MS = 15_000;
const RECONNECT_MS = 2_000;

/** Keeps one WebSocket open, applies server events to the store and resyncs after reconnects. */
export function startRealtime(): () => void {
  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let failures = 0;

  const connect = async () => {
    setState(() => ({ connection: "connecting" }));
    try {
      const url = await wsUrl();
      // The effect may have been disposed while the session was being fetched.
      if (disposed) return;
      ws = new WebSocket(url);
    } catch (error) {
      reportError(error);
      if (error instanceof NeedsPairingError) return;
      scheduleReconnect();
      return;
    }

    ws.onmessage = (raw) => {
      const event = parseServerEvent(String(raw.data));
      if (!event) return;
      switch (event.type) {
        case "hello":
          failures = 0;
          setState(() => ({ connection: "open", serverVersion: event.serverVersion }));
          void resync().catch(reportError);
          pingTimer = setInterval(
            () => send({ type: "ping", nonce: crypto.randomUUID() }),
            PING_MS,
          );
          break;
        case "message.created":
        case "message.updated":
          upsertMessage(event.message);
          if (event.message.usage) refreshProjectsSoon();
          if (event.message.card?.type === "task") {
            const projectId = getState().chats[event.message.chatId]?.projectId;
            if (projectId) void loadTasks(projectId).catch(reportError);
          }
          break;
        case "message.deleted":
          removeMessage(event.chatId, event.messageId);
          break;
        case "message.delta":
          appendDelta(event.messageId, event.text);
          break;
        case "chat.updated":
          upsertChat(event.chat);
          if (event.chat.projectId) refreshProjectsSoon();
          break;
        case "customize.updated":
          void loadAppearance().catch(reportError);
          void loadCustomize().catch(reportError);
          break;
        case "notification":
          showNotification(event);
          break;
        case "pong":
          break;
      }
    };

    ws.onclose = () => {
      clearInterval(pingTimer);
      if (disposed) return;
      failures += 1;
      // A rejected upgrade (e.g. stale token after a server restart) also lands here.
      if (failures > 1) resetSession();
      setState(() => ({ connection: "closed" }));
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (!disposed) reconnectTimer = setTimeout(() => void connect(), RECONNECT_MS);
  };

  const send = (event: ClientEvent) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  };

  void connect();
  return () => {
    disposed = true;
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    ws?.close();
  };
}
