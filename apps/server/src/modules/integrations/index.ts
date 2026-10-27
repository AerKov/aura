import { Elysia, t } from "elysia";
import { ProfileError } from "../agents/profiles";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { McpError } from "../customize/mcp";
import { SecretError } from "./secrets";
import { IntegrationError, type IntegrationsService } from "./service";

export interface IntegrationsDeps {
  sessions: LocalSessions;
  integrations: IntegrationsService;
}

const NAME = t.String({ pattern: "^[a-z][a-z0-9_-]{1,31}$" });
const HANDLE = t.String({ pattern: "^[a-z][a-z0-9_-]{1,31}$" });
const ENV = t.Record(t.String({ maxLength: 64 }), t.String({ maxLength: 2000 }));

function userError(error: unknown): string | null {
  return error instanceof IntegrationError ||
    error instanceof McpError ||
    error instanceof SecretError ||
    error instanceof ProfileError
    ? error.message
    : null;
}

/** Integrations and agent status (ADR 0020). Everything here is a user action. */
export const integrationsModule = ({ sessions, integrations }: IntegrationsDeps) =>
  new Elysia({ name: "integrations" })
    .use(authGuard(sessions))
    .get("/integrations", () => integrations.overview(), { auth: true })
    .put(
      "/integrations/mcp/:name",
      async ({ params, body, status }) => {
        try {
          return { result: await integrations.saveServer(params.name, body) };
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(400, { error: message });
          throw error;
        }
      },
      {
        auth: true,
        params: t.Object({ name: NAME }),
        body: t.Object({
          command: t.Optional(t.String({ maxLength: 500 })),
          args: t.Optional(t.Array(t.String({ maxLength: 500 }), { maxItems: 50 })),
          url: t.Optional(t.String({ maxLength: 500 })),
          env: t.Optional(ENV),
          agents: t.Array(HANDLE, { maxItems: 50 }),
        }),
      },
    )
    .delete(
      "/integrations/mcp/:name",
      async ({ params, status }) => {
        try {
          await integrations.removeServer(params.name);
          return { ok: true };
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(400, { error: message });
          throw error;
        }
      },
      { auth: true, params: t.Object({ name: NAME }) },
    )
    .post(
      "/integrations/mcp/:name/test",
      async ({ params, status }) => {
        try {
          return await integrations.testServer(params.name);
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(400, { error: message });
          throw error;
        }
      },
      {
        auth: true,
        params: t.Object({ name: NAME }),
      },
    )
    .put(
      "/integrations/secrets/:name",
      ({ params, body, status }) => {
        try {
          integrations.setSecret(params.name, body.value);
          return { names: integrations.secretNames() };
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(400, { error: message });
          throw error;
        }
      },
      {
        auth: true,
        params: t.Object({ name: t.String({ maxLength: 64 }) }),
        body: t.Object({ value: t.Nullable(t.String({ maxLength: 8000 })) }),
      },
    )
    .post(
      "/integrations/check-host",
      async ({ body, status }) => {
        try {
          return await integrations.checkHost(body.url);
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(400, { error: message });
          throw error;
        }
      },
      { auth: true, body: t.Object({ url: t.String({ maxLength: 500 }) }) },
    )
    .get(
      "/agents/:handle/status",
      async ({ params, status }) => {
        try {
          return await integrations.agentStatus(params.handle);
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(404, { error: message });
          throw error;
        }
      },
      { auth: true, params: t.Object({ handle: HANDLE }) },
    )
    .put(
      "/agents/:handle/settings",
      async ({ params, body, status }) => {
        try {
          return await integrations.updateAgent(params.handle, body);
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(400, { error: message });
          throw error;
        }
      },
      {
        auth: true,
        params: t.Object({ handle: HANDLE }),
        body: t.Object({
          tools: t.Optional(t.Array(t.String({ maxLength: 20 }), { maxItems: 20 })),
          env: t.Optional(ENV),
        }),
      },
    );
