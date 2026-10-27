import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { FakeProvider } from "../../providers/fake";
import { nativeTools } from "../../providers/native-tools";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import { type AgentProfile, parseAgentFile, serializeAgentFile } from "../agents/profiles";
import { envProblem, envRef, redact, resolveEnv, secretRef } from "./env";
import { hostAllowed } from "./service";
import { integrationTools } from "./tools";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const KEY = "rk-0123456789abcdef";

const redmine: AgentProfile = {
  handle: "redmine",
  name: "Redmine",
  role: "Tracks issues and time",
  engine: null,
  model: null,
  systemPrompt: "You are redmine.",
  builtinTools: ["Bash", "WebSearch"],
  budgetUsd: null,
  skills: [],
  env: {
    REDMINE_URL: "https://redmine.corp.example",
    REDMINE_API_KEY: secretRef("REDMINE_API_KEY"),
    REDMINE_PROJECT: envRef("AURA_TEST_UNSET_VAR"),
  },
};

/** A minimal stdio MCP server with one tool. */
const MCP_SERVER = `
const rl = require("node:readline").createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
console.error("tracker server starting, key " + process.env.TRACKER_KEY);
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (m.method === "initialize")
    send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "t", version: "1" } } });
  else if (m.method === "tools/list")
    send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "log_time", description: "Log hours", inputSchema: { type: "object", properties: {} } }] } });
  else if (m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, result: {} });
});
`;

