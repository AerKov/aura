import { LayoutError } from "@aura/shared";
import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { LayoutService } from "./service";

export const shellModule = (deps: { sessions: LocalSessions; layout: LayoutService }) =>
  new Elysia({ name: "shell" })
    .use(authGuard(deps.sessions))
    .get("/layout", () => deps.layout.get(), { auth: true })
    .put(
      "/layout",
      async ({ body, status }) => {
        try {
          return await deps.layout.set(body);
        } catch (error) {
          if (error instanceof LayoutError) return status(400, { error: error.message });
          throw error;
        }
      },
      { auth: true, body: t.Object({ root: t.Unknown(), focused: t.String({ maxLength: 8 }) }) },
    );
