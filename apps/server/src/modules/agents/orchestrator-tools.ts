import { z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { ProjectService } from "../projects/service";
import type { AgentDirectory } from "./directory";
import { BUILTIN_TOOLS, validateProfile } from "./profiles";

const ok = (text: string) => ({ text });
const fail = (error: unknown) => ({ text: `Error: ${errorMessage(error)}`, isError: true });

/** App tools the orchestrator uses to build teams and projects (exposed over MCP by the provider). */
export function orchestratorTools(deps: {
  agents: AgentDirectory;
  projects: ProjectService;
}): AgentTool[] {
  return [
    {
      name: "list_agents",
      description: "List existing agents with their roles and tools.",
      inputSchema: {},
      async handler() {
        const agents = await deps.agents.list();
        return ok(
          agents
            .map(
              (a) =>
                `@${a.handle} (${a.name}): ${a.role} · tools: ${a.builtinTools.join(", ") || "none"}`,
            )
            .join("\n") || "No agents yet.",
        );
      },
    },
    {
      name: "create_agent",
      description:
        "Create a new agent profile (saved as a file and committed to git). Use after the user agreed to the plan.",
      inputSchema: {
        handle: z.string().describe("lowercase handle without @, e.g. coder"),
        name: z.string().describe("display name"),
        role: z.string().describe("one sentence: what this agent owns"),
        system_prompt: z.string().describe("the agent's instructions"),
        tools: z.array(z.enum(BUILTIN_TOOLS)).describe("built-in tools to grant (least privilege)"),
        model: z.string().optional().describe("model id; omit for the default"),
        budget_usd: z.number().optional().describe("lifetime spend limit for this agent"),
      },
      async handler(input) {
        try {
          const profile = validateProfile({
            handle: input.handle,
            name: input.name,
            role: input.role,
            systemPrompt: input.system_prompt,
            tools: input.tools,
            model: input.model,
            budgetUsd: input.budget_usd,
          });
          await deps.agents.create(profile);
          return ok(`Created @${profile.handle}.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "list_projects",
      description: "List projects with status, budget and spend.",
      inputSchema: {},
      async handler() {
        const projects = await deps.projects.list();
        return ok(
          projects
            .map(
              (p) =>
                `${p.name} (${p.id}) · ${p.status} · spent $${p.spentUsd.toFixed(2)} of $${p.budgetUsd?.toFixed(2) ?? "∞"}`,
            )
            .join("\n") || "No projects yet.",
        );
      },
    },
    {
      name: "create_project",
      description:
        "Create a project: a group chat with the agents, a git workspace and a budget. The brief is posted as your first message in the project chat and must @mention the agent who starts.",
      inputSchema: {
        name: z.string().describe("short project name"),
        slug: z
          .string()
          .optional()
          .describe("folder name: lowercase latin letters, digits, dashes"),
        brief: z
          .string()
          .describe(
            "markdown brief: goal, scope, done criteria, who starts (@mention) and hand-offs",
          ),
        agents: z.array(z.string()).describe("handles of existing agents to add, without @"),
        start_with: z
          .string()
          .describe("handle of the agent who starts; only this agent is woken by the brief"),
        budget_usd: z.number().describe("total budget in USD agreed with the user"),
      },
      async handler(input) {
        try {
          const { project } = await deps.projects.create({
            name: String(input.name),
            slug: typeof input.slug === "string" ? input.slug : undefined,
            brief: String(input.brief),
            agents: Array.isArray(input.agents) ? input.agents.map(String) : [],
            budgetUsd: Number(input.budget_usd),
            startWith:
              typeof input.start_with === "string" ? input.start_with.replace(/^@/, "") : undefined,
          });
          return ok(
            `Created project "${project.name}" (${project.id}). The team has started in its chat.`,
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
