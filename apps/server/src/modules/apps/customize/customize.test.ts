import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { createTestApp } from "../../../testing";
import { compareVersions, ExtensionError, validateManifest } from "./extensions";
import { FORCED_REASON } from "./safe-mode";
import { customizeTools } from "./tools";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const by = { requestedBy: "orchestrator", chatId: "direct", why: "test" };

describe("customization", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("themes: propose with a try-on preview, approve, activate, switch back", async () => {
    t = await createTestApp();
    const record = await t.appearance.propose(
      {
        target: "theme",
        name: "midnight",
        css: ":root { --background: #000; } body { background: url(https://x.test/a.png) }",
        activate: true,
      },
      by,
    );
    expect(record.tryCss).toContain("--background: #000");
    expect(record.tryCss).not.toContain("x.test");
    // Aura starts with its default look as the user's own theme (ADR 0041).
    expect(await t.appearance.get()).toMatchObject({ theme: "default", themes: ["default"] });
    expect(t.appearance.source("theme", "default")).toContain("--sidebar-bg");

    await t.approvals.decide(record.id, true, "owner");
    const after = await t.appearance.get();
    expect(after.theme).toBe("midnight");
    expect(after.css[0]?.css).toContain("--background: #000");
    expect(after.css[0]?.css).not.toContain("x.test");

    await t.appearance.set({ theme: null });
    expect((await t.appearance.get()).css).toHaveLength(0);
    await expect(t.appearance.set({ theme: "nope" })).rejects.toThrow(/unknown theme/);
  });

  test("describe_look tells the Helper what the sidebar is and shows the active theme (ADR 0041)", async () => {
    t = await createTestApp();
    const tools = customizeTools(
      { appearance: t.appearance, extensions: t.extensions },
      { handle: "orchestrator", chatId: "direct" },
    );
    const answer = await tools.find((x) => x.name === "describe_look")?.handler({});
    expect(answer?.text).toContain("- sidebar: the sidebar");
    expect(answer?.text).toContain("--sidebar-bg (background");
    expect(answer?.text).toContain("Active theme: default");
    expect(answer?.text).toContain("--radius: 16px");
  });

  test("extensions: manifest rules, install by approval, sandbox frame, permissions, auto-disable", async () => {
    expect(() => validateManifest({ id: "x" })).toThrow(ExtensionError);
    expect(() =>
      validateManifest({
        id: "ok-id",
        name: "N",
        version: "1.0.0",
        minAppVersion: "0.1.0",
        permissions: ["fs.write"],
        author: "a",
      }),
    ).toThrow(/permissions/);
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);

    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const manifest = {
      id: "alerts-panel",
      name: "Alerts",
      version: "0.1.0",
      minAppVersion: "0.6.0",
      permissions: ["chat.read", "ui.panel"],
      author: "orchestrator",
    };
    await expect(
      t.extensions.propose(
        { manifest: { ...manifest, minAppVersion: "9.0.0" }, mainJs: "export default () => {}" },
        by,
      ),
    ).rejects.toThrow(/newer/);
    await expect(t.extensions.propose({ manifest, mainJs: "console.log(1)" }, by)).rejects.toThrow(
      /export default/,
    );

    const record = await t.extensions.propose(
      {
        manifest,
        mainJs:
          "export default function activate(ctx) { ctx.ui.registerPanel({ title: 'A', render(el) { el.textContent = '</script>hi'; } }); }",
      },
      by,
    );
    expect(record.preview).toContain("`chat.read`");
    expect(
      (await t.app.handle(new Request("http://localhost/extensions/alerts-panel/frame"))).status,
    ).toBe(404);
    await t.approvals.decide(record.id, true, "owner");

    const frame = await t.app.handle(new Request("http://localhost/extensions/alerts-panel/frame"));
    expect(frame.status).toBe(200);
    expect(frame.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(frame.headers.get("content-security-policy")).toContain("frame-ancestors");
    const html = await frame.text();
    expect(html).not.toContain("'</script>hi'");

    // No chat.write permission: posting is refused server-side.
    expect(
      (
        await api
          .extensions({ extensionId: "alerts-panel" })
          .messages.post({ chatId: "direct", body: "x" })
      ).status,
    ).toBe(403);

    // A folder dropped in by hand is listed but disabled until the user enables it.
    mkdirSync(join(t.dataDir, "extensions", "manual"), { recursive: true });
    writeFileSync(
      join(t.dataDir, "extensions", "manual", "manifest.json"),
      JSON.stringify({ ...manifest, id: "manual", permissions: ["chat.write"] }),
    );
    writeFileSync(join(t.dataDir, "extensions", "manual", "main.js"), "export default () => {}");
    const listed = await t.extensions.list();
    expect(listed.find((e) => e.id === "manual")).toMatchObject({ enabled: false, problem: null });
    await t.extensions.setEnabled("manual", true);
    expect(
      (
        await api
          .extensions({ extensionId: "manual" })
          .messages.post({ chatId: "direct", body: "hello from ext" })
      ).status,
    ).toBe(200);

    // Repeated errors disable an extension.
    for (let i = 0; i < 3; i++) await t.extensions.reportError("alerts-panel");
    expect((await t.extensions.info("alerts-panel")).enabled).toBe(false);
  });

  test("safe mode keeps apps off until the user leaves it", async () => {
    t = await createTestApp({ safeMode: { on: true, reason: "test" } });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect((await api.customize.get()).data?.safeMode).toEqual({ on: true, reason: "test" });
    expect((await api.customize["safe-mode"].off.post()).data?.safeMode.on).toBe(false);
  });

  test("safe mode forced by the env flag cannot be left from the app", async () => {
    t = await createTestApp({ safeMode: { on: true, reason: FORCED_REASON } });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect((await api.customize["safe-mode"].off.post()).status).toBe(409);
    expect((await api.customize.get()).data?.safeMode.on).toBe(true);
  });
});
