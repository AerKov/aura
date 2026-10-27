import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import type { AgentProfile } from "../agents/profiles";
import { DEFAULT_CONTAINER, SandboxSettingsError, validContainer } from "../sandbox/settings";
import { type CliResult, type CliRunner, detectRuntime, errorLine } from "./cli";
import { ContainerService, createArgs } from "./service";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** A container CLI that records calls and answers from a small in-memory model. */
function fakeCli() {
  const calls: string[][] = [];
  const containers = new Map<string, { running: boolean; config: string; image: string }>();
  const run: CliRunner = async (args) => {
    calls.push(args);
    const ok = (stdout = ""): CliResult => ({ code: 0, stdout, stderr: "" });
    const [cmd] = args;
    const name = args.at(-1) ?? "";
    if (cmd === "inspect") {
      const c = containers.get(name);
      return c
        ? ok(`${c.running}|${c.config}|${c.image}\n`)
        : { code: 1, stdout: "", stderr: "No such container" };
    }
    if (cmd === "run") {
      const label = (key: string) =>
        args[args.findIndex((a, i) => args[i - 1] === "--label" && a.startsWith(`${key}=`))]?.split(
          "=",
        )[1] ?? "";
      const n = args[args.indexOf("--name") + 1] ?? "";
      containers.set(n, { running: true, config: label("aura.config"), image: args.at(-3) ?? "" });
      return ok("id\n");
    }
    if (cmd === "start") {
      const c = containers.get(name);
      if (c) c.running = true;
      return ok();
    }
    if (cmd === "stop") {
      const c = containers.get(name);
      if (c) c.running = false;
      return ok();
    }
    if (cmd === "rm") {
      containers.delete(name);
      return ok();
    }
    if (cmd === "exec") return ok("hello from the container\n");
    return ok();
  };
  return { calls, containers, run };
}

const coder: AgentProfile = {
  handle: "coder",
  name: "Coder",
  role: "Builds things",
  engine: null,
  model: null,
  systemPrompt: "You are coder.",
  builtinTools: ["Read", "Write", "Bash"],
  budgetUsd: null,
  skills: [],
};

describe("project containers", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("a container gets only the project folder and no added privileges", () => {
    const args = createArgs({
      name: "aura-x-site",
      project: { id: "site", workspace: "/data/projects/site" },
      settings: { ...DEFAULT_CONTAINER, network: false },
      config: "abc",
      user: "1000:1000",
      dataKey: "x",
    });
    const joined = args.join(" ");
    expect(joined).toContain("--volume /data/projects/site:/workspace");
    expect(args.filter((a) => a === "--volume")).toHaveLength(1);
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("--security-opt no-new-privileges");
    expect(joined).toContain("--network none");
    expect(joined).toContain("--user 1000:1000");
    expect(joined).toContain("--memory 4096m");
    expect(joined).not.toContain("--privileged");
    expect(joined).not.toContain("docker.sock");
    expect(
      createArgs({
        name: "n",
        project: { id: "site", workspace: "/w" },
        settings: DEFAULT_CONTAINER,
        config: "abc",
        user: null,
        dataKey: "x",
      }),
    ).not.toContain("--network");
  });

  test("container settings are validated", () => {
    expect(validContainer({ image: "ghcr.io/acme/dev:1.2" }, DEFAULT_CONTAINER).image).toBe(
      "ghcr.io/acme/dev:1.2",
    );
    for (const bad of [
      { image: "node; rm -rf /" },
      { image: "--privileged" },
      { memoryMb: 10 },
      { cpus: 0 },
      { network: "yes" },
    ]) {
      expect(() => validContainer(bad, DEFAULT_CONTAINER)).toThrow(SandboxSettingsError);
    }
  });

  test("containers are created once, recreated when settings change, stopped when idle", async () => {
    const cli = fakeCli();
    let settings = DEFAULT_CONTAINER;
    const service = new ContainerService({
      dataDir: "/data",
      settings: () => settings,
      detect: async () => ({ status: { ok: true, engine: "docker", version: "29" }, run: cli.run }),
      user: "1000:1000",
    });
    const project = { id: "site", workspace: mkdtempSync(join(tmpdir(), "aura-ws-")) };
    const signal = new AbortController().signal;
    try {
      const out = await service.exec(project, "echo hi", {
        timeoutSeconds: 5,
        signal,
        author: "coder",
      });
      expect(out).toEqual({ text: "hello from the container\nexit code 0", isError: false });
      expect(cli.calls.filter((c) => c[0] === "run")).toHaveLength(1);
      const exec = cli.calls.find((c) => c[0] === "exec") ?? [];
      // The command is an argument, never pasted into a shell string.
      expect(exec).toContain("echo hi");
      expect(exec).toContain("GIT_AUTHOR_NAME=coder");
      expect(exec.at(-1)).toBe("5");

      await service.exec(project, "ls", { timeoutSeconds: 5, signal, author: "coder" });
      expect(cli.calls.filter((c) => c[0] === "run")).toHaveLength(1);

      settings = { ...settings, network: false };
      await service.exec(project, "ls", { timeoutSeconds: 5, signal, author: "coder" });
      expect(cli.calls.filter((c) => c[0] === "rm")).toHaveLength(1);
      expect(cli.calls.filter((c) => c[0] === "run").at(-1)).toContain("none");

      expect(await service.stopIdle(Date.now() + 60 * 60_000)).toEqual([service.nameOf("site")]);
      expect((await service.status(project)).state).toBe("stopped");
      await service.exec(project, "ls", { timeoutSeconds: 5, signal, author: "coder" });
      expect(cli.calls.filter((c) => c[0] === "start")).toHaveLength(1);
    } finally {
      rmSync(project.workspace, { recursive: true, force: true });
    }
  });

  test("without a container runtime, commands fail instead of running on the host", async () => {
    const service = new ContainerService({
      dataDir: "/data",
      settings: () => DEFAULT_CONTAINER,
      detect: async () => ({ status: { ok: false, reason: "Docker is not running." }, run: null }),
    });
    const out = await service.exec(
      { id: "site", workspace: "/nonexistent" },
      "touch /tmp/escaped",
      { timeoutSeconds: 5, signal: new AbortController().signal, author: "coder" },
    );
    expect(out).toEqual({ text: "Docker is not running.", isError: true });
  });

  test("agents in a container project get the container shell instead of the host's", async () => {
    const cli = fakeCli();
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, coder]),
      containers: (dataDir, sandbox) =>
        new ContainerService({
          dataDir,
          settings: () => sandbox.store.get().container,
          detect: async () => ({
            status: { ok: true, engine: "docker", version: "29" },
            run: cli.run,
          }),
        }),
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    await t.sandbox.update({ container: { newProjects: true } });
    const { project, chat } = await t.projects.create({
      name: "Site",
      brief: "@coder build it",
      agents: ["coder"],
      budgetUsd: 5,
    });
    expect(project.isolation).toBe("container");
    for (let i = 0; i < 100 && provider.calls.length === 0; i++) await Bun.sleep(10);
    await t.runtime.whenIdle();
    const run = provider.calls[0];
    expect(run?.builtinTools).toEqual(["Read", "Write"]);
    const bash = run?.tools.find((tool) => tool.name === "Bash");
    expect(bash).toBeDefined();
    expect(run?.systemPrompt).toContain("## Project container");
    expect(run?.sandbox).toBeUndefined();
    expect((await bash?.handler({ command: "npm test" }))?.text).toContain(
      "hello from the container",
    );
    expect(cli.calls.find((c) => c[0] === "run")).toContain(`${project.workspace}:/workspace`);

    // The user switches the project back to the host: the plain Bash returns.
    const switched = await api
      .projects({ projectId: project.id })
      .isolation.put({ isolation: "host" });
    expect(switched.data).toMatchObject({ isolation: "host" });
    await t.chat.post({
      chatId: chat.id,
      author: { kind: "user", id: "owner" },
      body: "@coder again",
    });
    for (let i = 0; i < 100 && provider.calls.length < 2; i++) await Bun.sleep(10);
    await t.runtime.whenIdle();
    expect(provider.calls[1]?.builtinTools).toContain("Bash");
    expect(provider.calls[1]?.tools.some((tool) => tool.name === "Bash")).toBe(false);

    const status = await api.projects({ projectId: project.id }).container.get();
    expect(status.data).toMatchObject({ isolation: "host", container: { state: "running" } });
    expect((await api.projects({ projectId: project.id }).container.reset.post()).data).toEqual({
      ok: true,
    });
    expect(cli.calls.at(-1)?.[0]).toBe("rm");
  });
});

