import { parseClientEvent, type ServerEvent, WS_PATH } from "@crew/shared";
import { Elysia } from "elysia";
import { SERVER_VERSION } from "../../config";
import { log } from "../../lib/log";

/**
 * Single WebSocket endpoint for server-to-client events (docs/SPEC.md section 6).
 * Phase 0: handshake and ping/pong only.
 */
export const realtimeModule = () =>
  new Elysia({ name: "realtime" }).ws(WS_PATH, {
    open(ws) {
      const hello: ServerEvent = {
        type: "hello",
        serverVersion: SERVER_VERSION,
        at: new Date().toISOString(),
      };
      ws.send(hello);
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
