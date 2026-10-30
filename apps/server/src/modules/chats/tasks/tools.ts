import type { TaskStatus } from "@aura/shared";
import { z } from "zod";
import type { AgentTool } from "../../../providers/types";
import { fail, ok, type ToolContext, type ToolDeps } from "../../helpers/agents/tool-kit";
import { TASK_STATUSES } from "./service";

export function taskTools(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  const projectId = ctx.chat.projectId ?? "";
  return [
    {
      name: "list_tasks",
      description: "List this project's tasks with ids, assignees and statuses.",
      inputSchema: {},
      async handler() {
        const tasks = await deps.tasks.list(projectId);
        return ok(
          tasks.map((t) => `${t.id} · [${t.status}] ${t.title} → @${t.assignee}`).join("\n") ||
            "No tasks yet.",
        );
      },
    },
    {
      name: "create_task",
      description:
        "Create a task and assign it to a project agent. The assignee is woken to work on it.",
      inputSchema: {
        title: z.string(),
        description: z.string().describe("what done looks like"),
        assignee: z.string().describe("agent handle without @"),
      },
      async handler(input) {
        try {
          const task = await deps.tasks.create({
            chat: ctx.chat,
            topicId: ctx.topicId,
            title: String(input.title ?? ""),
            description: String(input.description ?? ""),
            assignee: String(input.assignee ?? ""),
            createdBy: ctx.handle,
            chainDepth: ctx.depth + 1,
          });
          return ok(`Created task ${task.id} for @${task.assignee}.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "update_task",
      description: "Update a task's status (todo, doing, done, blocked) with an optional note.",
      inputSchema: {
        id: z.string(),
        status: z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]]),
        note: z.string().optional(),
      },
      async handler(input) {
        try {
          const task = await deps.tasks.update(
            String(input.id ?? ""),
            {
              status: input.status as TaskStatus,
              note: typeof input.note === "string" ? input.note : undefined,
            },
            projectId,
          );
          return ok(`Task ${task.id} is ${task.status}.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
