import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { createTestApp } from "../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const coder = {
  handle: "coder",
  name: "Coder",
  role: "writes code",
  engine: null,
  model: null,
  systemPrompt: "p",
  builtinTools: ["Bash" as const],
  budgetUsd: null,
  skills: [],
  env: { SERVICE_TOKEN: ["$", "{secret:SERVICE_TOKEN}"].join("") },
};

describe("the Agents page (ADR 0020, ADR 0030)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("agents' secrets, tool servers and status live under /agents/setup", async () => {
    t = await createTestApp();
    await t.agents.create(coder);
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

    // A variable without a value is a warning until its secret is stored.
    let status = (await api.agents({ handle: "coder" }).status.get()).data;
    expect(status?.warnings.join(" ")).toContain("SERVICE_TOKEN has no value");
    expect(
      (await api.agents.setup.secrets({ name: "SERVICE_TOKEN" }).put({ value: "tok" })).data,
    ).toEqual({ names: ["SERVICE_TOKEN"] });
    status = (await api.agents({ handle: "coder" }).status.get()).data;
    expect(status?.env).toEqual([
      { name: "SERVICE_TOKEN", value: ["$", "{secret:SERVICE_TOKEN}"].join(""), set: true },
    ]);
    expect(JSON.stringify(status)).not.toContain('"tok"');

    const saved = await api.agents.setup.mcp({ name: "github" }).put({
      command: "npx",
      args: ["-y", "gh-mcp"],
      agents: ["coder"],
    });
    expect(saved.status).toBe(200);
    const overview = (await api.agents.setup.get()).data;
    expect(overview?.secrets).toEqual(["SERVICE_TOKEN"]);
    expect(overview?.servers.map((s) => s.name)).toEqual(["github"]);
    expect((await api.agents({ handle: "coder" }).status.get()).data?.mcpServers).toEqual([
      { name: "github", target: "npx -y gh-mcp" },
    ]);

    const updated = await api.agents({ handle: "coder" }).settings.put({ tools: ["Read"] });
    expect(updated.data?.tools).toEqual(["Read"]);
  });

  test("the prompt part by part, its history with diffs, and edits as commits (ADR 0032)", async () => {
    t = await createTestApp({ fileAgents: true });
    await t.agents.create({ ...coder, systemPrompt: "You write code." });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const agent = api.agents({ handle: "coder" });

    const explained = (await agent.prompt.get()).data;
    expect(explained?.parts[0]).toMatchObject({ source: "profile", text: "You write code." });
    const sources = explained?.parts.map((p) => p.source) ?? [];
    expect(sources).toContain("team");
    expect(sources).toContain("memory");
    // Variable names only; a secret's value never shows up.
    expect(explained?.parts.find((p) => p.source === "environment")?.text).toContain(
      "SERVICE_TOKEN",
    );

    const diff = (await agent.prompt.diff.post({ text: "You write tests first." })).data;
    expect(diff?.diff).toContain("-You write code.");
    expect(diff?.diff).toContain("+You write tests first.");

    await agent.settings.put({ systemPrompt: "You write tests first." });
    await agent.settings.put({ systemPrompt: "You write tests first.\nKeep it short." });
    const history = (await agent.prompt.get()).data?.history ?? [];
    expect(history.map((h) => h.subject)).toEqual([
      "agents(@coder): update prompt",
      "agents(@coder): update prompt",
      "feat(agents): add @coder (writes code)",
    ]);
    const newest = history[0]?.ref ?? "";
    const version = (await agent.prompt({ ref: newest }).get()).data;
    expect(version?.prompt).toBe("You write tests first.\nKeep it short.");
    expect(version?.diff).toContain("+Keep it short.");
    expect((await agent.prompt({ ref: "zzz" }).get()).status).toBe(404);
    expect((await agent.prompt({ ref: "abcdef1" }).get()).status).toBe(404);
  });
});
