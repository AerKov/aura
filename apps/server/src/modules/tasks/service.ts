import type { Chat, Task, TaskCard, TaskStatus } from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { isoOf, keyOf, optionalKey } from "../../db/convert";
import type { ChatRepo } from "../chat/repo";
import type { ChatService } from "../chat/service";

export class TaskError extends Error {
  override name = "TaskError";
}

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "doing", "done", "blocked"];

type Row = Record<string, unknown>;

/**
 * Project tasks (docs/SPEC.md section 2). Assigning a task posts a task card that @mentions the
 * assignee, which wakes it (an agent acts when mentioned or assigned).
 */
export class TaskService {
  constructor(private readonly deps: { db: Surreal; repo: ChatRepo; chat: ChatService }) {}

  async list(projectId: string): Promise<Task[]> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM task WHERE project = $p ORDER BY created_at", { p: projectId })
      .collect();
    return (rows ?? []).map(toTask);
  }

  async get(id: string): Promise<(Task & { messageId: string | null }) | null> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM task WHERE id = $id", { id: new RecordId("task", id) })
      .collect();
    const row = rows?.[0];
    return row ? { ...toTask(row), messageId: optionalKey(row.message) } : null;
  }

  async create(input: {
    chat: Chat;
    title: string;
    description: string;
    assignee: string;
    createdBy: string;
    chainDepth: number;
  }): Promise<Task> {
    const { chat } = input;
    if (!chat.projectId) throw new TaskError("tasks belong to project chats");
    const title = input.title.trim();
    if (!title || title.length > 140) throw new TaskError("title is required (max 140 chars)");
    if (input.description.length > 4000)
      throw new TaskError("description is too long (max 4000 chars)");
    const assignee = input.assignee.replace(/^@/, "");
    if (!(await this.deps.repo.isMember(chat.id, { kind: "agent", id: assignee }))) {
      throw new TaskError(`@${assignee} is not in this project`);
    }

    const id = Bun.randomUUIDv7();
    await this.deps.db
      .query("CREATE $id CONTENT $content", {
        id: new RecordId("task", id),
        content: {
          project: chat.projectId,
          title,
          description: input.description.trim(),
          assignee,
          status: "todo",
          created_by: input.createdBy,
        },
      })
      .collect();
    const task = await this.mustGet(id);
    const author =
      input.createdBy === "owner"
        ? { kind: "user" as const, id: "owner" }
        : { kind: "agent" as const, id: input.createdBy };
    const message = await this.deps.repo.createMessage({
      chatId: chat.id,
      author,
      kind: "card",
      body: `@${assignee} task: **${title}**${task.description ? `\n\n${task.description}` : ""}`,
      card: toCard(task),
      mentions: [assignee],
      chainDepth: input.chainDepth,
    });
    await this.deps.db
      .query("UPDATE $id SET message = $m", {
        id: new RecordId("task", id),
        m: new RecordId("message", message.id),
      })
      .collect();
    // The card wakes the assignee like a mention does (see agentsToTrigger).
    this.deps.chat.notify(message, chat);
    return task;
  }

  async update(
    id: string,
    input: { status?: TaskStatus; note?: string | null },
    projectId?: string,
  ): Promise<Task> {
    const task = await this.mustGet(id);
    if (projectId && task.projectId !== projectId)
      throw new TaskError("task is in another project");
    if (input.status && !TASK_STATUSES.includes(input.status))
      throw new TaskError("invalid status");
    await this.deps.db
      .query("UPDATE $id MERGE $data", {
        id: new RecordId("task", id),
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.note !== undefined ? { note: input.note ?? undefined } : {}),
          updated_at: new Date(),
        },
      })
      .collect();
    const updated = await this.mustGet(id);
    if (updated.messageId)
      await this.deps.repo.updateMessage(updated.messageId, { card: toCard(updated) });
    return updated;
  }

  private async mustGet(id: string) {
    const task = await this.get(id);
    if (!task) throw new TaskError(`task ${id} not found`);
    return task;
  }
}

function toTask(row: Row): Task {
  return {
    id: keyOf(row.id),
    projectId: String(row.project),
    title: String(row.title),
    description: String(row.description ?? ""),
    assignee: String(row.assignee),
    status: row.status as TaskStatus,
    createdBy: String(row.created_by),
    note: (row.note as string | undefined) ?? null,
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  };
}

function toCard(task: Task): TaskCard {
  return {
    type: "task",
    taskId: task.id,
    title: task.title,
    assignee: task.assignee,
    status: task.status,
  };
}
