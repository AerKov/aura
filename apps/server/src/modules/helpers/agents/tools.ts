import { budgetText, ENGINE_IDS, formatTokens } from "@aura/shared";
import { z } from "zod";
import { unifiedDiff } from "../../../lib/diff";
import { commitAll } from "../../../lib/git";
import type { AgentTool } from "../../../providers/types";
import type { JobInput } from "../../automations/jobs/service";
import { jobTools } from "../../automations/jobs/tools";
import { chatTools } from "../../chats/chat/tools";
import { fileTools } from "../../chats/files/tools";
import { type ProjectInput, validBudget } from "../../chats/projects/service";
import { taskTools } from "../../chats/tasks/tools";
import { PLAIN_CHANGES, plainChanges } from "../../system/approvals/plain";
import { memoryTools } from "../memory/tools";
import { skillTool } from "../skills/tools";
import { secretRef } from "./env";
import {
  type AgentProfile,
  BUILTIN_TOOLS,
  ORCHESTRATOR_HANDLE,
  serializeAgentFile,
  validateProfile,
} from "./profiles";
import { fail, ok, type ToolContext, type ToolDeps } from "./tool-kit";

export type { ToolContext, ToolDeps } from "./tool-kit";

const agentShape = {
  handle: z.string().describe("lowercase handle without @, e.g. coder"),
  name: z.string().describe("display name"),
  role: z.string().describe("one sentence: what this agent owns"),
  system_prompt: z.string().describe("the agent's instructions"),
  tools: z.array(z.enum(BUILTIN_TOOLS)).describe("built-in tools to grant (least privilege)"),
  engine: z
    .enum(ENGINE_IDS)
    .optional()
    .describe("what runs the agent; omit for the user's default engine (usually best)"),
  model: z.string().optional().describe("model id for that engine; omit for the default"),
  budget_usd: z
    .number()
    .optional()
    .describe("lifetime dollar limit for this agent; only for paid APIs"),
  budget_tokens: z
    .number()
    .int()
    .optional()
    .describe("lifetime token limit for this agent; for subscription engines"),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      `variables for the agent's commands: plain values, or ${secretRef("NAME")} for keys the user stores under Secrets on the Agents page. Never put a key's value here.`,
    ),
};

function profileFrom(input: Record<string, unknown>): AgentProfile {
  return validateProfile({
    handle: input.handle,
    name: input.name,
    role: input.role,
    engine: input.engine,
    systemPrompt: input.system_prompt,
    tools: input.tools,
    model: input.model,
    budgetUsd: input.budget_usd,
    budgetTokens: input.budget_tokens,
    skills: [],
    env: input.env,
  });
}

function describeAgent(p: AgentProfile, isNew: boolean): string {
  const limit = budgetText({ usd: p.budgetUsd, tokens: p.budgetTokens ?? null });
  const budget = limit === "no limit" ? "" : ` · limit ${limit}`;
  const engine = p.engine ? ` · engine: ${p.engine}${p.model ? ` / ${p.model}` : ""}` : "";
  return `- **@${p.handle}**${isNew ? " (new)" : ""}: ${p.role} · tools: ${p.builtinTools.join(", ") || "none"}${engine}${budget}`;
}

/** An existing profile with the fields an agent_change request sets. */
function changedProfile(current: AgentProfile, change: Record<string, unknown>): AgentProfile {
  return validateProfile({
    handle: current.handle,
    name: current.name,
    role: change.role ?? current.role,
    engine: current.engine,
    model: current.model,
    systemPrompt: change.system_prompt ?? current.systemPrompt,
    tools: change.tools ?? current.builtinTools,
    budgetUsd: current.budgetUsd,
    budgetTokens: current.budgetTokens,
    skills: current.skills,
    env: change.env ?? current.env,
  });
}

