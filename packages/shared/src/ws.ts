/**
 * WebSocket protocol between the server and clients (docs/SPEC.md section 6).
 * The client connects to `WS_PATH?token=<session token>`.
 */
import type { Chat, Message } from "./chat";

export const WS_PATH = "/ws";

export type ServerEvent =
  | { type: "hello"; serverVersion: string; at: string }
  | { type: "pong"; nonce: string; at: string }
  | { type: "message.created"; message: Message }
  | { type: "message.updated"; message: Message }
  /** Streaming text appended to a `streaming` message. Not persisted per delta. */
  | { type: "message.delta"; chatId: string; messageId: string; text: string }
  | { type: "message.deleted"; chatId: string; messageId: string }
  | { type: "chat.updated"; chat: Chat }
  /** Theme, snippets or extensions changed; clients reload them. */
  | { type: "customize.updated" }
  /** Something that deserves the user's attention (shown when the app is in the background). */
  | { type: "notification"; title: string; body: string; chatId: string; tag: string };

export type ClientEvent = { type: "ping"; nonce: string };

export type ServerEventType = ServerEvent["type"];
export type ClientEventType = ClientEvent["type"];

const SERVER_EVENT_TYPES: ReadonlySet<string> = new Set<ServerEventType>([
  "hello",
  "pong",
  "message.created",
  "message.updated",
  "message.delta",
  "message.deleted",
  "chat.updated",
  "customize.updated",
  "notification",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses a raw WebSocket payload from the server. The server is trusted, so only the envelope is
 * checked; unknown event types (e.g. from a newer server) return `null`.
 */
export function parseServerEvent(raw: unknown): ServerEvent | null {
  const value = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (!SERVER_EVENT_TYPES.has(value.type)) return null;
  return value as ServerEvent;
}

/** Parses a raw WebSocket payload from a client. Clients are untrusted: validate every field. */
export function parseClientEvent(raw: unknown): ClientEvent | null {
  const value = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!isRecord(value)) return null;
  if (value.type === "ping" && typeof value.nonce === "string" && value.nonce.length <= 128) {
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
