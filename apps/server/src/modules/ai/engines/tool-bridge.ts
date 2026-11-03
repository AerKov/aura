import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { errorMessage, log } from "../../../lib/log";
import type { AgentTool } from "../../../providers/types";

/** Serves a run's app tools to an external agent (ADR 0012). */
export interface ToolEndpoint {
  url: string;
  close(): void;
}

export interface ToolBridgeLike {
  open(runId: string, tools: AgentTool[]): ToolEndpoint;
}

/**
 * Exposes the app's tools (create_project, tasks…) to external agents (Gemini CLI, Codex…) as an
 * MCP server over Streamable HTTP. Each run gets its own unguessable URL that dies with the run,
 * so an agent can only call the tools of its own run, and only while it runs.
 */
export class ToolBridge implements ToolBridgeLike {
  private readonly runs = new Map<string, { runId: string; tools: AgentTool[] }>();

  constructor(
    private readonly baseUrl: () => string,
    private readonly version: string,
  ) {}

  open(runId: string, tools: AgentTool[]): ToolEndpoint {
    const token = randomBytes(24).toString("hex");
    this.runs.set(token, { runId, tools });
    return {
      url: `${this.baseUrl()}/mcp/runs/${token}`,
      close: () => {
        this.runs.delete(token);
      },
    };
  }

  /** Stateless MCP: every request gets a fresh server with the run's tools. */
  async handle(token: string, request: Request): Promise<Response> {
    const run = this.runs.get(token);
    if (!run) return Response.json({ error: "Unknown or finished run" }, { status: 404 });
    const server = new McpServer({ name: "aura", version: this.version });
    for (const tool of run.tools) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        async (args: Record<string, unknown>) => {
          try {
            const result = await tool.handler(args);
            return {
              content: [{ type: "text" as const, text: result.text }],
              isError: result.isError ?? false,
            };
          } catch (error) {
            log.warn("app tool failed", {
              run: run.runId,
              tool: tool.name,
              error: errorMessage(error),
            });
            return {
              content: [{ type: "text" as const, text: errorMessage(error) }],
              isError: true,
            };
          }
        },
      );
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      void server.close();
    }
  }
}
