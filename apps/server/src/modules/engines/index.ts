import { ENGINE_IDS, MODEL_ID_PATTERN } from "@aura/shared";
import { Elysia, t } from "elysia";
import { commitAll } from "../../lib/git";
import { errorMessage } from "../../lib/log";
import type { AgentDirectory } from "../agents/directory";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { EngineRegistry } from "./registry";
import { EngineSettingsError, KEYED_ENGINES } from "./settings";

export interface EnginesDeps {
  sessions: LocalSessions;
  engines: EngineRegistry;
  agents: AgentDirectory;
  dataDir: string;
}

const engineId = t.UnionEnum(ENGINE_IDS);
const modelId = t.String({ pattern: MODEL_ID_PATTERN.source });

/** Agent engines (ADR 0011): status, settings, API keys, models, and the engine of each agent. */
export const enginesModule = ({ sessions, engines, agents, dataDir }: EnginesDeps) =>
  new Elysia({ name: "engines" })
    .use(authGuard(sessions))
    .get("/engines", () => engines.list(), { auth: true })
    .get(
      "/engines/:engine/models",
      async ({ params, status }) => {
        try {
          return await engines.models(params.engine);
        } catch (error) {
          return status(502, { error: errorMessage(error) });
        }
      },
      { auth: true, params: t.Object({ engine: engineId }) },
    )
    .put(
      "/engines/settings",
      async ({ body, status }) => {
        try {
          await engines.store.update(body);
          return engines.list();
        } catch (error) {
          if (error instanceof EngineSettingsError) return status(400, { error: error.message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Object({
          default: t.Optional(engineId),
          models: t.Optional(t.Record(t.String(), t.Nullable(t.String({ maxLength: 120 })))),
          ollamaBaseUrl: t.Optional(t.String({ maxLength: 300 })),
          customBaseUrl: t.Optional(t.String({ maxLength: 300 })),
          customLabel: t.Optional(t.String({ maxLength: 40 })),
        }),
      },
    )
    .put(
      "/engines/:engine/key",
      ({ params, body }) => {
        // The key is stored on the server and never sent back (ADR 0011).
        engines.store.setKey(params.engine, body.key);
        return { hasKey: body.key !== null };
      },
      {
        auth: true,
        params: t.Object({ engine: t.UnionEnum(KEYED_ENGINES) }),
        body: t.Object({ key: t.Nullable(t.String({ minLength: 8, maxLength: 300 })) }),
      },
    )
    .put(
      "/agents/:handle/engine",
      async ({ params, body, status }) => {
        const profile = await agents.get(params.handle);
        if (!profile) return status(404, { error: `@${params.handle} does not exist` });
        await agents.update({ ...profile, engine: body.engine, model: body.model });
        const what = body.engine
          ? `${body.engine}${body.model ? ` / ${body.model}` : ""}`
          : "default engine";
        await commitAll(dataDir, `chore(agents): run @${profile.handle} on ${what}`);
        return { handle: profile.handle, engine: body.engine, model: body.model };
      },
      {
        auth: true,
        body: t.Object({ engine: t.Nullable(engineId), model: t.Nullable(modelId) }),
      },
    );
