import { z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { AgentSetupService } from "./setup";

const ok = (text: string) => ({ text });
const fail = (error: unknown) => ({ text: `Error: ${errorMessage(error)}`, isError: true });

/**
 * Read-only diagnostics for the orchestrator (alpha feedback A7, B16): it can see how agents and
 * their tool servers are set up and test a server, but never secret values and never change
 * anything.
 */
export function agentSetupTools(setup: AgentSetupService): AgentTool[] {
  return [
    {
      name: "inspect_setup",
      description:
        "Read-only: how an agent is set up (engine, model, tools, variables by name, MCP servers, chats, last error, warnings), or all MCP servers and secret names when no agent is given. Use it when an agent does not answer or a tool is missing. Secret values are never shown.",
      inputSchema: {
        agent: z.string().optional().describe("agent handle without @"),
      },
      async handler(input) {
        try {
          if (typeof input.agent === "string" && input.agent) {
            const s = await setup.agentStatus(input.agent.replace(/^@/, ""));
            return ok(
              [
                `@${s.handle} (${s.name}): ${s.role}`,
                `engine: ${s.engine.label}${s.model ? ` (${s.model})` : ""}, ${s.engine.status.ok ? "ready" : `not ready: ${s.engine.status.reason}`}`,
                `tools: ${s.tools.join(", ") || "none"}${s.unsupported.length ? ` (not on this engine: ${s.unsupported.join(", ")})` : ""}`,
                `variables: ${s.env.map((e) => `${e.name}${e.set ? "" : " (no value)"}`).join(", ") || "none"}`,
                `shared variables: ${s.sharedEnv.map((e) => `${e.name} from ${e.from}${e.set ? "" : " (no value)"}`).join(", ") || "none"}`,
                `MCP servers: ${s.mcpServers.map((m) => m.name).join(", ") || "none"}`,
                `chats: ${s.chats.map((c) => c.title).join(", ") || "none"}`,
                `last run: ${s.lastRun ? `${s.lastRun.status}${s.lastRun.error ? `: ${s.lastRun.error}` : ""}` : "never"}`,
                ...(s.warnings.length ? ["warnings:", ...s.warnings.map((w) => `- ${w}`)] : []),
              ].join("\n"),
            );
          }
          const o = setup.overview();
          return ok(
            [
              `MCP servers: ${o.servers.length === 0 ? "none" : ""}`,
              ...o.servers.map(
                (s) =>
                  `- ${s.name}: ${s.url ?? [s.command, ...s.args].join(" ")} for ${s.agents.map((a) => `@${a}`).join(", ")}${
                    s.env.some((e) => !e.set)
                      ? ` (no value: ${s.env
                          .filter((e) => !e.set)
                          .map((e) => e.name)
                          .join(", ")})`
                      : ""
                  }`,
              ),
              `Secrets set: ${o.secrets.join(", ") || "none"}`,
              "The user manages these on the Agents page.",
            ].join("\n"),
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "test_mcp_server",
      description:
        "Start an MCP server once and report its tools, or why it fails (with its log). Read-only.",
      inputSchema: { name: z.string().describe("MCP server name") },
      async handler(input) {
        try {
          const r = await setup.testServer(String(input.name ?? ""));
          return ok(
            r.ok
              ? `Works (${r.ms} ms). Tools: ${r.tools.map((t) => t.name).join(", ") || "none"}.${r.error ? ` Note: ${r.error}` : ""}`
              : `Fails: ${r.error}${r.log ? `\nServer log:\n${r.log}` : ""}`,
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
