import { describe, expect, test } from "bun:test";
import { parseClientEvent, parseServerEvent, type ServerEvent } from "./ws";

describe("parseServerEvent", () => {
  test("parses known events from string and object", () => {
    const event: ServerEvent = { type: "hello", serverVersion: "0.0.0", at: "t" };
    expect(parseServerEvent(JSON.stringify(event))).toEqual(event);
    const delta: ServerEvent = { type: "message.delta", chatId: "c", messageId: "m", text: "hi" };
    expect(parseServerEvent(delta)).toEqual(delta);
  });

  test("rejects malformed or unknown input", () => {
    expect(parseServerEvent("not json")).toBeNull();
    expect(parseServerEvent(null)).toBeNull();
    expect(parseServerEvent([])).toBeNull();
    expect(parseServerEvent({ type: "unknown" })).toBeNull();
    expect(parseServerEvent({ type: 1 })).toBeNull();
  });
});

describe("parseClientEvent", () => {
  test("parses ping", () => {
    expect(parseClientEvent('{"type":"ping","nonce":"a"}')).toEqual({ type: "ping", nonce: "a" });
  });

  test("rejects malformed input", () => {
    expect(parseClientEvent("{")).toBeNull();
    expect(parseClientEvent({ type: "ping" })).toBeNull();
    expect(parseClientEvent({ type: "ping", nonce: "x".repeat(200) })).toBeNull();
    expect(parseClientEvent({ type: "hello" })).toBeNull();
  });
});
