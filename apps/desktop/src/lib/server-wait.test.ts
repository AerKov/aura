import { describe, expect, test } from "bun:test";
import { isNoResponse, type ServerStatus, untilServerAnswers } from "./server-wait";

/** A fake clock: sleeping moves time forward. */
function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("waiting for the local server", () => {
  test("only a request without a response counts as not answering", () => {
    expect(isNoResponse({ status: 503, value: new TypeError("ECONNREFUSED") })).toBe(true);
    expect(isNoResponse({ status: 503, value: "Service Unavailable" })).toBe(false);
    expect(isNoResponse({ status: 403, value: "Origin not allowed" })).toBe(false);
  });

  test("keeps trying until the server answers", async () => {
    let calls = 0;
    const result = await untilServerAnswers(async (notYet) => (++calls < 4 ? notYet : "session"), {
      timeoutMs: 30_000,
      ...clock(),
    });
    expect(result).toBe("session");
    expect(calls).toBe(4);
  });

  test("gives up after the timeout", async () => {
    const c = clock();
    const waiting = untilServerAnswers(async (notYet) => notYet, { timeoutMs: 5_000, ...c });
    await expect(waiting).rejects.toThrow("The server does not answer");
    expect(c.now()).toBeGreaterThanOrEqual(5_000);
  });

  test("stops at once when the server exited, with its last lines", async () => {
    const stopped: ServerStatus = {
      started: true,
      stopped: "exited: code Some(1), signal None",
      lines: ["server failed to start"],
    };
    let calls = 0;
    const error = await untilServerAnswers(
      async (notYet) => {
        calls++;
        return notYet;
      },
      { timeoutMs: 30_000, status: async () => stopped, ...clock() },
    ).catch((e: unknown) => e);
    expect(String(error)).toContain("The server stopped (exited: code Some(1)");
    expect((error as { status: ServerStatus }).status.lines).toEqual(["server failed to start"]);
    expect(calls).toBe(1);
  });

  test("errors other than no response are not retried", async () => {
    let calls = 0;
    const waiting = untilServerAnswers(
      async () => {
        calls++;
        throw new Error("refused");
      },
      { timeoutMs: 30_000, ...clock() },
    );
    await expect(waiting).rejects.toThrow("refused");
    expect(calls).toBe(1);
  });
});
