import { isModuleId, MODULES } from "@aura/shared";
import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { ModuleService } from "./modules";

/**
 * Built-in apps on and off (ADR 0027). A turned-off app's routes answer 404 before anything else
 * runs, so its features are gone for every client, not only hidden.
 */
export const modulesModule = (deps: { sessions: LocalSessions; modules: ModuleService }) =>
  new Elysia({ name: "modules" })
    .onRequest(({ request, status }) => {
      const off = deps.modules.allows(new URL(request.url).pathname);
      if (off) return status(404, { error: `${MODULES[off].name} is turned off` });
    })
    .use(authGuard(deps.sessions))
    .put(
      "/modules/:moduleId",
      async ({ params, body, status }) => {
        if (!isModuleId(params.moduleId)) return status(404, { error: "No such app" });
        return deps.modules.set(params.moduleId, body.enabled);
      },
      {
        auth: true,
        body: t.Object({ enabled: t.Boolean() }),
        detail: { summary: "Turn a built-in app on or off, with what depends on it" },
      },
    );
