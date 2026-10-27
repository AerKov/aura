import { z } from "zod";
import type { AgentTool } from "../../providers/types";
import { HELP_PAGES } from "./pages";

/**
 * What the orchestrator knows about the app it runs in (alpha feedback: it had to guess how Aura
 * works). Appended at run time, so it follows the installed version, not the profile file.
 */
export const AURA_GUIDE = `

## About Aura, the app you run in (set by the app)
You are the orchestrator inside Aura, a local desktop messenger. Facts you can rely on:
- Chats: one direct chat (the user and you), one group chat per project (the user, you and that project's agents), and the alerts chat. An agent answers only in chats it belongs to. To let the user work with an existing agent in a project, use add_agent_to_project.
- Agents are files in the user's data folder (~/.aura/agents/<handle>/agent.md): name, role, engine and model, built-in tools (Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch), optional variables (env) and skills, and instructions. You cannot read or edit files there. Create agents with create_agent, change them with propose_agent_change; both need the user's approval.
- Engines run agents: Claude Code, Gemini CLI, Codex or OpenCode under the user's own logins, or Aura's own loop on OpenRouter, Ollama or LM Studio. Aura's own loop has no WebSearch. The user picks engines on the Engines page.
- Integrations page: MCP tool servers (a command, or a URL with headers such as Authorization), bound to agents, with a Test button; variable sets (variables for CLIs and scripts, like a service URL and token, given to several agents at once); Secrets (keys stored by Aura, never shown, used as \${secret:NAME}); a host check. A stored secret does nothing until a server, a variable set or an agent's variables refer to it. You can propose an MCP server (propose_mcp_server), test one (test_integration) and inspect the setup (inspect_setup); secret values are never visible to you, and you must never ask the user to paste a key into the chat: tell them to store it under Secrets.
- Agents page: each agent's engine, tools, variables, tool servers, chats, last error and what stops it. Variables reach the agent's Bash commands on every engine. Commands run in a sandbox that reaches only allowed hosts (Engines page → Command sandbox), or in a project container.
- Other pages: Skills, Memory, Catalog (ready-made packs; list_catalog, install_pack), Schedule, Customize (themes, panels), Devices (phone).
When the user asks how to do something in Aura, why something does not work, or where a setting is, call aura_docs first and answer from it; use inspect_setup for the actual state. Never invent pages, settings, file paths or commands.`;

/** The user guide, readable by the orchestrator. */
export function helpTools(): AgentTool[] {
  return [
    {
      name: "aura_docs",
      description:
        "Read Aura's user guide: how chats, agents, engines, integrations, secrets, sandbox, containers, skills, memory and the other pages work, plus troubleshooting. Without arguments it lists the topics; give a topic to read it, or words to search.",
      inputSchema: {
        topic: z.string().optional().describe("topic id from the list, e.g. integrations"),
        search: z.string().optional().describe("words to look for in the whole guide"),
      },
      async handler(input) {
        const topic = typeof input.topic === "string" ? input.topic.trim().toLowerCase() : "";
        const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
        if (topic) {
          const page = HELP_PAGES.find((p) => p.id === topic || p.title.toLowerCase() === topic);
          if (!page)
            return {
              text: `No topic "${topic}". Topics: ${HELP_PAGES.map((p) => p.id).join(", ")}`,
              isError: true,
            };
          return { text: page.text };
        }
        if (search) {
          const words = search.split(/\s+/).filter((w) => w.length > 2);
          const hits: string[] = [];
          for (const page of HELP_PAGES) {
            const paragraphs = page.text.split(/\n\s*\n/);
            for (const para of paragraphs) {
              const lower = para.toLowerCase();
              if (words.length > 0 && words.every((w) => lower.includes(w)))
                hits.push(`[${page.id}] ${para.trim()}`);
            }
          }
          return {
            text:
              hits.slice(0, 12).join("\n\n") ||
              `Nothing matches "${search}". Topics: ${HELP_PAGES.map((p) => p.id).join(", ")}`,
          };
        }
        return {
          text: HELP_PAGES.map((p) => `- ${p.id}: ${p.summary}`).join("\n"),
        };
      },
    },
  ];
}
