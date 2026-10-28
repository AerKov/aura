import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { validateManifest } from "../customize/extensions";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("the bar as an app (ADR 0029)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("only the app named bar may be the bar", () => {
    const manifest = {
      name: "X",
      version: "1.0.0",
      minAppVersion: "0.1.0",
      permissions: ["ui.bar"],
      author: "me",
    };
    expect(() => validateManifest({ ...manifest, id: "crm" }, "crm")).toThrow("ui.bar");
    expect(validateManifest({ ...manifest, id: "bar" }, "bar").permissions).toEqual(["ui.bar"]);
  });

  test("the user's bar is an app: created once with the built-in look, served in a frame", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const first = await api.bar.post();
    expect(first.data?.created).toBe(true);
    const again = await api.bar.post();
    expect(again.data).toEqual({ id: "bar", chatId: first.data?.chatId ?? "", created: false });

    const info = await t.extensions.info("bar");
    expect(info.enabled).toBe(true);
    expect(info.permissions).toEqual(["ui.bar", "storage"]);
    expect(info.app?.chatId).toBe(first.data?.chatId);
    const frame = await t.extensions.frame("bar");
    expect(frame).toContain("ctx.bar.state()");
    const dir = join(t.dataDir, "projects", "bar");
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain("`open(key, where)`");

    // Not an app for a tile, and the setting chooses which bar shows.
    expect(info.permissions).not.toContain("ui.panel");
    const set = await api.appearance.put({ rail: { mode: "app" } });
    expect(set.data?.rail.mode).toBe("app");
    expect((await api.appearance.put({ rail: { mode: "floating" as "off" } })).status).toBe(422);
  });

  test("a change to the bar waits for approval and can be undone", async () => {
    t = await createTestApp();
    const { chatId } = await t.apps.ensureBar();
    const dir = join(t.dataDir, "projects", "bar");
    writeFileSync(join(dir, "styles.css"), ".bar { background: hotpink; }\n");
    const project = await t.projects.get("bar");
    if (!project) throw new Error("no project");
    await t.apps.afterRun(project, {
      handle: "builder",
      chatId,
      topicId: null,
      summary: "Pink bar",
    });
    const [card] = await t.approvals.listPending();
    expect(card?.kind).toBe("app_change");
    // Live is still the old bar until the user approves.
    expect(await t.extensions.frame("bar")).not.toContain("hotpink");
    expect(await t.extensions.frame("bar", true)).toContain("hotpink");
    if (!card) throw new Error("no card");
    await t.approvals.decide(card.id, true, "owner");
    expect(await t.extensions.frame("bar")).toContain("hotpink");
    const versions = await t.apps.history("bar");
    await t.apps.restore("bar", versions[1]?.hash ?? "");
    expect(await t.extensions.frame("bar")).not.toContain("hotpink");
  });

  test("the orchestrator hands a bar change to @builder and switches to the bar app", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: { kind: "user", id: "owner" }, body: "hi" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const tool = provider.calls[0]?.tools.find((x) => x.name === "change_bar");
    const res = await tool?.handler({ request: "show the weather next to the clock" });
    expect(res?.text).toContain("Created the bar app");
    expect((await t.appearance.get()).rail.mode).toBe("app");
    await t.runtime.whenIdle();
    const project = await t.projects.get("bar");
    const messages = await t.repo.listMessages(project?.chatId ?? "", { limit: 10 });
    expect(messages.some((m) => m.body === "@builder show the weather next to the clock")).toBe(
      true,
    );
  });
});
