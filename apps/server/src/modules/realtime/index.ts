import { parseClientEvent, type ServerEvent, WS_PATH } from "@crew/shared";
import { Elysia, t } from "elysia";
import { SERVER_VERSION } from "../../config";
import { log } from "../../lib/log";
import type { LocalSessions } from "../auth/sessions";
import type { EventHub } from "./hub";

export interface RealtimeDeps {
  sessions: LocalSessions;
  hub: EventHub;
}

/** Single WebSocket endpoint for server-to-client events (docs/SPEC.md section 6). */
export const realtimeModule = ({ sessions, hub }: RealtimeDeps) => {
  const unsubscribers = new Map<string, () => void>();

  return new Elysia({ name: "realtime" }).ws(WS_PATH, {
    query: t.Object({ token: t.String() }),
    beforeHandle({ query, status }) {
      if (!sessions.verify(query.token)) return status(401, "Unauthorized");
    },
    open(ws) {
      const hello: ServerEvent = {
        type: "hello",
        serverVersion: SERVER_VERSION,
        at: new Date().toISOString(),
      };
      ws.send(hello);
      unsubscribers.set(
        ws.id,
        hub.subscribe((event) => ws.send(event)),
      );
    },
    close(ws) {
      unsubscribers.get(ws.id)?.();
      unsubscribers.delete(ws.id);
    },
    message(ws, raw) {
      const event = parseClientEvent(raw);
      if (!event) {
        log.warn("ignored unknown ws message", { connection: ws.id });
        return;
      }
      switch (event.type) {
        case "ping": {
          const pong: ServerEvent = {
            type: "pong",
            nonce: event.nonce,
            at: new Date().toISOString(),
          };
          ws.send(pong);
          break;
        }
      }
    },
  });
};
