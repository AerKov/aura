import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { visibleApps } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("shell (ADR 0024)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("a new install opens the messenger with the orchestrator's welcome", async () => {
    t = await createTestApp({ welcome: true });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const layout = (await api.layout.get()).data;
    if (!layout) throw new Error("no layout");
    expect(visibleApps(layout)).toEqual(["messenger"]);
    const [welcome] = await t.repo.listMessages("direct", { limit: 5 });
    expect(welcome?.author).toEqual({ kind: "agent", id: "orchestrator" });
    expect(welcome?.body).toContain("Aura is a home for your own apps");
    // The welcome is not a request: nobody runs.
    expect((t.provider as FakeProvider).calls).toHaveLength(0);
  });

  test("the layout is saved, validated and pruned of apps that are gone", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const dir = join(t.dataDir, "extensions", "crm");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        id: "crm",
        name: "CRM",
        version: "1.0.0",
        minAppVersion: "0.1.0",
        permissions: ["ui.panel"],
        author: "me",
      }),
    );
    writeFileSync(join(dir, "main.js"), "export default () => {}");
    await t.extensions.setEnabled("crm", true);

    const saved = await api.layout.put({
      root: {
        kind: "split",
        id: "s1",
        dir: "row",
        sizes: [60, 40],
        children: [
          { kind: "tile", id: "t1", tabs: ["messenger"], active: "messenger" },
          { kind: "tile", id: "t2", tabs: ["ext:crm", "page:agents"], active: "ext:crm" },
        ],
      },
      focused: "t2",
    });
    expect(saved.data && visibleApps(saved.data)).toEqual(["messenger", "ext:crm"]);
    expect((await api.layout.get()).data?.focused).toBe("t2");

    await t.extensions.setEnabled("crm", false);
    const after = (await api.layout.get()).data;
    expect(after && visibleApps(after)).toEqual(["messenger", "page:agents"]);

    expect((await api.layout.put({ root: { kind: "window" }, focused: "t1" })).status).toBe(400);
  });

  test("the orchestrator arranges the screen with set_layout", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: { kind: "user", id: "owner" }, body: "hi" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const tools = provider.calls[0]?.tools ?? [];
    const set = tools.find((x) => x.name === "set_layout");
    const events: string[] = [];
    const off = t.hub.subscribe((e) => {
      if (e.type === "layout.updated") events.push(e.type);
    });
    const res = await set?.handler({ action: "open", app: "page:agents", where: "right" });
    off();
    expect(res?.text).toContain("side by side([*messenger] | [*page:agents])");
    expect(events).toEqual(["layout.updated"]);
    expect((await set?.handler({ action: "open", app: "ext:missing" }))?.isError).toBe(true);
    expect((await set?.handler({ action: "open", app: "desktop" }))?.isError).toBe(true);
    const shown = await tools.find((x) => x.name === "show_layout")?.handler({});
    expect(shown?.text).toContain("page:agents");
  });
});