/** Registers the effects that run after the user approves a request. */
export function registerExecutors(deps: ToolDeps): void {
  deps.approvals.register("create_agent", async (payload) => {
    const profile = profileFrom(payload);
    await deps.agents.create(profile);
    return `Created @${profile.handle}.`;
  });
  deps.approvals.register("agent_change", async (payload, ctx) => {
    const current = await deps.agents.get(String(payload.handle));
    if (!current) throw new Error(`@${String(payload.handle)} no longer exists`);
    const next = changedProfile(current, payload);
    await deps.agents.update(next);
    if (deps.dataDir)
      await commitAll(
        deps.dataDir,
        `agents(@${next.handle}): ${String(payload.summary)}`,
        ctx.requestedBy,
      );
    return `Updated @${next.handle}: ${String(payload.summary)}. It applies from its next reply.`;
  });
  deps.approvals.register("budget_change", async (payload) => {
    const usd = typeof payload.usd === "number" ? payload.usd : null;
    const tokens = typeof payload.tokens === "number" ? payload.tokens : null;
    if (payload.target === "project") {
      const project = await deps.projects.setBudget(String(payload.id), { usd, tokens });
      return `Budget of ${project.name}: ${budgetText({ usd, tokens })}.`;
    }
    const current = await deps.agents.get(String(payload.id));
    if (!current) throw new Error(`@${String(payload.id)} no longer exists`);
    const next = validateProfile({
      ...current,
      tools: current.builtinTools,
      budgetUsd: usd,
      budgetTokens: tokens,
    });
    await deps.agents.update(next);
    if (deps.dataDir)
      await commitAll(
        deps.dataDir,
        `agents(@${next.handle}): budget ${budgetText({ usd, tokens })}`,
        "owner",
      );
    return `Budget of @${next.handle}: ${budgetText({ usd, tokens })}.`;
  });
  deps.approvals.register("schedule_job", async (payload) => {
    const job = await deps.jobs.create(payload as unknown as JobInput);
    return `Scheduled "${job.name}" (${job.schedule}); next run ${job.nextRunAt ?? "never"}.`;
  });
  deps.approvals.register("create_project", async (payload) => {
    const newAgents = ((payload.newAgents as Record<string, unknown>[] | undefined) ?? []).map(
      profileFrom,
    );
    const input = payload.project as ProjectInput;
    // Re-validate at execution time: things may have changed since the request.
    for (const agent of newAgents) {
      if (await deps.agents.get(agent.handle)) throw new Error(`@${agent.handle} already exists`);
    }
    await deps.projects.validate(
      input,
      newAgents.map((a) => a.handle),
    );
    for (const agent of newAgents) await deps.agents.create(agent);
    const { project } = await deps.projects.create(input);
    return `Created project "${project.name}"${newAgents.length ? ` and ${newAgents.map((a) => `@${a.handle}`).join(", ")}` : ""}. The team has started.`;
  });
}

/** App tools for an agent run, by role and chat (exposed to the model over MCP). */
export function toolsFor(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  const tools: AgentTool[] = [skillTool(deps, ctx), ...memoryTools(deps, ctx)];
  if (ctx.handle === ORCHESTRATOR_HANDLE)
    tools.push(...orchestratorTools(deps, ctx), ...chatTools(deps, ctx), ...jobTools(deps, ctx));
  if (ctx.chat.projectId) tools.push(...taskTools(deps, ctx), ...fileTools(deps, ctx));
  return tools;
}

