import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createTestApp } from "../../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("app kit (ADR 0024, phase 26)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("every app frame has the kit", async () => {
    t = await createTestApp();
    await t.apps.create({ name: "Board" });
    const frame = await t.extensions.frame("board");
    expect(frame).toContain("window.__auraKit");
    expect(frame).toContain("api.kit = Object.freeze");
  });
});
