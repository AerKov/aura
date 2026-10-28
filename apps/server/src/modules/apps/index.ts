import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { ProjectError } from "../projects/service";
import { AppError, type AppService } from "./service";

function appError(error: unknown): string | null {
  if (error instanceof AppError || error instanceof ProjectError) return error.message;
  return null;
}

/** Apps built in Aura (ADR 0024): create one, see its versions, restore one, drop a draft. */
export const appsModule = (deps: { sessions: LocalSessions; apps: AppService }) =>
  new Elysia({ name: "apps" })
    .use(authGuard(deps.sessions))
    .post(
      "/apps",
      async ({ body, status }) => {
        try {
          const { project, chat } = await deps.apps.create(body);
          return { id: project.id, chatId: chat.id };
        } catch (error) {
          const message = appError(error);
          if (message) return status(400, { error: message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Object({
          name: t.String({ maxLength: 60 }),
          id: t.Optional(t.String({ maxLength: 48 })),
          description: t.Optional(t.String({ maxLength: 4000 })),
        }),
      },
    )
    .get(
      "/apps/:appId/history",
      async ({ params, status }) => {
        try {
          return await deps.apps.history(params.appId);
        } catch (error) {
          const message = appError(error);
          if (message) return status(404, { error: message });
          throw error;
        }
      },
      { auth: true },
    )
    .post(
      "/apps/:appId/restore",
      async ({ params, body, status }) => {
        try {
          return { version: await deps.apps.restore(params.appId, body.version) };
        } catch (error) {
          const message = appError(error);
          if (message) return status(400, { error: message });
          throw error;
        }
      },
      { auth: true, body: t.Object({ version: t.String({ maxLength: 40 }) }) },
    )
    .post(
      "/apps/:appId/discard",
      async ({ params, status }) => {
        try {
          await deps.apps.discard(params.appId);
          return { ok: true };
        } catch (error) {
          const message = appError(error);
          if (message) return status(400, { error: message });
          throw error;
        }
      },
      { auth: true },
    );
