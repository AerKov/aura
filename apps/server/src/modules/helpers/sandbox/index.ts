import { Elysia, t } from "elysia";
import { authGuard } from "../../system/auth";
import type { LocalSessions } from "../../system/auth/sessions";
import type { SandboxService } from "./service";
import { SandboxSettingsError } from "./settings";

export interface SandboxDeps {
  sessions: LocalSessions;
  sandbox: SandboxService;
}

/** Command sandbox settings and status (ADR 0015). */
export const sandboxModule = ({ sessions, sandbox }: SandboxDeps) =>
  new Elysia({ name: "sandbox" })
    .use(authGuard(sessions))
    .get("/sandbox", () => sandbox.status(), { auth: true })
    .put(
      "/sandbox",
      async ({ body, status }) => {
        try {
          await sandbox.update(body);
          return sandbox.status();
        } catch (error) {
          if (error instanceof SandboxSettingsError) return status(400, { error: error.message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Object({ mode: t.Optional(t.UnionEnum(["auto", "required", "off"])) }),
      },
    );