// Runs against a real Docker or Podman when one is available (CI on Linux has Docker).
const real = await detectRuntime();
const IMAGE = "alpine:3.20";
/** Downloads the test image up front; a registry rate limit is not a failure of this code. */
async function pulled(): Promise<boolean> {
  if (!real.run) return false;
  if ((await real.run(["image", "inspect", IMAGE], { timeoutMs: 30_000 })).code === 0) return true;
  const res = await real.run(["pull", IMAGE], { timeoutMs: 300_000 });
  if (res.code !== 0) console.warn(`skipping real container checks: ${errorLine(res.stderr)}`);
  return res.code === 0;
}

describe.if(real.status.ok)("project containers with a real runtime", () => {
  test("commands run in the project folder, isolated, with timeouts and no network", async () => {
    if (!(await pulled())) return;
    const dataDir = mkdtempSync(join(tmpdir(), "aura-ct-"));
    const workspace = join(dataDir, "projects", "demo");
    writeFileSync(join(dataDir, "secret.txt"), "host only");
    const service = new ContainerService({
      dataDir,
      settings: () => ({ ...DEFAULT_CONTAINER, image: IMAGE, network: false }),
    });
    const project = { id: "demo", workspace };
    const run = (command: string, timeoutSeconds = 60, signal = new AbortController().signal) =>
      service.exec(project, command, { timeoutSeconds, signal, author: "coder" });
    try {
      const written = await run("echo built > out.txt && pwd");
      expect(written.isError).toBe(false);
      expect(written.text).toContain("/workspace");
      expect(readFileSync(join(workspace, "out.txt"), "utf8")).toBe("built\n");
      // Nothing of the host besides the project folder.
      expect(
        (await run(`cat ${dataDir}/secret.txt ../secret.txt 2>&1; echo done`)).text,
      ).not.toContain("host only");
      expect((await run("wget -q -T 3 -O- http://example.com")).isError).toBe(true);
      const slow = await run("sleep 30", 1);
      expect(slow.isError).toBe(true);
      expect(slow.text).toContain("timed out");

      const abort = new AbortController();
      const started = Date.now();
      const stopping = run("sleep 30; echo finished", 60, abort.signal);
      await Bun.sleep(1000);
      abort.abort();
      const stopped = await stopping;
      expect(stopped.text).not.toContain("finished");
      expect(Date.now() - started).toBeLessThan(15_000);
    } finally {
      await service.remove("demo").catch(() => {});
      rmSync(dataDir, { recursive: true, force: true });
    }
    expect(existsSync(workspace)).toBe(false);
  });
});
