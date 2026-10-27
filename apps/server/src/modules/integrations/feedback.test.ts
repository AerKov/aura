import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { FakeProvider } from "../../providers/fake";
import type { AgentTool } from "../../providers/types";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import type { AgentProfile } from "../agents/profiles";
import { secretRef } from "./env";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };
const KEY = "tok-0123456789abcdef";

const worker: AgentProfile = {
  handle: "worker",
  name: "Worker",
  role: "Runs scripts",
  engine: null,
  model: null,
  systemPrompt: "You are worker.",
  builtinTools: ["Bash"],
  budgetUsd: null,
  skills: [],
};

async function settle(t: TestApp) {
  await Bun.sleep(20);
  await t.runtime.whenIdle();
}

const run = async (tool: AgentTool | undefined, input: Record<string, unknown>) =>
  (await tool?.handler(input))?.text ?? "";

/** Second round of alpha feedback. */
describe("alpha feedback, round 2", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("a command server can share its variables with its agents' commands", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]),
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    t.secrets.set("SERVICE_TOKEN", KEY);
    await api.integrations.mcp({ name: "service" }).put({
      command: "python3",
      args: ["server.py"],
      env: { SERVICE_URL: "https://s.example", SERVICE_TOKEN: secretRef("SERVICE_TOKEN") },
      shareEnv: true,
      agents: ["worker"],
    });
    const status = (await api.agents({ handle: "worker" }).status.get()).data;
    expect(status?.sharedEnv.map((e) => `${e.name}:${e.from}`)).toEqual([
      "SERVICE_URL:server service",
      "SERVICE_TOKEN:server service",
    ]);
    await t.projects.create({
      name: "Service",
      brief: "@worker go",
      agents: ["worker"],
      budgetUsd: 5,
    });
    for (let i = 0; i < 100 && provider.calls.length === 0; i++) await Bun.sleep(10);
    await t.runtime.whenIdle();
    expect(provider.calls[0]?.env).toEqual({
      SERVICE_URL: "https://s.example",
      SERVICE_TOKEN: KEY,
    });

    // Without sharing, the variables stay with the server process.
    await api.integrations.mcp({ name: "service" }).put({
      command: "python3",
      args: ["server.py"],
      env: { SERVICE_URL: "https://s.example" },
      agents: ["worker"],
    });
    expect((await api.agents({ handle: "worker" }).status.get()).data?.sharedEnv).toEqual([]);
  });

  test("the orchestrator has its setup tools in project chats too", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]),
    });
    const { chat } = await t.projects.create({
      name: "Panel",
      brief: "@worker hi",
      agents: ["worker"],
      budgetUsd: 5,
    });
    await settle(t);
    await t.chat.post({ chatId: chat.id, author: owner, body: "make the theme darker" });
    await settle(t);
    const call = provider.calls.find((c) => c.systemPrompt.includes("About Aura"));
    const names = call?.tools.map((x) => x.name) ?? [];
    for (const name of ["propose_css", "set_appearance", "propose_extension", "install_pack"])
      expect(names).toContain(name);
    expect(call?.systemPrompt).toContain('only after the tool answered "Approval requested"');
  });

  test("jobs and the orchestrator can post into the alerts chat", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await settle(t);
    const tools = provider.calls[0]?.tools ?? [];
    const schedule = tools.find((x) => x.name === "schedule_job");
    const post = tools.find((x) => x.name === "message_project");
    expect(
      await run(schedule, {
        name: "Nightly check",
        schedule: "0 6 * * *",
        chat: "alerts",
        agent: "orchestrator",
        prompt: "Check the services and report here.",
        why: "daily report",
      }),
    ).toContain("Approval requested");
    expect(await run(post, { project: "alerts", message: "All services are up." })).toContain(
      "Posted",
    );
    const bodies = (await t.repo.listMessages("system", { limit: 10 })).map((m) => m.body);
    expect(bodies).toContain("All services are up.");
  });

  test("the user can remove an extension; it stays in the history", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const dir = join(t.dataDir, "extensions", "notes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        id: "notes",
        name: "Notes",
        version: "1.0.0",
        minAppVersion: "0.1.0",
        permissions: ["ui.panel"],
        author: "me",
      }),
    );
    writeFileSync(join(dir, "main.js"), "export default () => {}");
    await git(t.dataDir, ["add", "-A"]);
    await git(t.dataDir, ["commit", "-m", "add notes"]);
    await api.extensions({ extensionId: "notes" }).enabled.post({ enabled: true });
    expect((await api.extensions({ extensionId: "notes" }).delete()).data).toEqual({ ok: true });
    expect(existsSync(dir)).toBe(false);
    expect(await t.extensions.list()).toEqual([]);
    expect(await git(t.dataDir, ["log", "--oneline", "-1"])).toContain("extensions(notes): remove");
    expect((await api.extensions({ extensionId: "notes" }).delete()).status).toBe(404);
  });
});
