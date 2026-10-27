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
