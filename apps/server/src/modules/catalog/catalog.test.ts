import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { createTestApp } from "../../testing";
import { PackError, validatePack } from "./pack";
import { packJsonUrl } from "./source";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const agentFile = (name: string, tools: string[]) =>
  `---\nname: "${name}"\nrole: "Does ${name} things."\ntools: ${JSON.stringify(tools)}\n---\n\nYou are ${name}.\n`;

/** A fake web server for URL packs. */
function fakeWeb(files: Record<string, string>) {
  const urls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const body = files[url];
    return body === undefined
      ? new Response("not found", { status: 404 })
      : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { urls, fetchFn };
}

// The first in-memory database of a run takes a few seconds to start.
setDefaultTimeout(20_000);

describe("catalog", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("built-in packs are valid and listed", async () => {
    t = await createTestApp();
    const ids = t.catalog.list().map((p) => p.id);
    expect(ids).toEqual([
      "app-crm",
      "app-tasks",
      "app-notes",
      "dev-team",
      "writing-team",
      "research",
      "ops",
      "themes",
      "alerts-panel",
    ]);
    const dev = t.catalog.list().find((p) => p.id === "dev-team");
    expect(dev?.contents).toMatchObject({ agents: ["coder", "reviewer"], skills: ["test-first"] });
    expect(dev?.installed).toBeNull();
  });

  test("packs may only write user customization, with valid content", () => {
    const manifest = (files: string[]) => ({
      id: "x-pack",
      name: "X",
      version: "1.0.0",
      description: "d",
      author: "a",
      files,
    });
    for (const path of [
      "mcp/servers.json",
      "agents/../../etc/passwd",
      "state/secrets.json",
      "apps/x.ts",
      ".git/config",
    ]) {
      expect(() => validatePack(manifest([path]), { [path]: "x" })).toThrow(PackError);
    }
    expect(() =>
      validatePack(manifest(["agents/bad/agent.md"]), { "agents/bad/agent.md": "no frontmatter" }),
    ).toThrow(/agents\/bad\/agent.md/);
    expect(() =>
      validatePack(manifest(["agents/ok/agent.md"]), {
        "agents/ok/agent.md": agentFile("ok", ["Read"]),
        "skills/sneaky/SKILL.md": "x",
      }),
    ).toThrow(/not listed/);
    expect(() =>
      validatePack(manifest(["extensions/ext/main.js"]), {
        "extensions/ext/main.js": "export default 1",
      }),
    ).toThrow(/manifest.json/);
  });

  test("preview shows new and replaced files with diffs; install writes, commits, locks", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    mkdirSync(join(t.dataDir, "agents", "coder"), { recursive: true });
    writeFileSync(join(t.dataDir, "agents", "coder", "agent.md"), agentFile("coder", ["Read"]));

    const preview = (await api.catalog.preview.post({ id: "dev-team" })).data;
    expect(preview?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(preview?.preview).toContain("replaces agent **@coder**");
    expect(preview?.preview).toContain("```diff");
    expect(preview?.preview).toContain("new agent **@reviewer**");
    expect(preview?.warnings).toEqual(
      expect.arrayContaining([
        "@coder gets a shell (Bash).",
        "agents/coder/agent.md already exists and will be replaced.",
      ]),
    );

    // Installing needs the hash of what was previewed.
    expect(
      (await api.catalog.install.post({ id: "dev-team", sha256: "0".repeat(64) })).status,
    ).toBe(400);
    const done = await api.catalog.install.post({ id: "dev-team", sha256: preview?.sha256 ?? "" });
    expect(done.data?.result).toContain('Installed "Dev team" 1.0.0');
    expect(readFileSync(join(t.dataDir, "agents", "reviewer", "agent.md"), "utf8")).toContain(
      "Reviewer",
    );
    expect(existsSync(join(t.dataDir, "skills", "test-first", "SKILL.md"))).toBe(true);
    expect(await git(t.dataDir, ["log", "--oneline", "-1"])).toContain(
      "pack(dev-team): install 1.0.0",
    );
    const lock = JSON.parse(readFileSync(join(t.dataDir, "catalog.json"), "utf8"));
    expect(lock.installed["dev-team"]).toMatchObject({ version: "1.0.0", source: "builtin" });
    expect(t.catalog.list().find((p) => p.id === "dev-team")?.installed?.version).toBe("1.0.0");
  });

  test("an extension pack is enabled with the permissions shown", async () => {
    t = await createTestApp();
    const preview = await t.catalog.preview({ id: "alerts-panel" });
    expect(preview.preview).toContain("`alerts.read` (Read alerts)");
    await t.catalog.install({ id: "alerts-panel" }, preview.sha256);
    const ext = await t.extensions.info("alerts-today");
    expect(ext).toMatchObject({
      enabled: true,
      permissions: ["ui.panel", "alerts.read"],
      problem: null,
    });
  });

  test("URL packs: GitHub URLs resolve to raw files, content is validated, the orchestrator asks first", async () => {
    expect(packJsonUrl("https://github.com/acme/packs").href).toBe(
      "https://raw.githubusercontent.com/acme/packs/HEAD/pack.json",
    );
    expect(packJsonUrl("https://github.com/acme/packs/tree/main/teams/qa").href).toBe(
      "https://raw.githubusercontent.com/acme/packs/main/teams/qa/pack.json",
    );
    for (const bad of [
      "http://x.com/pack.json",
      "https://127.0.0.1/pack.json",
      "https://x.com/other.json",
      "nope",
    ]) {
      expect(() => packJsonUrl(bad)).toThrow(PackError);
    }

    const base = "https://raw.githubusercontent.com/acme/packs/HEAD";
    const web = fakeWeb({
      [`${base}/pack.json`]: JSON.stringify({
        id: "qa",
        name: "QA",
        version: "0.1.0",
        description: "A tester.",
        author: "acme",
        files: ["agents/tester/agent.md"],
      }),
      [`${base}/agents/tester/agent.md`]: agentFile("tester", ["Read", "Bash"]),
    });
    t = await createTestApp({ fetch: web.fetchFn });
    const record = await t.catalog.request(
      { url: "https://github.com/acme/packs" },
      { requestedBy: "orchestrator", chatId: "direct", why: "You asked for a tester." },
    );
    expect(record.preview).toContain("new agent **@tester**");
    expect(record.preview).toContain("not from the built-in catalog");
    expect(existsSync(join(t.dataDir, "agents", "tester"))).toBe(false);
    await t.approvals.decide(record.id, true, "owner");
    expect(readFileSync(join(t.dataDir, "agents", "tester", "agent.md"), "utf8")).toContain(
      "tester",
    );
    expect(
      JSON.parse(readFileSync(join(t.dataDir, "catalog.json"), "utf8")).installed.qa.source,
    ).toBe("url");
  });
});
