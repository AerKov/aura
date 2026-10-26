/**
 * WebSocket protocol between the server and clients.
 *
 * Phase 0 only carries connection-level events. Chat events (`message.created`, `message.delta`, ...)
 * are added in Phase 1, see docs/SPEC.md section 6.
 */

export const WS_PATH = "/ws";

export type ServerEvent =
  | { type: "hello"; serverVersion: string; at: string }
  | { type: "pong"; nonce: string; at: string };

export type ClientEvent = { type: "ping"; nonce: string };

export type ServerEventType = ServerEvent["type"];
export type ClientEventType = ClientEvent["type"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a raw WebSocket payload from the server. Returns `null` for anything unknown. */
export function parseServerEvent(raw: unknown): ServerEvent | null {
  const value = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "hello":
      return typeof value.serverVersion === "string" && typeof value.at === "string"
        ? { type: "hello", serverVersion: value.serverVersion, at: value.at }
        : null;
    case "pong":
      return typeof value.nonce === "string" && typeof value.at === "string"
        ? { type: "pong", nonce: value.nonce, at: value.at }
        : null;
    default:
      return null;
  }
}

/** Parses a raw WebSocket payload from a client. Returns `null` for anything unknown. */
export function parseClientEvent(raw: unknown): ClientEvent | null {
  const value = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!isRecord(value)) return null;
  if (value.type === "ping" && typeof value.nonce === "string") {
    return { type: "ping", nonce: value.nonce };
  }
  return null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
