import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { OpenAICompatProvider } from "./openai-compat";
import type { AgentEvent, AgentRunInput } from "./types";

/** A chat completions server script: one SSE body (list of chunks) per request. */
function sseResponse(chunks: unknown[]): Response {
  const text = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")}: keep-alive\n\ndata: [DONE]\n\n`;
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}

const textChunk = (content: string) => ({ choices: [{ index: 0, delta: { content } }] });
const toolChunk = (index: number, part: { id?: string; name?: string; args?: string }) => ({
  choices: [
    {
      index: 0,
      delta: {
        tool_calls: [
          {
            index,
            ...(part.id ? { id: part.id, type: "function" } : {}),
            function: { ...(part.name ? { name: part.name } : {}), arguments: part.args ?? "" },
          },
        ],
      },
    },
  ],
});
const usageChunk = (prompt: number, completion: number, cost?: number) => ({
  choices: [],
  usage: {
    prompt_tokens: prompt,
    completion_tokens: completion,
    ...(cost !== undefined ? { cost } : {}),
  },
});

function scripted(bodies: (Response | (() => Response))[]) {
  const requests: Record<string, unknown>[] = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")));
    const next = bodies.shift();
    if (!next) throw new Error("no more scripted responses");
    return typeof next === "function" ? next() : next;
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe("OpenAICompatProvider (Aura's own agent loop)", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "aura-loop-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  const input = (extra: Partial<AgentRunInput> = {}): AgentRunInput => ({
    runId: "r1",
    systemPrompt: "You are a test agent.",
    prompt: "hello",
    cwd,
    confineToCwd: true,
    builtinTools: [],
    tools: [],
    ...extra,
  });
  const provider = (fetchFn: typeof fetch, pricing: "usage-cost" | "free" = "usage-cost") =>
    new OpenAICompatProvider({
      id: "test",
      label: "Test",
      baseUrl: () => "http://llm.test/v1",
      apiKey: () => "sk-test",
      pricing,
      defaultModel: () => "test-model",
      fetch: fetchFn,
    });

  test("streams text and reports usage and cost", async () => {
    const { fetchFn, requests } = scripted([
      sseResponse([textChunk("Hel"), textChunk("lo"), usageChunk(12, 3, 0.0005)]),
    ]);
    const events = await collect(provider(fetchFn).run(input(), new AbortController().signal));
    expect(events).toEqual([
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo" },
      { type: "usage", inputTokens: 12, outputTokens: 3, costUsd: 0.0005 },
      { type: "done" },
    ]);
    expect(requests[0]?.model).toBe("test-model");
    expect(requests[0]?.stream).toBe(true);
    expect(requests[0]?.tools).toBeUndefined();
  });

  test("runs tool calls (split across chunks), feeds results back and continues", async () => {
    const { fetchFn, requests } = scripted([
      sseResponse([
        textChunk("Writing it."),
        toolChunk(0, { id: "c1", name: "Write", args: '{"file_path":"notes/a.txt",' }),
        toolChunk(0, { args: '"content":"hi"}' }),
        usageChunk(10, 5, 0.001),
      ]),
      sseResponse([textChunk("Done."), usageChunk(20, 2, 0.001)]),
    ]);
    const events = await collect(
      provider(fetchFn).run(input({ builtinTools: ["Write"] }), new AbortController().signal),
    );
    expect(readFileSync(join(cwd, "notes/a.txt"), "utf8")).toBe("hi");
    expect(events).toContainEqual({
      type: "tool-call",
      id: "c1",
      name: "Write",
      input: { file_path: "notes/a.txt", content: "hi" },
    });
    const result = events.find((e) => e.type === "tool-result");
    expect(result).toMatchObject({ id: "c1", isError: false });
    const text = events.flatMap((e) => (e.type === "text-delta" ? [e.text] : [])).join("");
    expect(text).toBe("Writing it.\n\nDone.");
    expect(events.at(-2)).toEqual({
      type: "usage",
      inputTokens: 30,
      outputTokens: 7,
      costUsd: 0.002,
    });
    expect(events.at(-1)).toEqual({ type: "done" });
    // The second request carries the assistant tool call and the tool result.
    const second = requests[1]?.messages as { role: string; tool_call_id?: string }[];
    expect(second.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(second[3]?.tool_call_id).toBe("c1");
    const tools = requests[0]?.tools as {
      function: { name: string; parameters: { type: string } };
    }[];
    expect(tools.map((t) => t.function.name)).toEqual(["Write"]);
    expect(tools[0]?.function.parameters.type).toBe("object");
  });

  test("keeps file tools inside the workspace and refuses ungranted tools", async () => {
    const { fetchFn } = scripted([
      sseResponse([
        toolChunk(0, { id: "a", name: "Read", args: '{"file_path":"../../etc/passwd"}' }),
        toolChunk(1, { id: "b", name: "Bash", args: '{"command":"echo hi"}' }),
      ]),
      sseResponse([textChunk("ok")]),
    ]);
    const events = await collect(
      provider(fetchFn).run(input({ builtinTools: ["Read"] }), new AbortController().signal),
    );
    const results = events.filter((e) => e.type === "tool-result");
    expect(results[0]).toMatchObject({ id: "a", isError: true });
    expect(String(results[0]?.type === "tool-result" && results[0].output)).toContain("outside");
    expect(results[1]).toMatchObject({ id: "b", isError: true });
    expect(String(results[1]?.type === "tool-result" && results[1].output)).toContain(
      "Unknown tool",
    );
  });

  test("validates app tool arguments before calling the handler", async () => {
    const seen: unknown[] = [];
    const tool = {
      name: "create_thing",
      description: "test",
      inputSchema: { name: z.string(), count: z.number() },
      handler: async (args: Record<string, unknown>) => {
        seen.push(args);
        return { text: "created" };
      },
    };
    const { fetchFn } = scripted([
      sseResponse([toolChunk(0, { id: "x", name: "create_thing", args: '{"name":"a"}' })]),
      sseResponse([
        toolChunk(0, { id: "y", name: "create_thing", args: '{"name":"a","count":2}' }),
      ]),
      sseResponse([toolChunk(0, { id: "z", name: "create_thing", args: "{not json" })]),
      sseResponse([textChunk("ok")]),
    ]);
    const events = await collect(
      provider(fetchFn).run(input({ tools: [tool] }), new AbortController().signal),
    );
    const results = events.filter((e) => e.type === "tool-result");
    expect(results.map((r) => r.type === "tool-result" && r.isError)).toEqual([true, false, true]);
    expect(seen).toEqual([{ name: "a", count: 2 }]);
  });

  test("maps HTTP errors and stops at the budget and the turn limit", async () => {
    const unauthorized = scripted([
      new Response(JSON.stringify({ error: { message: "No auth credentials found" } }), {
        status: 401,
      }),
    ]);
    const auth = await collect(
      provider(unauthorized.fetchFn).run(input(), new AbortController().signal),
    );
    expect(auth.at(-1)).toMatchObject({ type: "error", code: "auth" });
    expect(auth.at(-1)?.type === "error" && auth.at(-1)).toMatchObject({
      message: expect.stringContaining("No auth credentials found"),
    });

    const loop = () =>
      sseResponse([
        toolChunk(0, { id: "l", name: "Glob", args: '{"pattern":"*"}' }),
        usageChunk(1, 1, 0.3),
      ]);
    const costly = scripted([loop, loop, loop, loop]);
    const budget = await collect(
      provider(costly.fetchFn).run(
        input({ builtinTools: ["Glob"], maxBudgetUsd: 0.5 }),
        new AbortController().signal,
      ),
    );
    expect(budget.at(-1)).toMatchObject({ type: "error", code: "budget" });
    expect(costly.requests).toHaveLength(2);

    const endless = scripted([loop, loop, loop]);
    const turns = await collect(
      provider(endless.fetchFn, "free").run(
        input({ builtinTools: ["Glob"], maxTurns: 2 }),
        new AbortController().signal,
      ),
    );
    expect(turns.at(-1)).toMatchObject({ type: "error", code: "max_turns" });
    expect(turns.find((e) => e.type === "usage")).toMatchObject({ costUsd: 0 });
  });

  test("asks for a model or a key instead of calling the API", async () => {
    const { fetchFn, requests } = scripted([]);
    const noModel = new OpenAICompatProvider({
      id: "t",
      label: "Test",
      baseUrl: () => "http://llm.test/v1",
      pricing: "free",
      defaultModel: () => null,
      fetch: fetchFn,
    });
    expect((await collect(noModel.run(input(), new AbortController().signal)))[0]).toMatchObject({
      type: "error",
      message: expect.stringContaining("Choose a model for Test"),
    });
    const noKey = new OpenAICompatProvider({
      id: "t",
      label: "Test",
      baseUrl: () => "http://llm.test/v1",
      apiKey: () => null,
      needsKey: true,
      pricing: "free",
      defaultModel: () => "m",
      fetch: fetchFn,
    });
    expect((await collect(noKey.run(input(), new AbortController().signal)))[0]).toMatchObject({
      type: "error",
      code: "auth",
    });
    expect(await noKey.isAvailable()).toMatchObject({ ok: false });
    expect(requests).toHaveLength(0);
  });

  test("stops when aborted", async () => {
    const abort = new AbortController();
    const fetchFn = (async (_u: string | URL | Request, init?: RequestInit) => {
      abort.abort();
      throw init?.signal?.reason ?? new Error("aborted");
    }) as unknown as typeof fetch;
    const events = await collect(provider(fetchFn).run(input(), abort.signal));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "aborted" });
  });
});
