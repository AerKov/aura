import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { claudeSandbox } from "../../providers/claude-agent-sdk";
import { FakeProvider } from "../../providers/fake";
import { nativeTools } from "../../providers/native-tools";
import { sandboxSupport } from "../../providers/shell-sandbox";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import { deniedReads, SandboxService } from "./service";
import { parseSandbox } from "./settings";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("command sandbox", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("settings are validated; bad files fall back to safe defaults, old fields are ignored", () => {
    expect(parseSandbox({ mode: "yolo", allowedDomains: ["*"] })).toEqual({ mode: "auto" });
    expect(parseSandbox({ mode: "required", container: { newProjects: true } })).toEqual({
      mode: "required",
    });
    expect(parseSandbox(null)).toEqual({ mode: "auto" });
  });

  test("policy by mode and availability; credentials and app state are never readable", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "aura-sbx-"));
    try {
      let ok = true;
      const service = new SandboxService({
        dataDir,
        support: () => (ok ? { ok: true } : { ok: false, reason: "no bubblewrap" }),
      });
      // No network for agents' commands (ADR 0030).
      expect(service.policy()).toMatchObject({ required: false, allowedDomains: [] });
      expect(service.policy()?.denyRead).toEqual(expect.arrayContaining([join(dataDir, "state")]));
      expect(deniedReads(dataDir, "/home/u")).toEqual(
        expect.arrayContaining([
          "/home/u/.ssh",
          "/home/u/.claude",
          "/home/u/.gemini",
          "/home/u/.aws",
        ]),
      );
      ok = false;
      // auto: run without the sandbox when it is unavailable; required: keep the policy, commands fail.
      expect(service.policy()).toBeNull();
      expect(service.status()).toMatchObject({
        available: false,
        active: false,
        reason: "no bubblewrap",
      });
      writeFileSync(join(dataDir, "sandbox.json"), JSON.stringify({ mode: "required" }));
      const strict = new SandboxService({ dataDir, support: () => ({ ok: false, reason: "x" }) });
      expect(strict.policy()?.required).toBe(true);
      writeFileSync(join(dataDir, "sandbox.json"), JSON.stringify({ mode: "off" }));
      expect(new SandboxService({ dataDir, support: () => ({ ok: true }) }).policy()).toBeNull();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("Claude Code gets its sandbox with no escape hatch", () => {
    expect(
      claudeSandbox({ required: true, allowedDomains: ["github.com"], denyRead: ["/x"] }),
    ).toEqual({
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      network: { allowedDomains: ["github.com"] },
      filesystem: { denyRead: ["/x"] },
    });
  });

  test("runs with Bash get the policy and are told about it; settings over the API", async () => {
    const provider = new FakeProvider();
    const orchestrator = { ...ORCHESTRATOR_DEFAULT, builtinTools: ["Bash" as const] };
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([orchestrator]),
      sandboxSupport: () => ({ ok: true }),
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const say = async (body: string) => {
      await t?.chat.post({ chatId: "direct", author: { kind: "user", id: "owner" }, body });
      await Bun.sleep(10);
      await t?.runtime.whenIdle();
      return provider.calls.at(-1);
    };

    const on = await say("build it");
    expect(on?.sandbox?.allowedDomains).toEqual([]);
    expect(on?.systemPrompt).toContain("there is no network");

    expect((await api.sandbox.put({ mode: "sometimes" as "off" })).status).toBe(422);
    const updated = await api.sandbox.put({ mode: "off" });
    expect(updated.data).toMatchObject({ mode: "off", active: false, available: true });
    expect(JSON.parse(readFileSync(join(t.dataDir, "sandbox.json"), "utf8")).mode).toBe("off");
    expect(await git(t.dataDir, ["log", "--oneline", "-1"])).toContain("chore(sandbox): off mode");
    const off = await say("again");
    expect(off?.sandbox).toBeUndefined();
    expect(off?.systemPrompt).not.toContain("## Shell sandbox");
  });

  const real = sandboxSupport().ok;
  test.skipIf(!real)(
    "Aura's Bash runs in the OS sandbox: no writes outside, no credentials, no stray network",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "aura-sbx-run-"));
      const cwd = join(root, "workspace");
      const secret = join(root, "secret");
      try {
        await Bun.$`mkdir -p ${cwd} ${secret}`.quiet();
        writeFileSync(join(secret, "token"), "s3cret");
        const [bash] = nativeTools(["Bash"], cwd, {
          required: true,
          allowedDomains: [],
          denyRead: [secret],
        });
        if (!bash) throw new Error("no Bash");
        const signal = new AbortController().signal;
        const inside = await bash.run({ command: "echo ok > note.txt && cat note.txt" }, signal);
        expect(inside.text).toContain("ok");
        expect(readFileSync(join(cwd, "note.txt"), "utf8")).toBe("ok\n");
        // The temp folder stays writable (tools need it); nothing written elsewhere reaches the disk.
        const outsideFile = join(homedir(), ".aura-sandbox-escape-test");
        await bash.run({ command: `echo x > ${outsideFile}` }, signal);
        expect(existsSync(outsideFile)).toBe(false);
        const read = await bash.run({ command: `cat ${secret}/token` }, signal);
        expect(read.text).not.toContain("s3cret");
        const net = await bash.run(
          { command: "curl -s -m 5 -o /dev/null -w '%{http_code}' https://example.com || true" },
          signal,
        );
        expect(net.text).not.toContain("200");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
