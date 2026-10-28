import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { ProjectError } from "../projects/service";
import type { AppDataService } from "./data";
import { AppError, type AppService } from "./service";

function appError(error: unknown): string | null {
  if (error instanceof AppError || error instanceof ProjectError) return error.message;
  return null;
}

/** Apps built in Aura (ADR 0024): create one, see its versions, restore one, drop a draft. */
export const appsModule = (deps: {
  sessions: LocalSessions;
  apps: AppService;
  appData: AppDataService;
}) =>
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
    )
    // The app's data (phase 24): where it is, how much, export, delete, move.
    .get(
      "/apps/:appId/data",
      async ({ params, status }) => {
        if (!deps.apps.isApp(params.appId)) return status(404, { error: "No such app" });
        return deps.appData.info(params.appId);
      },
      { auth: true },
    )
    .get(
      "/apps/:appId/data/export",
      async ({ params, set, status }) => {
        if (!deps.apps.isApp(params.appId)) return status(404, { error: "No such app" });
        set.headers["content-disposition"] = `attachment; filename="${params.appId}-data.json"`;
        return { app: params.appId, collections: await deps.appData.dump(params.appId) };
      },
      { auth: true },
    )
    .delete(
      "/apps/:appId/data",
      async ({ params, status }) => {
        if (!deps.apps.isApp(params.appId)) return status(404, { error: "No such app" });
        await deps.appData.clear(params.appId);
        return { ok: true };
      },
      { auth: true },
    )
    .put(
      "/apps/:appId/data/store",
      async ({ params, body, status }) => {
        if (!deps.apps.isApp(params.appId)) return status(404, { error: "No such app" });
        await deps.appData.moveTo(params.appId, body.store);
        return deps.appData.info(params.appId);
      },
      {
        auth: true,
        body: t.Object({ store: t.Union([t.Literal("database"), t.Literal("files")]) }),
      },
    );
