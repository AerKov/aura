import { Elysia, t } from "elysia";
import { LifecycleError } from "../apps/lifecycle";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { RestorePointError, type RestorePointService } from "./restore-points";

const ID = t.String({ pattern: "^\\d{8}T\\d{6}-[a-z0-9]{4}$" });

function userError(error: unknown): string | null {
  return error instanceof RestorePointError || error instanceof LifecycleError
    ? error.message
    : null;
}

/** Restore points of the whole Aura (ADR 0033); part of the core, always on. */
export const restorePointsModule = ({
  sessions,
  points,
}: {
  sessions: LocalSessions;
  points: RestorePointService;
}) =>
  new Elysia({ name: "restore-points" })
    .use(authGuard(sessions))
    .get("/restore-points", () => points.list(), { auth: true })
    .post("/restore-points", ({ body }) => points.create(body.label), {
      auth: true,
      body: t.Object({ label: t.String({ maxLength: 100 }) }),
    })
    .post(
      "/restore-points/:id/restore",
      async ({ params, status }) => {
        try {
          return await points.restore(params.id);
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(400, { error: message });
          throw error;
        }
      },
      { auth: true, params: t.Object({ id: ID }) },
    )
    .delete(
      "/restore-points/:id",
      ({ params, status }) => {
        try {
          points.delete(params.id);
          return { ok: true };
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(404, { error: message });
          throw error;
        }
      },
      { auth: true, params: t.Object({ id: ID }) },
    );
