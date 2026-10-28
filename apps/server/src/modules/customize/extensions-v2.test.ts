import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionPermission } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import type { AgentProfile } from "../agents/profiles";
import { ASK_LIMIT } from "./bridge";
import { validateManifest } from "./extensions";
import { customizeTools } from "./tools";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const worker: AgentProfile = {
  handle: "worker",
  name: "Worker",
  role: "Does things",
  engine: null,
  model: null,
  systemPrompt: "You are worker.",
  builtinTools: [],
  budgetUsd: null,
  skills: [],
};

const base = {
  id: "board",
  name: "Board",
  version: "1.0.0",
  minAppVersion: "0.1.0",
  author: "me",
};

async function install(
  t: TestApp,
  permissions: ExtensionPermission[],
  extra: Record<string, unknown> = {},
) {
  const dir = join(t.dataDir, "extensions", "board");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...base, permissions, ...extra }));
  writeFileSync(join(dir, "main.js"), "export default () => {}");
  await git(t.dataDir, ["add", "-A"]);
  await git(t.dataDir, ["commit", "-m", "add board"]);
  await t.extensions.setEnabled("board", true);
}

const apiOf = (t: TestApp) => treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

describe("extension API v2 (ADR 0021)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the manifest names an icon, hosts and secrets that go with the net permission", () => {
    const ok = validateManifest({
      ...base,
      permissions: ["net", "ui.panel"],
      icon: "ticket",
      hosts: ["API.example.com", "*.example.org", "localhost:8080"],
      secrets: ["SERVICE_TOKEN"],
    });
    expect(ok.hosts).toEqual(["api.example.com", "*.example.org", "localhost:8080"]);
    expect(() => validateManifest({ ...base, permissions: ["net"] })).toThrow("hosts");
    expect(() =>
      validateManifest({ ...base, permissions: ["ui.panel"], hosts: ["a.example.com"] }),
    ).toThrow("net");
    expect(() => validateManifest({ ...base, permissions: [], icon: "skull" })).toThrow("icon");
    expect(() =>
      validateManifest({ ...base, permissions: ["net"], hosts: ["https://a.example.com/x"] }),
    ).toThrow("host name");
    expect(() =>
      validateManifest({ ...base, permissions: ["net"], hosts: ["a.b"], secrets: ["lower"] }),
    ).toThrow("secret name");
  });

  test("storage keeps an extension's own data, only with the permission", async () => {
    t = await createTestApp();
    const api = apiOf(t);
    await install(t, ["ui.panel"]);
    const denied = await api.extensions({ extensionId: "board" }).storage.get({ query: {} });
    expect(denied.status).toBe(403);

    await install(t, ["ui.panel", "storage"]);
    const ext = api.extensions({ extensionId: "board" });
    await ext.storage.put({ key: "cards", value: [{ title: "First" }] });
    expect((await ext.storage.get({ query: { key: "cards" } })).data).toEqual({
      value: [{ title: "First" }],
    });
    expect((await ext.storage.get({ query: {} })).data).toEqual({ keys: ["cards"] });
    await ext.storage.put({ key: "cards", value: null });
    expect((await ext.storage.get({ query: { key: "cards" } })).data).toEqual({ value: null });

    // Removing the extension removes its data.
    await ext.storage.put({ key: "left", value: 1 });
    await ext.delete();
    await install(t, ["ui.panel", "storage"]);
    expect((await ext.storage.get({ query: {} })).data).toEqual({ keys: [] });
  });

  test("net reaches only granted hosts; the server fills in secrets and hides them", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    t = await createTestApp({
      fetch: (async (input: Request | string | URL, init?: RequestInit) => {
        const headers = Object.fromEntries(new Headers(init?.headers).entries());
        seen.push({ url: String(input), headers });
        return new Response(`{"echo":"${headers.authorization ?? ""}"}`, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    t.secrets.set("SERVICE_TOKEN", "tok-0123456789abcdef");
    t.secrets.set("OTHER_TOKEN", "other-0123456789");
    await install(t, ["ui.panel", "net"], {
      hosts: ["api.example.com"],
      secrets: ["SERVICE_TOKEN"],
    });
    const ext = apiOf(t).extensions({ extensionId: "board" });
    const ref = ["$", "{secret:SERVICE_TOKEN}"].join("");

    const res = await ext.fetch.post({
      url: "https://api.example.com/issues?limit=5",
      headers: { authorization: `Bearer ${ref}` },
    });
    expect(res.data).toMatchObject({ status: 200, ok: true, body: '{"echo":"Bearer [secret]"}' });
    expect(seen[0]?.headers.authorization).toBe("Bearer tok-0123456789abcdef");

    const otherHost = await ext.fetch.post({ url: "https://evil.example.net/" });
    expect(otherHost.status).toBe(403);
    const otherSecret = await ext.fetch.post({
      url: "https://api.example.com/",
      headers: { authorization: ["$", "{secret:OTHER_TOKEN}"].join("") },
    });
    expect(otherSecret.status).toBe(403);
    expect(seen).toHaveLength(1);

    // A manifest edited after install does not widen what was granted.
    writeFileSync(
      join(t.dataDir, "extensions", "board", "manifest.json"),
      JSON.stringify({
        ...base,
        permissions: ["ui.panel", "net"],
        hosts: ["api.example.com", "evil.example.net"],
      }),
    );
    expect((await ext.fetch.post({ url: "https://evil.example.net/" })).status).toBe(403);
  });

  test("agents.ask posts as the user with @agent, wakes the agent, and is rate limited", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]),
    });
    const { chat } = await t.projects.create({
      name: "Board",
      brief: "@worker hello",
      agents: ["worker"],
      budgetUsd: 5,
    });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const ext = apiOf(t).extensions({ extensionId: "board" });
    await install(t, ["ui.panel"]);
    expect((await ext.ask.post({ chatId: chat.id, agent: "worker", text: "go" })).status).toBe(403);

    await install(t, ["ui.panel", "agents.ask"]);
    const before = provider.calls.length;
    const res = await ext.ask.post({ chatId: chat.id, agent: "@worker", text: "Create a ticket" });
    expect(res.data).toMatchObject({
      author: { kind: "user", id: "owner" },
      body: "@worker Create a ticket",
      mentions: ["worker"],
    });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    expect(provider.calls.length).toBe(before + 1);

    for (let i = 1; i < ASK_LIMIT; i++)
      await t.extensionBridge.ask(
        "board",
        { chatId: chat.id, agent: "nobody", text: "x" },
        t.owner,
      );
    const limited = await ext.ask.post({ chatId: chat.id, agent: "worker", text: "again" });
    expect(limited.status).toBe(403);
  });

  test("files.read lists and reads project files, never outside or .git", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]) });
    const { project } = await t.projects.create({
      name: "Docs",
      brief: "@worker hi",
      agents: ["worker"],
      budgetUsd: 5,
    });
    await install(t, ["ui.panel", "files.read"]);
    const ext = apiOf(t).extensions({ extensionId: "board" });
    const list = await ext.files.get({ query: { project: project.id } });
    const entries = (list.data && "entries" in list.data && list.data.entries) || [];
    expect(entries).toContainEqual(expect.objectContaining({ name: "BRIEF.md", type: "file" }));
    expect(entries.map((e) => e.name)).not.toContain(".git");
    const read = await ext.files.get({
      query: { project: project.id, path: "BRIEF.md", read: true },
    });
    expect(read.data && "content" in read.data ? read.data.content : "").toContain("# Docs");

    for (const path of ["../../state", ".git/config"]) {
      const res = await ext.files.get({ query: { project: project.id, path, read: true } });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    symlinkSync(t.dataDir, join(project.workspace, "escape"));
    const viaLink = await ext.files.get({ query: { project: project.id, path: "escape" } });
    expect(viaLink.status).toBe(403);
  });

  test("an extension proposed for a project becomes its app on approval", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]) });
    const { project } = await t.projects.create({
      name: "Tracker",
      brief: "@worker hi",
      agents: ["worker"],
      budgetUsd: 5,
    });
    expect(project.app).toBeNull();
    const tools = customizeTools(
      { appearance: t.appearance, mcp: t.mcp, extensions: t.extensions },
      { handle: "orchestrator", chatId: "direct" },
    );
    const propose = tools.find((x) => x.name === "propose_extension");
    const answer = await propose?.handler({
      id: "tracker-app",
      name: "Tracker",
      version: "1.0.0",
      permissions: ["ui.panel", "agents.ask", "net"],
      icon: "ticket",
      hosts: ["tracker.example.com"],
      secrets: ["TRACKER_TOKEN"],
      project: project.id,
      main_js: "export default function activate(ctx) {}",
      why: "a form to file tickets",
    });
    expect(answer?.text).toContain("Approval requested");
    const [pending] = await t.approvals.listPending();
    expect(pending?.preview).toContain("tracker.example.com");
    expect(pending?.preview).toContain("TRACKER_TOKEN");
    expect(pending?.preview).toContain("app of project");
    if (!pending) throw new Error("no approval");
    await t.approvals.decide(pending.id, true, "owner");
    expect((await t.projects.get(project.id))?.app).toBe("tracker-app");
    const info = await t.extensions.info("tracker-app");
    expect(info).toMatchObject({ enabled: true, icon: "ticket", hosts: ["tracker.example.com"] });

    // The user can unpin it, and only a panel extension can be pinned.
    const api = apiOf(t);
    expect(
      (await api.projects({ projectId: project.id }).app.put({ extensionId: null })).data,
    ).toMatchObject({ app: null });
    expect(
      (await api.projects({ projectId: project.id }).app.put({ extensionId: "nope" })).status,
    ).toBe(400);
  });

  test("the rail layout is saved with the appearance; Chats and Customize cannot be hidden", async () => {
    t = await createTestApp();
    const api = apiOf(t);
    const res = await api.appearance.put({
      rail: { order: ["ext:board", "chats"], hidden: ["memory", "chats", "customize"] },
    });
    expect(res.data?.rail).toEqual({
      order: ["ext:board", "chats"],
      hidden: ["memory"],
      edge: "left",
    });
    // Theme changes keep the layout.
    await api.appearance.put({ snippets: [] });
    expect((await api.appearance.get()).data?.rail.hidden).toEqual(["memory"]);
    expect((await api.appearance.put({ rail: { order: ["Bad Key"] } })).status).toBe(400);
  });
});
