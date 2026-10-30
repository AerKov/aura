import { z } from "zod";
import type { AgentTool } from "../../../providers/types";
import { SYSTEM_CHAT_ID } from "../../chats/chat/repo";
import { fail, ok, type ToolContext, type ToolDeps } from "../../helpers/agents/tool-kit";
import { PLAIN_CHANGES, plainChanges } from "../../system/approvals/plain";

/** Orchestrator tools for schedules (ADR 0010): list jobs, and ask to schedule one. */
export function jobTools(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  const resolveChat = async (target: string) => {
    if (target === "direct") return deps.repo.getChat("direct");
    if (target === "alerts" || target === SYSTEM_CHAT_ID) return deps.repo.getChat(SYSTEM_CHAT_ID);
    const project = await deps.projects.get(target);
    if (!project)
      throw new Error(`unknown chat "${target}": use "direct", "alerts" or a project id`);
    return deps.repo.getChat(project.chatId);
  };
  return [
    {
      name: "list_jobs",
      description: "List scheduled jobs.",
      inputSchema: {},
      async handler() {
        const jobs = await deps.jobs.list();
        return ok(
          jobs
            .map(
              (j) =>
                `${j.name} · ${j.schedule} · @${j.agent} · ${j.status} · next ${j.nextRunAt ?? "-"}`,
            )
            .join("\n") || "No jobs yet.",
        );
      },
    },
    {
      name: "schedule_job",
      description:
        "Ask the user to approve a recurring job: on a cron schedule, the prompt is posted to a chat and wakes the agent. Each run costs budget, so keep schedules sparse (at most every 10 minutes).",
      inputSchema: {
        ...PLAIN_CHANGES,
        name: z.string(),
        schedule: z
          .string()
          .describe("5-field cron in the user's local time, e.g. '0 8 * * *' for 08:00 daily"),
        chat: z.string().describe('"direct", "alerts" or a project id'),
        agent: z.string().describe("handle of the agent to wake (must be a member of that chat)"),
        prompt: z.string().describe("what the agent should do on each run"),
        why: z.string().describe("for the user: what this job delivers"),
      },
      async handler(input) {
        try {
          const chat = await resolveChat(String(input.chat ?? ""));
          const valid = await deps.jobs.validate({
            name: String(input.name ?? ""),
            schedule: String(input.schedule ?? ""),
            chatId: chat.id,
            agent: String(input.agent ?? ""),
            prompt: String(input.prompt ?? ""),
          });
          const next = Bun.cron.parse(valid.schedule, new Date());
          await deps.approvals.request({
            kind: "schedule_job",
            requestedBy: ctx.handle,
            chatId: ctx.chat.id,
            topicId: ctx.topicId,
            title: `Schedule "${valid.name}"`,
            why: String(input.why ?? ""),
            changes: plainChanges(input),
            preview: [
              `**When:** \`${valid.schedule}\`${next ? ` · first run ${next.toLocaleString()}` : ""}`,
              `**Where:** ${chat.title} · **who:** @${valid.agent}`,
              "",
              valid.prompt
                .split("\n")
                .map((l) => `> ${l}`)
                .join("\n"),
            ].join("\n"),
            payload: { ...valid },
          });
          return ok("Approval requested for the job.");
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
