import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Agent,
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type RequestPermissionRequest,
} from "@agentclientprotocol/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { ToolBridge } from "../modules/ai/engines/tool-bridge";
import { type AcpAgentSpec, AcpProvider, type AgentProcess, decidePermission } from "./acp";
import type { AgentEvent, AgentRunInput } from "./types";

const permissionOptions: RequestPermissionRequest["options"] = [
  { optionId: "yes", name: "Allow", kind: "allow_once" },
  { optionId: "always", name: "Always", kind: "allow_always" },
  { optionId: "no", name: "Reject", kind: "reject_once" },
];

type Script = (
  conn: AgentSideConnection,
  ctx: { sessionId: string; cwd: string; mcpUrl: string | null },
) => Promise<void>;

/** An in-memory ACP agent built on the official SDK's agent side, driven by a script. */
function fakeAgent(script: Script) {
  const seen: { mcpServers: unknown[]; prompt: string; cwd: string; args: string[] } = {
    mcpServers: [],
    prompt: "",
    cwd: "",
    args: [],
  };
  const spawn = (cmd: string[]): AgentProcess => {
    seen.args = cmd;
    const toAgent = new TransformStream<Uint8Array, Uint8Array>();
    const toClient = new TransformStream<Uint8Array, Uint8Array>();
    let resolveExit: (code: number) => void = () => {};
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    let cwd = "";
    let mcpUrl: string | null = null;
    new AgentSideConnection(
      (conn): Agent => ({
        initialize: async () => ({
          protocolVersion: PROTOCOL_VERSION,
          agentInfo: { name: "fake", title: "Fake Agent", version: "1.0" },
          agentCapabilities: { mcpCapabilities: { http: true, sse: false } },
        }),
        newSession: async (params) => {
          seen.mcpServers = params.mcpServers;
          seen.cwd = cwd = params.cwd;
          const aura = params.mcpServers.find((s) => s.name === "aura");
          mcpUrl = aura && "url" in aura ? aura.url : null;
          return { sessionId: "s1" };
        },
        authenticate: async () => {},
        prompt: async (params) => {
          seen.prompt = params.prompt.map((b) => (b.type === "text" ? b.text : "")).join("");
          await script(conn, { sessionId: params.sessionId, cwd, mcpUrl });
          return {
            stopReason: "end_turn",
            usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
          };
        },
        cancel: async () => {},
      }),
      ndJsonStream(toClient.writable, toAgent.readable),
    );
    return {
      stdin: toAgent.writable,
      stdout: toClient.readable,
      kill: () => resolveExit(0),
      exited,
    };
  };
  return { spawn, seen };
}

