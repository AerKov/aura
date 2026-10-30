import { describe, expect, test } from "bun:test";
import { bearerToken, isLoopbackHost, LocalSessions } from "./sessions";

describe("LocalSessions", () => {
  test("issues tokens that verify, rejects others", () => {
    const sessions = new LocalSessions();
    const token = sessions.issue({ id: "owner", name: "me" });
    expect(token.length).toBeGreaterThan(30);
    expect(sessions.verify(token)).toEqual({ id: "owner", name: "me" });
    expect(sessions.verify(`${token}x`)).toBeNull();
    expect(sessions.verify("")).toBeNull();
    expect(sessions.verify(undefined)).toBeNull();
  });
});

test("bearerToken", () => {
  expect(bearerToken("Bearer abc")).toBe("abc");
  expect(bearerToken("bearer abc")).toBe("abc");
  expect(bearerToken("Basic abc")).toBeNull();
  expect(bearerToken(undefined)).toBeNull();
});

test("isLoopbackHost", () => {
  expect(isLoopbackHost("127.0.0.1:4517")).toBe(true);
  expect(isLoopbackHost("localhost")).toBe(true);
  expect(isLoopbackHost("[::1]:4517")).toBe(true);
  expect(isLoopbackHost("evil.example.com:4517")).toBe(false);
  expect(isLoopbackHost("127.0.0.1.evil.com")).toBe(false);
  expect(isLoopbackHost(null)).toBe(false);
});
