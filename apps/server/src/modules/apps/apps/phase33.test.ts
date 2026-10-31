import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { createTestApp } from "../../../testing";
import { EventHub } from "../../system/realtime/hub";
import { AppSnapshots, describeSnapshot } from "./snapshots";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("phase 33: apps post alerts, the orchestrator relays, agents see apps", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("an agent sees an app as the user sees it, or learns it is not open (WISH-2)", async () => {
    const hub = new EventHub();
    const snapshots = new AppSnapshots({ hub, waitMs: 50 });
    const off = hub.subscribe((e) => {
      if (e.type === "app.snapshot")
        snapshots.answer(e.app, e.requestId, {
          draft: true,
          width: 800.4,
          height: 600,
          outline: "# Clients\n[button: Add]",
          errors: ["boom"],
        });
    });
    const seen = await snapshots.request("crm");
    off();
    expect(seen).toMatchObject({ draft: true, width: 800, outline: "# Clients\n[button: Add]" });
    expect(describeSnapshot("crm", seen)).toContain("your change waiting for approval");
    expect(await snapshots.request("crm")).toBeNull();
    expect(describeSnapshot("crm", null)).toContain("is not open");
    expect(
      snapshots.answer("crm", "unknown", {
        draft: false,
        width: 1,
        height: 1,
        outline: "",
        errors: [],
      }),
    ).toBe(false);
  });
});
