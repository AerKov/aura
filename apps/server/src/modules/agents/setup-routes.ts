import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { McpError } from "../customize/mcp";
import { ProfileError } from "./profiles";
import type { PromptPart } from "./prompt";
import { SecretError } from "./secrets";
import { AgentSetupError, type AgentSetupService } from "./setup";

const NAME = t.String({ pattern: "^[a-z][a-z0-9_-]{1,31}$" });
const HANDLE = t.String({ pattern: "^[a-z][a-z0-9_-]{1,31}$" });
const ENV = t.Record(t.String({ maxLength: 64 }), t.String({ maxLength: 2000 }));

function userError(error: unknown): string | null {
  return error instanceof AgentSetupError ||
    error instanceof McpError ||
    error instanceof SecretError ||
    error instanceof ProfileError
    ? error.message
    : null;
}

/**
 * The Agents page (ADR 0020, ADR 0030): each agent's status and settings, its MCP tool servers and
 * the secrets its variables use. Everything here is a user action.
 */
export const agentSetupModule = ({
  sessions,
  setup,
  explainPrompt,
}: {
  sessions: LocalSessions;
  setup: AgentSetupService;
  /** The agent's system prompt part by part (ADR 0032). */
  explainPrompt: (handle: string) => Promise<PromptPart[] | null>;
}) =>
  new Elysia({ name: "agent-setup" })
    .use(authGuard(sessions))
    .get("/agents/setup", () => setup.overview(), { auth: true })
    .put(
      "/agents/setup/mcp/:name",
      async ({ params, body, status }) => {
        try {
          return { result: await setup.saveServer(params.name, body) };
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
          headers: t.Optional(t.Record(t.String({ maxLength: 64 }), t.String({ maxLength: 2000 }))),
          env: t.Optional(ENV),
          shareEnv: t.Optional(t.Boolean()),
          agents: t.Array(HANDLE, { maxItems: 50 }),
        }),
      },
    )
    .delete(
      "/agents/setup/mcp/:name",
      async ({ params, status }) => {
        try {
          await setup.removeServer(params.name);
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
      "/agents/setup/mcp/:name/test",
      async ({ params, status }) => {
        try {
          return await setup.testServer(params.name);
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
      "/agents/setup/secrets/:name",
      ({ params, body, status }) => {
        try {
          setup.setSecret(params.name, body.value);
          return { names: setup.secretNames() };
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
    .get(
      "/agents/:handle/status",
      async ({ params, status }) => {
        try {
          return await setup.agentStatus(params.handle);
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
          return await setup.updateAgent(params.handle, body);
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
          systemPrompt: t.Optional(t.String({ minLength: 1, maxLength: 50_000 })),
          tools: t.Optional(t.Array(t.String({ maxLength: 20 }), { maxItems: 20 })),
          env: t.Optional(ENV),
          budget: t.Optional(
            t.Object({ usd: t.Nullable(t.Number()), tokens: t.Nullable(t.Integer()) }),
          ),
        }),
      },
    )
    .get(
      "/agents/:handle/prompt",
      async ({ params, status }) => {
        const parts = await explainPrompt(params.handle);
        if (!parts) return status(404, { error: `No agent @${params.handle}` });
        return { parts, history: await setup.promptHistory(params.handle) };
      },
      { auth: true, params: t.Object({ handle: HANDLE }) },
    )
    .post(
      "/agents/:handle/prompt/diff",
      async ({ params, body, status }) => {
        try {
          return { diff: await setup.promptDiff(params.handle, body.text) };
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(404, { error: message });
          throw error;
        }
      },
      {
        auth: true,
        params: t.Object({ handle: HANDLE }),
        body: t.Object({ text: t.String({ maxLength: 50_000 }) }),
      },
    )
    .get(
      "/agents/:handle/prompt/:ref",
      async ({ params, status }) => {
        try {
          return await setup.promptAt(params.handle, params.ref);
        } catch (error) {
          const message = userError(error);
          if (message !== null) return status(404, { error: message });
          throw error;
        }
      },
      { auth: true, params: t.Object({ handle: HANDLE, ref: t.String({ maxLength: 40 }) }) },
    )
    .get("/agents/:handle/runs", ({ params }) => setup.recentRuns(params.handle), {
      auth: true,
      params: t.Object({ handle: HANDLE }),
    });