const spec: AcpAgentSpec = {
  id: "fake",
  label: "Fake Agent",
  command: () => ({ command: "fake-agent", args: ["--acp"] }),
  modelArgs: (model) => ["-m", model],
  installHint: "npm i -g fake",
  loginHint: "run fake login",
};

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe("AcpProvider (Gemini CLI, Codex, OpenCode over ACP)", () => {
  let cwd: string;
  let server: ReturnType<typeof Bun.serve> | undefined;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "aura-acp-"));
    writeFileSync(join(cwd, "README.md"), "hello\nworld\n");
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    server?.stop(true);
    server = undefined;
  });

  const input = (extra: Partial<AgentRunInput> = {}): AgentRunInput => ({
    runId: "r1",
    systemPrompt: "You are @coder.",
    prompt: "Write the file.",
    cwd,
    confineToCwd: true,
    builtinTools: ["Read", "Write"],
    tools: [],
    ...extra,
  });

  test("streams messages and tool calls, decides permissions, confines file access", async () => {
    const decisions: string[] = [];
    const agent = fakeAgent(async (conn, { sessionId }) => {
      await conn.sessionUpdate({
        sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "On it." } },
      });
      await conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "t1",
          title: "Write notes.md",
          kind: "edit",
          status: "pending",
          locations: [{ path: join(cwd, "notes.md") }],
        },
      });
      const allowed = await conn.requestPermission({
        sessionId,
        toolCall: { toolCallId: "t1", kind: "edit", locations: [{ path: join(cwd, "notes.md") }] },
        options: permissionOptions,
      });
      decisions.push(
        allowed.outcome.outcome === "selected" ? allowed.outcome.optionId : "cancelled",
      );
      await conn.writeTextFile({ sessionId, path: join(cwd, "notes.md"), content: "# Notes" });
      const read = await conn.readTextFile({
        sessionId,
        path: join(cwd, "README.md"),
        line: 2,
        limit: 1,
      });
      await conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "t1",
          status: "completed",
          content: [
            {
              type: "content",
              content: { type: "text", text: `wrote; line 2 is ${read.content}` },
            },
          ],
        },
      });
      const shell = await conn.requestPermission({
        sessionId,
        toolCall: { toolCallId: "t2", kind: "execute", title: "rm -rf /" },
        options: permissionOptions,
      });
      decisions.push(shell.outcome.outcome === "selected" ? shell.outcome.optionId : "cancelled");
      const outside = await conn.requestPermission({
        sessionId,
        toolCall: { toolCallId: "t3", kind: "edit", locations: [{ path: "/etc/hosts" }] },
        options: permissionOptions,
      });
      decisions.push(
        outside.outcome.outcome === "selected" ? outside.outcome.optionId : "cancelled",
      );
      await expect(conn.readTextFile({ sessionId, path: "/etc/hostname" })).rejects.toThrow();
      await conn.sessionUpdate({
        sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done." } },
      });
    });
    const provider = new AcpProvider(spec, { appVersion: "test", spawn: agent.spawn });
    const events = await collect(
      provider.run(input({ model: "gemini-3-pro-preview" }), new AbortController().signal),
    );

    expect(decisions).toEqual(["yes", "no", "no"]);
    expect(readFileSync(join(cwd, "notes.md"), "utf8")).toBe("# Notes");
    expect(events.filter((e) => e.type === "tool-call")).toEqual([
      {
        type: "tool-call",
        id: "t1",
        name: "Write notes.md",
        input: [{ path: join(cwd, "notes.md") }],
      },
    ]);
    expect(events.find((e) => e.type === "tool-result")).toMatchObject({
      id: "t1",
      isError: false,
      output: "wrote; line 2 is world",
    });
    expect(events.flatMap((e) => (e.type === "text-delta" ? [e.text] : [])).join("")).toBe(
      "On it.\n\nDone.",
    );
    expect(events.slice(-2)).toEqual([
      { type: "usage", inputTokens: 5, outputTokens: 7, costUsd: undefined },
      { type: "done" },
    ]);
    expect(agent.seen.args).toEqual(["fake-agent", "--acp", "-m", "gemini-3-pro-preview"]);
    expect(agent.seen.prompt).toContain("<instructions>\nYou are @coder.\n</instructions>");
    expect(agent.seen.cwd).toBe(cwd);
  });

  test("serves the run's app tools over MCP, only while the run lasts", async () => {
    const bridge = new ToolBridge(() => `http://127.0.0.1:${server?.port}`, "test");
    server = Bun.serve({
      port: 0,
      fetch: (req) => bridge.handle(new URL(req.url).pathname.split("/").at(-1) ?? "", req),
    });
    const calls: unknown[] = [];
    const tool = {
      name: "create_task",
      description: "Create a task",
      inputSchema: { title: z.string() },
      handler: async (args: Record<string, unknown>) => {
        calls.push(args);
        return { text: `created ${String(args.title)}` };
      },
    };
    let url = "";
    let toolText = "";
    let listed: string[] = [];
    const agent = fakeAgent(async (_conn, { mcpUrl }) => {
      url = mcpUrl ?? "";
      const client = new Client({ name: "fake-agent", version: "1.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(url)));
      listed = (await client.listTools()).tools.map((t) => t.name);
      const result = await client.callTool({
        name: "create_task",
        arguments: { title: "ship it" },
      });
      const content = result.content as { type: string; text?: string }[];
      toolText = content[0]?.text ?? "";
      await client.close();
    });
    const provider = new AcpProvider(spec, {
      appVersion: "test",
      spawn: agent.spawn,
      toolBridge: bridge,
    });
    const events = await collect(
      provider.run(input({ tools: [tool] }), new AbortController().signal),
    );
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(listed).toEqual(["create_task"]);
    expect(toolText).toBe("created ship it");
    expect(calls).toEqual([{ title: "ship it" }]);
    expect(url).toMatch(/\/mcp\/runs\/[0-9a-f]{48}$/);
    // The endpoint is closed once the run ends.
    expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(404);
  });

  test("reports a missing CLI, and maps agent errors to auth hints", async () => {
    const missing = new AcpProvider({ ...spec, command: () => null }, { appVersion: "test" });
    expect(await missing.isAvailable()).toEqual({
      ok: false,
      reason: "Fake Agent is not installed. npm i -g fake",
    });
    expect((await collect(missing.run(input(), new AbortController().signal)))[0]).toMatchObject({
      code: "auth",
    });

    const failing = fakeAgent(async () => {
      throw RequestError.authRequired();
    });
    const provider = new AcpProvider(spec, { appVersion: "test", spawn: failing.spawn });
    const events = await collect(provider.run(input(), new AbortController().signal));
    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "auth",
      message: "Fake Agent is not logged in. run fake login",
    });
    const broken = fakeAgent(async () => {
      throw new Error("model overloaded");
    });
    const other = await collect(
      new AcpProvider(spec, { appVersion: "test", spawn: broken.spawn }).run(
        input(),
        new AbortController().signal,
      ),
    );
    expect(other.at(-1)).toMatchObject({
      code: "other",
      message: expect.stringContaining("model overloaded"),
    });
    expect(
      await new AcpProvider(spec, { appVersion: "test", spawn: failing.spawn }).isAvailable(),
    ).toEqual({
      ok: true,
      detail: "Fake Agent 1.0",
    });
  });

  test("permission rules by tool kind", () => {
    const ask = (
      kind: Parameters<typeof decidePermission>[0]["kind"],
      granted: string[],
      path?: string,
    ) =>
      decidePermission({ toolCallId: "x", kind, locations: path ? [{ path }] : [] }, granted, cwd)
        .allow;
    expect(ask("read", ["Read"], join(cwd, "README.md"))).toBe(true);
    expect(ask("read", ["Read"], "/etc/passwd")).toBe(false);
    expect(ask("edit", ["Read"])).toBe(false);
    expect(ask("execute", ["Bash"])).toBe(true);
    expect(ask("execute", ["Read", "Write"])).toBe(false);
    expect(ask("fetch", ["WebFetch"])).toBe(true);
    expect(ask("switch_mode", ["Read", "Write", "Bash"])).toBe(false);
    expect(ask("think", [])).toBe(true);
  });
});