describe("variables and secrets", () => {
  test("config files hold names and references, never secret values", () => {
    expect(envProblem("REDMINE_URL", "https://redmine.example")).toBeNull();
    expect(envProblem("REDMINE_API_KEY", secretRef("REDMINE_API_KEY"))).toBeNull();
    expect(envProblem("REDMINE_API_KEY", "abc123")).toContain("looks like a secret");
    expect(envProblem("GITHUB_TOKEN", envRef("GITHUB_TOKEN"))).toBeNull();
    expect(envProblem("PATH", "/tmp")).toContain("cannot be set");
    expect(envProblem("LD_PRELOAD", "/x.so")).toContain("cannot be set");
    expect(envProblem("lower", "x")).toContain("not a variable name");
    expect(envProblem("X", secretRef("bad name"))).toContain("use $");

    const { values, missing } = resolveEnv(redmine.env ?? {}, {
      secret: (n) => (n === "REDMINE_API_KEY" ? KEY : null),
      env: {},
    });
    expect(values).toEqual({ REDMINE_URL: "https://redmine.corp.example", REDMINE_API_KEY: KEY });
    expect(missing).toEqual(["REDMINE_PROJECT"]);
    expect(redact(`key is ${KEY}!`, [KEY])).toBe("key is [secret]!");

    const file = serializeAgentFile(redmine);
    expect(file).not.toContain(KEY);
    expect(parseAgentFile("redmine", file).env).toEqual(redmine.env);
    expect(() =>
      parseAgentFile("redmine", file.replace(secretRef("REDMINE_API_KEY"), "plain-key")),
    ).toThrow("looks like a secret");
  });

  test("Aura's own Bash gets the agent's variables", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aura-env-"));
    try {
      const [bash] = nativeTools(["Bash"], dir, undefined, { REDMINE_URL: "https://r.example" });
      const out = await bash?.run({ command: "echo $REDMINE_URL" }, new AbortController().signal);
      expect(out?.text).toContain("https://r.example");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("integrations", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("an agent's commands get its variables; the prompt names them; secrets are hidden in chat", async () => {
    const provider = new FakeProvider((input) => [
      {
        type: "text-delta",
        text: input.systemPrompt.includes("You are redmine") ? `Using ${KEY}` : "ok",
      },
      { type: "done" },
    ]);
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, redmine]),
    });
    t.secrets.set("REDMINE_API_KEY", KEY);
    const { chat } = await t.projects.create({
      name: "Tracker",
      brief: "@redmine log the sprint",
      agents: ["redmine"],
      budgetUsd: 5,
    });
    for (let i = 0; i < 100 && provider.calls.length === 0; i++) await Bun.sleep(10);
    await t.runtime.whenIdle();
    const run = provider.calls[0];
    expect(run?.env).toEqual({ REDMINE_URL: "https://redmine.corp.example", REDMINE_API_KEY: KEY });
    expect(run?.systemPrompt).toContain(
      "Your shell commands get these variables: REDMINE_URL, REDMINE_API_KEY",
    );
    expect(run?.systemPrompt).toContain("no value: REDMINE_PROJECT");
    expect(run?.systemPrompt).not.toContain(KEY);
    const reply = (await t.repo.listMessages(chat.id, { limit: 10 })).at(-1);
    expect(reply?.body).toBe("Using [secret]");
  });

  test("the user adds an MCP server with a secret, tests it, and binds it to agents", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, redmine]) });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const script = join(t.dataDir, "tracker.cjs");
    writeFileSync(script, MCP_SERVER);

    const leaked = await api.integrations.mcp({ name: "tracker" }).put({
      command: process.execPath,
      args: [script],
      env: { TRACKER_KEY: "plain-secret-value" },
      agents: ["redmine"],
    });
    expect(leaked.status).toBe(400);

    const saved = await api.integrations.mcp({ name: "tracker" }).put({
      command: process.execPath,
      args: [script],
      env: { TRACKER_KEY: secretRef("TRACKER_KEY") },
      agents: ["redmine"],
    });
    expect(saved.data?.result).toContain("@redmine");
    expect(await git(t.dataDir, ["log", "--oneline", "-1"])).toContain("mcp(tracker)");

    let probe = (await api.integrations.mcp({ name: "tracker" }).test.post()).data;
    expect(probe?.ok).toBe(true);
    expect(probe?.tools.map((x) => x.name)).toEqual(["log_time"]);
    expect(probe?.error).toContain("TRACKER_KEY");

    await api.integrations.secrets({ name: "TRACKER_KEY" }).put({ value: KEY });
    probe = (await api.integrations.mcp({ name: "tracker" }).test.post()).data;
    expect(probe?.error).toBeNull();
    // The server's log is shown, with the secret hidden.
    expect(probe?.log).toContain("key [secret]");
    expect(readFileSync(join(t.dataDir, "mcp", "servers.json"), "utf8")).not.toContain(KEY);
    const overview = (await api.integrations.get()).data;
    expect(overview?.secrets).toEqual(["TRACKER_KEY"]);
    expect(JSON.stringify(overview)).not.toContain(KEY);
    expect(t.mcp.forAgent("redmine").tracker).toMatchObject({ env: { TRACKER_KEY: KEY } });

    await api.integrations
      .mcp({ name: "broken" })
      .put({ command: "no-such-command-xyz", agents: [] });
    const broken = (await api.integrations.mcp({ name: "broken" }).test.post()).data;
    expect(broken?.ok).toBe(false);
    expect(broken?.error).toContain('The command "no-such-command-xyz" was not found');

    await api.integrations.mcp({ name: "tracker" }).delete();
    expect(t.mcp.forAgent("redmine").tracker).toBeUndefined();
  });

  test("an agent's card explains what stops it", async () => {
    t = await createTestApp({
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, redmine]),
      sandboxSupport: () => ({ ok: true }),
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    await t.engines.store.update({ default: "openrouter" });
    const status = (await api.agents({ handle: "redmine" }).status.get()).data;
    expect(status?.engine.kind).toBe("aura");
    expect(status?.unsupported).toEqual(["WebSearch"]);
    const warnings = status?.warnings.join("\n") ?? "";
    expect(warnings).toContain("does not provide WebSearch");
    expect(warnings).toContain("REDMINE_API_KEY has no value");
    expect(warnings).toContain("redmine.corp.example, which the command sandbox blocks");
    expect(warnings).toContain("not in any chat yet");

    // Fixing it from the card: tools and variables, committed.
    const fixed = (
      await api.agents({ handle: "redmine" }).settings.put({
        tools: ["Bash"],
        env: { REDMINE_URL: "https://redmine.corp.example" },
      })
    ).data;
    expect(fixed?.tools).toEqual(["Bash"]);
    expect(fixed?.env).toEqual([
      { name: "REDMINE_URL", value: "https://redmine.corp.example", set: true },
    ]);
    const bad = await api.agents({ handle: "redmine" }).settings.put({ env: { API_TOKEN: "x" } });
    expect(bad.status).toBe(400);
  });

  test("host check: reachable or not, and whether the sandbox lets commands in", async () => {
    t = await createTestApp({ sandboxSupport: () => ({ ok: true }) });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const server = Bun.serve({ port: 0, fetch: () => new Response("hi") });
    try {
      const up = (
        await api.integrations["check-host"].post({ url: `http://127.0.0.1:${server.port}/` })
      ).data;
      expect(up).toMatchObject({
        ok: true,
        status: 200,
        sandbox: { active: true, allowed: false },
      });
      // Nothing listens on port 1: a refused connection, explained. No outside network needed.
      const down = (await api.integrations["check-host"].post({ url: "http://127.0.0.1:1/" })).data;
      expect(down?.ok).toBe(false);
      expect(down?.error).toContain("nothing listens on that port");
      expect(hostAllowed("api.github.com", ["*.github.com"])).toBe(true);
      expect(hostAllowed("github.com", ["*.github.com"])).toBe(true);
      expect(hostAllowed("redmine.corp", ["*.github.com", "registry.npmjs.org"])).toBe(false);
    } finally {
      server.stop(true);
    }
  });

  test("the orchestrator can inspect the setup, never secret values", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, redmine]) });
    t.secrets.set("REDMINE_API_KEY", KEY);
    const [inspect] = integrationTools(t.integrations);
    const text = (await inspect?.handler({ agent: "@redmine" }))?.text ?? "";
    expect(text).toContain("variables: REDMINE_URL, REDMINE_API_KEY, REDMINE_PROJECT (no value)");
    expect(text).not.toContain(KEY);
    expect((await inspect?.handler({}))?.text).toContain("Secrets set: REDMINE_API_KEY");
  });
});