function orchestratorTools(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  return [
    {
      name: "list_agents",
      description: "List existing agents with their roles, tools and skills.",
      inputSchema: {},
      async handler() {
        const agents = await deps.agents.list();
        return ok(
          agents
            .map(
              (a) =>
                `@${a.handle} (${a.name}): ${a.role} · tools: ${a.builtinTools.join(", ") || "none"}${a.engine ? ` · engine: ${a.engine}` : ""}${a.skills.length ? ` · skills: ${a.skills.join(", ")}` : ""}`,
            )
            .join("\n") || "No agents yet.",
        );
      },
    },
    {
      name: "create_agent",
      description:
        "Ask the user to approve a new agent. The agent exists only after approval; to start a project with new agents, use create_project with new_agents instead.",
      inputSchema: {
        ...PLAIN_CHANGES,
        ...agentShape,
        why: z.string().describe("why this agent is needed"),
      },
      async handler(input) {
        try {
          const profile = profileFrom(input);
          if (await deps.agents.get(profile.handle))
            throw new Error(`@${profile.handle} already exists`);
          await deps.approvals.request({
            kind: "create_agent",
            requestedBy: ctx.handle,
            chatId: ctx.chat.id,
            topicId: ctx.topicId,
            title: `Create agent @${profile.handle}`,
            why: String(input.why ?? ""),
            changes: plainChanges(input),
            preview: `${describeAgent(profile, true)}\n\n**Prompt**\n\n${profile.systemPrompt}`,
            payload: input,
          });
          return ok(
            `Approval requested for @${profile.handle}. It is created when the user approves.`,
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "propose_agent_change",
      description: `Ask the user to approve a change to an existing agent: its tools, the variables its commands get, its role or its instructions. The card shows the exact diff of its agent.md. Only the fields you pass change. Secret values never go here: use ${secretRef("NAME")} and ask the user to store the value under Secrets on the Agents page.`,
      inputSchema: {
        ...PLAIN_CHANGES,
        agent: z.string().describe("handle without @"),
        tools: z
          .array(z.enum(BUILTIN_TOOLS))
          .optional()
          .describe("the full new list of built-in tools"),
        env: agentShape.env,
        role: z.string().optional(),
        system_prompt: z.string().optional().describe("the full new instructions"),
        why: z.string().describe("one sentence for the user"),
      },
      async handler(input) {
        try {
          const handle = String(input.agent ?? "").replace(/^@/, "");
          const current = await deps.agents.get(handle);
          if (!current) throw new Error(`@${handle} does not exist`);
          if (handle === ORCHESTRATOR_HANDLE)
            throw new Error(
              "the orchestrator's own profile is changed by the user, not by request",
            );
          const next = changedProfile(current, input);
          const before = serializeAgentFile(current);
          const after = serializeAgentFile(next);
          if (before === after)
            return ok(`Nothing to change: @${handle} is already set up like that.`);
          const changed = [
            input.tools !== undefined ? "tools" : "",
            input.env !== undefined ? "variables" : "",
            input.role !== undefined ? "role" : "",
            input.system_prompt !== undefined ? "instructions" : "",
          ].filter(Boolean);
          const summary = `update ${changed.join(", ")}`;
          await deps.approvals.request({
            kind: "agent_change",
            requestedBy: ctx.handle,
            chatId: ctx.chat.id,
            topicId: ctx.topicId,
            title: `Change @${handle}: ${changed.join(", ")}`,
            why: String(input.why ?? ""),
            changes: plainChanges(input),
            preview: `\`\`\`diff\n${unifiedDiff(before, after, `agents/${handle}/agent.md`)}\n\`\`\``,
            payload: {
              handle,
              summary,
              ...(input.tools !== undefined ? { tools: input.tools } : {}),
              ...(input.env !== undefined ? { env: input.env } : {}),
              ...(input.role !== undefined ? { role: input.role } : {}),
              ...(input.system_prompt !== undefined ? { system_prompt: input.system_prompt } : {}),
            },
          });
          return ok(`Approval requested to change @${handle}. It applies when the user approves.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "propose_budget",
      description:
        "Ask the user to approve a new limit for a project or an agent (it replaces both limits). Tokens suit subscription engines (Claude Code, Gemini CLI, Codex, OpenCode, local models); dollars only paid APIs. Pass neither to remove the limit.",
      inputSchema: {
        ...PLAIN_CHANGES,
        project: z.string().optional().describe("project id (slug), or"),
        agent: z.string().optional().describe("agent handle without @"),
        tokens: z.number().int().optional().describe("token limit"),
        usd: z.number().optional().describe("dollar limit"),
        why: z.string(),
      },
      async handler(input) {
        try {
          const usd = typeof input.usd === "number" ? input.usd : null;
          const tokens = typeof input.tokens === "number" ? input.tokens : null;
          validBudget({ usd, tokens });
          let target: { target: "project" | "agent"; id: string; name: string; now: string };
          if (typeof input.project === "string" && input.project) {
            const p = await deps.projects.get(input.project);
            if (!p) throw new Error(`No project "${input.project}"; see list_projects`);
            target = {
              target: "project",
              id: p.id,
              name: `project ${p.name}`,
              now: `${budgetText({ usd: p.budgetUsd, tokens: p.budgetTokens })}, used ${formatTokens(p.spentTokens)} tokens`,
            };
          } else if (typeof input.agent === "string" && input.agent) {
            const handle = input.agent.replace(/^@/, "");
            const a = await deps.agents.get(handle);
            if (!a) throw new Error(`@${handle} does not exist`);
            target = {
              target: "agent",
              id: handle,
              name: `@${handle}`,
              now: budgetText({ usd: a.budgetUsd, tokens: a.budgetTokens ?? null }),
            };
          } else throw new Error("give a project or an agent");
          await deps.approvals.request({
            kind: "budget_change",
            requestedBy: ctx.handle,
            chatId: ctx.chat.id,
            topicId: ctx.topicId,
            title: `Budget of ${target.name}: ${budgetText({ usd, tokens })}`,
            why: String(input.why ?? ""),
            changes: plainChanges(input),
            preview: `Now: ${target.now}.\nAfter: ${budgetText({ usd, tokens })}.`,
            payload: { target: target.target, id: target.id, usd, tokens },
          });
          return ok("Approval requested for the budget.");
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "add_agent_to_project",
      description:
        "Add an existing agent to a project's chat, so it can be mentioned and assigned there. Agents answer only in chats they belong to.",
      inputSchema: {
        agent: z.string().describe("handle without @"),
        project: z.string().describe("project id (slug) from list_projects"),
      },
      async handler(input) {
        try {
          const handle = String(input.agent ?? "").replace(/^@/, "");
          if (!(await deps.agents.get(handle))) throw new Error(`@${handle} does not exist`);
          const project = await deps.projects.get(String(input.project ?? ""));
          if (!project) throw new Error(`No project "${String(input.project)}"; see list_projects`);
          const participant = { kind: "agent" as const, id: handle };
          if (await deps.repo.isMember(project.chatId, participant))
            return ok(`@${handle} is already in "${project.name}".`);
          await deps.repo.addMember(project.chatId, participant, "member");
          await deps.repo.createMessage({
            chatId: project.chatId,
            author: { kind: "bot", id: "system" },
            kind: "system",
            body: `@${ctx.handle} added @${handle} to the project.`,
          });
          return ok(`Added @${handle} to "${project.name}". Mention it in that chat to start.`);
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
                `${p.name} (${p.id}) · ${p.status} · used ${formatTokens(p.spentTokens)} tokens (≈ $${p.spentUsd.toFixed(2)} at API prices) · budget: ${budgetText({ usd: p.budgetUsd, tokens: p.budgetTokens })}`,
            )
            .join("\n") || "No projects yet.",
        );
      },
    },
    {
      name: "create_project",
      description:
        "Ask the user to approve a project plan: a group with a folder (the user sees projects as groups with a folder): a group chat with the agents, a git workspace and an optional budget, plus any new agents. Nothing is created until the user approves. The brief becomes your first message in the project chat and must @mention the agent who starts. Without a budget the project has no limit (the chain-depth guard still applies); suggest one only when the user asks or the work is open-ended.",
      inputSchema: {
        ...PLAIN_CHANGES,
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
        agents: z
          .array(z.string())
          .describe("handles of all project agents (existing and new), without @"),
        new_agents: z
          .array(z.object(agentShape))
          .optional()
          .describe("agents to create together with the project"),
        start_with: z
          .string()
          .describe("handle of the agent who starts; only this agent is woken by the brief"),
        budget_tokens: z
          .number()
          .int()
          .optional()
          .describe(
            "token limit for the whole project; use this on subscription engines (Claude Code, Gemini CLI, Codex, OpenCode, local models)",
          ),
        budget_usd: z
          .number()
          .optional()
          .describe("dollar limit; only for paid APIs (an OpenAI-compatible API)"),
        why: z.string().describe("one or two sentences for the user: what this project delivers"),
      },
      async handler(input) {
        try {
          const newAgentInputs = (
            Array.isArray(input.new_agents) ? input.new_agents : []
          ) as Record<string, unknown>[];
          const newAgents = newAgentInputs.map(profileFrom);
          for (const agent of newAgents) {
            if (await deps.agents.get(agent.handle))
              throw new Error(`@${agent.handle} already exists; list it in agents only`);
          }
          const project: ProjectInput = {
            name: String(input.name ?? ""),
            slug: typeof input.slug === "string" ? input.slug : undefined,
            brief: String(input.brief ?? ""),
            agents: Array.isArray(input.agents) ? input.agents.map(String) : [],
            budgetUsd: typeof input.budget_usd === "number" ? input.budget_usd : null,
            budgetTokens: typeof input.budget_tokens === "number" ? input.budget_tokens : null,
            startWith: typeof input.start_with === "string" ? input.start_with : undefined,
          };
          const valid = await deps.projects.validate(
            project,
            newAgents.map((a) => a.handle),
          );
          const existing = await Promise.all(
            valid.agents
              .filter((h) => !newAgents.some((a) => a.handle === h))
              .map((h) => deps.agents.get(h)),
          );
          const team = [
            ...newAgents.map((a) => describeAgent(a, true)),
            ...existing
              .filter((p): p is AgentProfile => p !== null)
              .map((p) => describeAgent(p, false)),
          ];
          await deps.approvals.request({
            kind: "create_project",
            requestedBy: ctx.handle,
            chatId: ctx.chat.id,
            topicId: ctx.topicId,
            title: `Start project "${valid.name}"`,
            why: String(input.why ?? ""),
            changes: plainChanges(input),
            preview: [
              `**Workspace:** \`projects/${valid.slug}\` · **budget:** ${budgetText({ usd: valid.budgetUsd, tokens: valid.budgetTokens })} · **starts:** @${valid.startWith}`,
              "",
              "**Team**",
              ...team,
              "",
              "**Brief**",
              "",
              valid.brief
                .split("\n")
                .map((l) => `> ${l}`)
                .join("\n"),
            ].join("\n"),
            payload: { project, newAgents: newAgentInputs },
          });
          return ok("Approval requested. The project starts when the user approves the plan.");
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
