import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { errorMessage, log } from "../lib/log";
import type { NativeTool } from "./native-tools";
import type { McpServerSpec } from "./types";

/** Tool names in chat completions APIs: letters, digits, `_` and `-`, at most 64 chars. */
export function mcpToolName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

export function mcpPrefix(server: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9_-]/g, "_")}__`;
}

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block: unknown) => {
      if (!block || typeof block !== "object") return "";
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") return b.text;
      if (b.type === "resource" && b.resource && typeof b.resource === "object") {
        const r = b.resource as Record<string, unknown>;
        return typeof r.text === "string" ? r.text : `[resource ${String(r.uri ?? "")}]`;
      }
      return `[${String(b.type ?? "content")}]`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Connects Aura's own agent loop to the MCP servers granted to an agent (`mcp/servers.json`) and
 * exposes their tools as `mcp__<server>__<tool>`, the names Claude Code uses. A server that fails to
 * start is skipped with a warning; the run continues without it.
 */
export async function connectMcpTools(
  servers: Record<string, McpServerSpec>,
  runId: string,
): Promise<{ tools: NativeTool[]; close(): Promise<void> }> {
  const clients: Client[] = [];
  const tools: NativeTool[] = [];
  await Promise.all(
    Object.entries(servers).map(async ([name, spec]) => {
      const client = new Client({ name: "aura", version: "1" });
      try {
        const transport =
          spec.type === "http"
            ? new StreamableHTTPClientTransport(new URL(spec.url))
            : new StdioClientTransport({
                command: spec.command,
                args: spec.args,
                env: spec.env,
                stderr: "ignore",
              });
        await withTimeout(client.connect(transport), 20_000);
        clients.push(client);
        const listed = await withTimeout(client.listTools(), 20_000);
        for (const tool of listed.tools) {
          const { $schema: _ignored, ...parameters } = tool.inputSchema as Record<string, unknown>;
          tools.push({
            name: mcpToolName(name, tool.name),
            description: tool.description ?? `${tool.name} (MCP server ${name})`,
            // The MCP server validates its own input.
            schema: z.looseObject({}),
            parameters,
            async run(args, signal) {
              const result = await client.callTool(
                { name: tool.name, arguments: args },
                undefined,
                { signal },
              );
              return {
                text: contentText(result.content) || "(no output)",
                isError: result.isError === true,
              };
            },
          });
        }
      } catch (error) {
        log.warn("mcp server unavailable", {
          run: runId,
          server: name,
          error: errorMessage(error),
        });
        void client.close().catch(() => {});
      }
    }),
  );
  return {
    tools,
    async close() {
      await Promise.all(clients.map((c) => c.close().catch(() => {})));
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
    ),
  ]);
}

export interface McpProbe {
  ok: boolean;
  tools: { name: string; description: string }[];
  /** What went wrong, in plain words. */
  error: string | null;
  /** The last lines the server wrote to stderr, for details. */
  log: string;
  ms: number;
}

/** Explains a connection failure without a stack trace (Integrations page, alpha feedback B5). */
export function explainMcpError(error: unknown, spec: McpServerSpec): string {
  const text = errorMessage(error);
  if (/ENOENT|not found|No such file/i.test(text) && spec.type === "stdio")
    return `The command "${spec.command}" was not found. Use its full path (for example /usr/bin/python3) or install it.`;
  if (/EACCES|permission denied/i.test(text))
    return `The command "${spec.type === "stdio" ? spec.command : spec.url}" is not allowed to run (permission denied).`;
  if (/timed out/i.test(text)) return "The server did not answer in 20 seconds.";
  if (/ECONNREFUSED/i.test(text)) return "Nothing answers at that address. Is the server running?";
  if (/ENOTFOUND|getaddrinfo/i.test(text))
    return "The host name was not found. Check the URL, or connect to the VPN it needs.";
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(text))
    return "The server refused the credentials. Check the key under Secrets.";
  if (/Connection closed|exited|closed/i.test(text))
    return "The server stopped right after starting. Its log below usually says why.";
  return text.slice(0, 300);
}

/** Starts a server once, lists its tools and stops it. */
export async function probeMcpServer(spec: McpServerSpec, timeoutMs = 20_000): Promise<McpProbe> {
  const started = Date.now();
  const client = new Client({ name: "aura-probe", version: "1" });
  const stderr: string[] = [];
  try {
    const transport =
      spec.type === "http"
        ? new StreamableHTTPClientTransport(new URL(spec.url))
        : new StdioClientTransport({
            command: spec.command,
            args: spec.args,
            env: spec.env,
            stderr: "pipe",
          });
    if (transport instanceof StdioClientTransport) {
      transport.stderr?.on("data", (chunk: Buffer | string) => {
        stderr.push(String(chunk));
        if (stderr.length > 200) stderr.shift();
      });
    }
    await withTimeout(client.connect(transport), timeoutMs);
    const listed = await withTimeout(client.listTools(), timeoutMs);
    return {
      ok: true,
      tools: listed.tools.map((t) => ({ name: t.name, description: t.description ?? "" })),
      error: null,
      log: tail(stderr),
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      tools: [],
      error: explainMcpError(error, spec),
      log: tail(stderr),
      ms: Date.now() - started,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function tail(chunks: string[]): string {
  return chunks.join("").split("\n").slice(-20).join("\n").trim().slice(-4000);
}
