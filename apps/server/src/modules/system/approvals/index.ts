import { Elysia, t } from "elysia";
import type { ChatRepo } from "../../chats/chat/repo";
import { ProjectError, type ProjectService } from "../../chats/projects/service";
import { TaskError, type TaskService } from "../../chats/tasks/service";
import { SkillError, type SkillService } from "../../helpers/skills/service";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { type ApprovalService, toCard } from "./service";

export interface ControlDeps {
  sessions: LocalSessions;
  approvals: ApprovalService;
  skills: SkillService;
  tasks: TaskService;
  projects: ProjectService;
  repo: ChatRepo;
}

/** Turns validation errors from services into 400 responses. */
async function clientErrors<T>(
  fn: () => Promise<T>,
  status: (code: 400, body: { error: string }) => unknown,
) {
  try {
    return await fn();
  } catch (error) {
    if (
      error instanceof SkillError ||
      error instanceof TaskError ||
      error instanceof ProjectError
    ) {
      return status(400, { error: error.message });
    }
    throw error;
  }
}

/** The user's controls over agents: approvals, skills and tasks (Phase 4). */
export const controlModule = ({
  sessions,
  approvals,
  skills,
  tasks,
  projects,
  repo,
}: ControlDeps) =>
  new Elysia({ name: "control" })
    .use(authGuard(sessions))
    .get("/approvals", async () => (await approvals.listPending()).map(toCard), { auth: true })
    .post(
      "/approvals/:approvalId/decide",
      async ({ params, body, user }) =>
        toCard(await approvals.decide(params.approvalId, body.approve, user.id)),
      { auth: true, body: t.Object({ approve: t.Boolean() }) },
    )
    .get("/skills", () => skills.list(), { auth: true })
    .get(
      "/skills/:name",
      ({ params, status }) => {
        const content = skills.read(params.name);
        return content === null
          ? status(404, { error: "Skill not found" })
          : { name: params.name, content };
      },
      { auth: true },
    )
    .post(
      "/skills/:name/rollback",
      ({ params, body, status }) =>
        clientErrors(async () => ({ ref: await skills.rollback(params.name, body.ref) }), status),
      { auth: true, body: t.Object({ ref: t.String({ maxLength: 40 }) }) },
    )
    .get(
      "/projects/:projectId/tasks",
      async ({ params, status }) =>
        (await projects.get(params.projectId))
          ? tasks.list(params.projectId)
          : status(404, { error: "Project not found" }),
      { auth: true },
    )
    .post(
      "/projects/:projectId/tasks",
      async ({ params, body, status }) => {
        const project = await projects.get(params.projectId);
        if (!project) return status(404, { error: "Project not found" });
        return clientErrors(async () => {
          const chat = await repo.getChat(project.chatId);
          return tasks.create({
            chat,
            title: body.title,
            description: body.description,
            assignee: body.assignee,
            createdBy: "owner",
            chainDepth: 0,
          });
        }, status);
      },
      {
        auth: true,
        body: t.Object({
          title: t.String({ maxLength: 140 }),
          description: t.String({ maxLength: 4000 }),
          assignee: t.String({ maxLength: 40 }),
        }),
      },
    )
    .patch(
      "/tasks/:taskId",
      ({ params, body, status }) => clientErrors(() => tasks.update(params.taskId, body), status),
      {
        auth: true,
        body: t.Object({
          status: t.Optional(
            t.Union([
              t.Literal("todo"),
              t.Literal("doing"),
              t.Literal("done"),
              t.Literal("blocked"),
            ]),
          ),
          note: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
        }),
      },
    );
