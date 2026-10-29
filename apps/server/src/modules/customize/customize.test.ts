import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { decideToolUse } from "../../providers/confine";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { compareVersions, ExtensionError, validateManifest } from "./extensions";
import { McpError, validateServer } from "./mcp";
import { FORCED_REASON } from "./safe-mode";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const by = { requestedBy: "orchestrator", chatId: "direct", why: "test" };
const coder = {
  handle: "coder",
  name: "C",
  role: "r",
  engine: null,
  model: null,
  systemPrompt: "p",
  builtinTools: [],
  budgetUsd: null,
  skills: [],
};

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
    expect((await t.appearance.get()).themes).toEqual([]);

    await t.approvals.decide(record.id, true, "owner");
    const after = await t.appearance.get();
    expect(after.theme).toBe("midnight");
    expect(after.css[0]?.css).toContain("--background: #000");
    expect(after.css[0]?.css).not.toContain("x.test");

    await t.appearance.set({ theme: null });
    expect((await t.appearance.get()).css).toHaveLength(0);
    await expect(t.appearance.set({ theme: "nope" })).rejects.toThrow(/unknown theme/);
  });

  test("MCP servers: validated, no literal secrets, granted per agent, off in safe mode", async () => {
    expect(() =>
      validateServer("gh", { command: "npx", env: { TOKEN: "ghp_secret" }, agents: [] }),
    ).toThrow(McpError);
    expect(() => validateServer("Bad Name", { command: "x", agents: [] })).toThrow(McpError);
    expect(() => validateServer("web", { url: "file:///etc", agents: [] })).toThrow(McpError);

    t = await createTestApp();
    await t.agents.create(coder);
    const record = await t.mcp.propose(
      {
        name: "github",
        config: {
          command: "npx",
          args: ["-y", "gh-mcp"],
          // biome-ignore lint/suspicious/noTemplateCurlyInString: an env reference, not a template
          env: { GITHUB_TOKEN: "${env:GITHUB_TOKEN}" },
          agents: ["coder"],
        },
      },
      by,
    );
    expect(record.preview).toContain("npx -y gh-mcp");
    await t.approvals.decide(record.id, true, "owner");
    expect(t.mcp.list()).toEqual([{ name: "github", target: "npx -y gh-mcp", agents: ["coder"] }]);
    expect(t.mcp.forAgent("coder").github).toMatchObject({ type: "stdio", command: "npx" });
    expect(t.mcp.forAgent("orchestrator")).toEqual({});

    // Tools of a granted server pass the sandbox check; others do not.
    const base = {
      args: {},
      granted: [],
      appTools: [],
      cwd: "/w",
      allowedPrefixes: ["mcp__github__"],
    };
    expect(decideToolUse({ ...base, tool: "mcp__github__create_issue" }).allow).toBe(true);
    expect(decideToolUse({ ...base, tool: "mcp__other__x" }).allow).toBe(false);
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
      permissions: ["alerts.read", "ui.panel"],
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
    expect(record.preview).toContain("`alerts.read`");
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

  test("safe mode keeps extensions and MCP servers off", async () => {
    t = await createTestApp({ safeMode: { on: true, reason: "test" } });
    await t.agents.create(coder);
    const record = await t.mcp.propose(
      { name: "web", config: { url: "https://mcp.example.com", agents: ["coder"] } },
      by,
    );
    await t.approvals.decide(record.id, true, "owner");
    expect(t.mcp.forAgent("coder")).toEqual({});
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect((await api.customize.get()).data?.safeMode).toEqual({ on: true, reason: "test" });

    // The user leaves it: MCP servers come back without a restart.
    expect((await api.customize["safe-mode"].off.post()).data?.safeMode.on).toBe(false);
    expect(Object.keys(t.mcp.forAgent("coder"))).toEqual(["web"]);
  });

  test("the window manager: bar edge and tile style, from the page and the orchestrator", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const initial = (await api.appearance.get()).data;
    expect(initial?.rail.edge).toBe("left");
    expect(initial?.wm).toEqual({ gaps: 10, radius: 10, border: 2, titles: "minimal", mod: "alt" });

    const set = await api.appearance.put({
      rail: { edge: "top" },
      wm: { gaps: 4, mod: "ctrl-alt" },
    });
    expect(set.data?.rail.edge).toBe("top");
    expect(set.data?.wm).toMatchObject({ gaps: 4, radius: 10, mod: "ctrl-alt" });
    expect((await api.appearance.put({ wm: { gaps: 99 } })).status).toBe(422);
    expect((await api.appearance.put({ rail: { size: 32 } })).data?.rail.size).toBe(32);
    expect((await api.appearance.put({ rail: { size: 200 } })).status).toBe(422);
    expect((await api.appearance.put({ rail: { size: null } })).data?.rail.size).toBeNull();

    await t.chat.post({ chatId: "direct", author: { kind: "user", id: "owner" }, body: "hi" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const tool = provider.calls[0]?.tools.find((x) => x.name === "set_appearance");
    const res = await tool?.handler({ preset: "i3", bar_edge: "bottom", titles: "none" });
    expect(res?.text).toContain(
      "bar: builtin on the bottom; tiles: gaps 0, radius 0, border 1, titles none; mod: ctrl-alt",
    );
  });

  test("safe mode forced by the env flag cannot be left from the app", async () => {
    t = await createTestApp({ safeMode: { on: true, reason: FORCED_REASON } });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect((await api.customize["safe-mode"].off.post()).status).toBe(409);
    expect((await api.customize.get()).data?.safeMode.on).toBe(true);
  });
});
