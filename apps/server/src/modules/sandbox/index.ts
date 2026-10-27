import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
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
        body: t.Object({
          mode: t.Optional(t.UnionEnum(["auto", "required", "off"])),
          allowedDomains: t.Optional(t.Array(t.String({ maxLength: 253 }), { maxItems: 200 })),
          container: t.Optional(
            t.Object({
              newProjects: t.Optional(t.Boolean()),
              image: t.Optional(t.String({ maxLength: 300 })),
              network: t.Optional(t.Boolean()),
              memoryMb: t.Optional(t.Integer()),
              cpus: t.Optional(t.Number()),
            }),
          ),
        }),
      },
    );
