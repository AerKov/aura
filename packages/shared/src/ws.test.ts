import { describe, expect, test } from "bun:test";
import { parseClientEvent, parseServerEvent, type ServerEvent } from "./ws";

describe("parseServerEvent", () => {
  test("parses hello from string and object", () => {
    const event: ServerEvent = {
      type: "hello",
      serverVersion: "0.0.0",
      at: "2026-01-01T00:00:00.000Z",
    };
    expect(parseServerEvent(JSON.stringify(event))).toEqual(event);
    expect(parseServerEvent(event)).toEqual(event);
  });

  test("parses pong", () => {
    const event: ServerEvent = { type: "pong", nonce: "n1", at: "2026-01-01T00:00:00.000Z" };
    expect(parseServerEvent(event)).toEqual(event);
  });

  test("drops extra fields", () => {
    expect(parseServerEvent({ type: "pong", nonce: "n", at: "t", extra: 1 })).toEqual({
      type: "pong",
      nonce: "n",
      at: "t",
    });
  });

  test("rejects malformed input", () => {
    expect(parseServerEvent("not json")).toBeNull();
    expect(parseServerEvent(null)).toBeNull();
    expect(parseServerEvent([])).toBeNull();
    expect(parseServerEvent({ type: "unknown" })).toBeNull();
    expect(parseServerEvent({ type: "hello", serverVersion: 1, at: "t" })).toBeNull();
    expect(parseServerEvent({ type: "pong", at: "t" })).toBeNull();
  });
});

describe("parseClientEvent", () => {
  test("parses ping", () => {
    expect(parseClientEvent('{"type":"ping","nonce":"a"}')).toEqual({ type: "ping", nonce: "a" });
  });

  test("rejects malformed input", () => {
    expect(parseClientEvent("{")).toBeNull();
    expect(parseClientEvent({ type: "ping" })).toBeNull();
    expect(parseClientEvent({ type: "hello" })).toBeNull();
  });
});
