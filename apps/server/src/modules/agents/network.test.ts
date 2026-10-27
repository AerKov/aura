import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { decidePermission } from "../../providers/acp";
import { decideToolUse } from "../../providers/confine";
import { FakeProvider } from "../../providers/fake";
import { nativeTools } from "../../providers/native-tools";
import { sandboxedShell, sandboxSupport } from "../../providers/shell-sandbox";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "./defaults";
import { MemoryAgentDirectory } from "./directory";
import { type AgentProfile, parseAgentFile, serializeAgentFile, validateNetwork } from "./profiles";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

const tracker: AgentProfile = {
  handle: "tracker",
  name: "Tracker",
  role: "Files tickets",
  engine: null,
  model: null,
  systemPrompt: "You are tracker.",
  builtinTools: ["Bash", "WebFetch"],
  budgetUsd: null,
  skills: [],
  network: { hosts: ["tracker.example.com"], shared: false, restrictWeb: true },
};

describe("per-agent network rules (ADR 0022)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("rules are validated, round-trip through agent.md, and the default is no field", () => {
    expect(validateNetwork({ hosts: [], shared: true, restrictWeb: false })).toBeUndefined();
    expect(validateNetwork({ hosts: ["API.Example.com", "api.example.com"] })).toEqual({
      hosts: ["api.example.com"],
      shared: true,
      restrictWeb: false,
    });
    expect(() => validateNetwork({ hosts: ["https://x.example.com/path"] })).toThrow("network");
    expect(() => validateNetwork({ shared: "no" })).toThrow("shared");
    const text = serializeAgentFile(tracker);
    expect(text).toContain('network: {"hosts":["tracker.example.com"]');
    expect(parseAgentFile("tracker", text).network).toEqual(tracker.network);
    expect(serializeAgentFile({ ...tracker, network: undefined })).not.toContain("network");
  });

  test("each run gets its agent's hosts; WebFetch is limited only when asked", async () => {
    const provider = new FakeProvider();
    const orchestrator = {
      ...ORCHESTRATOR_DEFAULT,
      builtinTools: ["Bash" as const, "WebFetch" as const],
    };
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([orchestrator, tracker]),
      sandboxSupport: () => ({ ok: true }),
    });
    const { chat } = await t.projects.create({
      name: "Tickets",
      brief: "@tracker file the first ticket",
      agents: ["tracker"],
      budgetUsd: 5,
    });
    for (let i = 0; i < 100 && provider.calls.length === 0; i++) await Bun.sleep(10);
    await t.runtime.whenIdle();
    const run = provider.calls.find((c) => c.systemPrompt.includes("You are tracker."));
    expect(run?.sandbox?.allowedDomains).toEqual(["tracker.example.com"]);
    expect(run?.webHosts).toEqual(["tracker.example.com"]);
    expect(run?.systemPrompt).toContain("WebFetch reaches only these hosts: tracker.example.com");

    await t.chat.post({ chatId: chat.id, author: owner, body: "@orchestrator status?" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const orch = provider.calls.at(-1);
    expect(orch?.sandbox?.allowedDomains).toContain("registry.npmjs.org");
    expect(orch?.sandbox?.allowedDomains).not.toContain("tracker.example.com");
    expect(orch?.webHosts).toBeUndefined();
  });

  test("WebFetch outside the hosts is refused on every engine kind", async () => {
    const hosts = ["tracker.example.com", "*.docs.example.org"];
    const base = { granted: ["WebFetch"], appTools: [], cwd: undefined, webHosts: hosts };
    expect(
      decideToolUse({ ...base, tool: "WebFetch", args: { url: "https://tracker.example.com/x" } }),
    ).toEqual({ allow: true });
    expect(
      decideToolUse({ ...base, tool: "WebFetch", args: { url: "https://a.docs.example.org/" } }),
    ).toEqual({ allow: true });
    const denied = decideToolUse({ ...base, tool: "WebFetch", args: { url: "https://evil.com/" } });
    expect(denied.allow).toBe(false);
    expect(
      decideToolUse({
        ...base,
        webHosts: undefined,
        tool: "WebFetch",
        args: { url: "https://evil.com/" },
      }),
    ).toEqual({ allow: true });

    const acp = decidePermission(
      { toolCallId: "1", kind: "fetch", title: "Fetch", rawInput: { url: "https://evil.com/" } },
      ["WebFetch"],
      undefined,
      hosts,
    );
    expect(acp.allow).toBe(false);
    expect(
      decidePermission(
        {
          toolCallId: "2",
          kind: "fetch",
          title: "Fetch",
          rawInput: { url: "https://tracker.example.com/" },
        },
        ["WebFetch"],
        undefined,
        hosts,
      ),
    ).toEqual({ allow: true });

    const [fetchTool] = nativeTools(["WebFetch"], tmpdir(), undefined, {}, hosts);
    const res = await fetchTool?.run({ url: "https://evil.com/" }, new AbortController().signal);
    expect(res?.isError).toBe(true);
    expect(res?.text).toContain("not among this agent's allowed hosts");
  });

  test("the user edits an agent's network on its card", async () => {
    t = await createTestApp({
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, { ...tracker, network: undefined }]),
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const before = (await api.agents({ handle: "tracker" }).status.get()).data;
    expect(before?.network).toMatchObject({ hosts: [], shared: true, restrictWeb: false });
    expect(before?.network.effective).toContain("registry.npmjs.org");

    const res = await api.agents({ handle: "tracker" }).settings.put({
      network: { hosts: ["tracker.example.com"], shared: false, restrictWeb: true },
    });
    expect(res.data?.network.effective).toEqual(["tracker.example.com"]);
    expect((await t.agents.get("tracker"))?.network).toEqual({
      hosts: ["tracker.example.com"],
      shared: false,
      restrictWeb: true,
    });

    const bad = await api.agents({ handle: "tracker" }).settings.put({
      network: { hosts: ["not a host"], shared: true, restrictWeb: false },
    });
    expect(bad.status).toBe(400);
  });

  test("the orchestrator proposes network changes; they apply on approval", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, { ...tracker, network: undefined }]),
    });
    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const propose = provider.calls[0]?.tools.find((x) => x.name === "propose_agent_change");
    const answer = await propose?.handler({
      agent: "tracker",
      network: { hosts: ["tracker.example.com"], shared: true, restrictWeb: false },
      why: "it needs the tracker's API",
    });
    expect(answer?.text).toContain("Approval requested");
    const [pending] = await t.approvals.listPending();
    expect(pending?.title).toContain("network");
    expect(pending?.preview).toContain("tracker.example.com");
    if (!pending) throw new Error("no approval");
    await t.approvals.decide(pending.id, true, "owner");
    expect((await t.agents.get("tracker"))?.network?.hosts).toEqual(["tracker.example.com"]);
  });

  const real = sandboxSupport().ok;
  test.skipIf(!real)(
    "concurrent commands get their own agent's hosts in the OS sandbox",
    async () => {
      // The sandbox proxy answers CONNECT with 403 for a host the command may not reach; for an
      // allowed one it connects (or fails upstream with another code where there is no network).
      const connect = async (hosts: string[]) => {
        const w = await sandboxedShell(
          { required: true, allowedDomains: hosts, denyRead: [] },
          "curl -s -o /dev/null -w '%{http_connect}' --max-time 8 https://example.com/",
          tmpdir(),
        );
        try {
          const p = Bun.spawn(w.argv, {
            env: { PATH: process.env.PATH ?? "", ...w.env },
            stdout: "pipe",
          });
          const out = await new Response(p.stdout).text();
          await p.exited;
          return out.trim();
        } finally {
          w.release();
        }
      };
      const [allowed, other] = await Promise.all([
        connect(["example.com"]),
        connect(["github.com"]),
      ]);
      expect(other).toBe("403");
      expect(allowed).not.toBe("403");
    },
  );

  test("shared list file is untouched by agent rules", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, tracker]) });
    expect(t.sandbox.hostsFor(tracker.network)).toEqual(["tracker.example.com"]);
    expect(
      t.sandbox.hostsFor({ hosts: ["a.example.com"], shared: true, restrictWeb: false }),
    ).toContain("registry.npmjs.org");
    expect(() => readFileSync(join(t?.dataDir ?? "", "sandbox.json"), "utf8")).toThrow();
  });
});
