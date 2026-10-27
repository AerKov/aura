import { Elysia } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { EngineRegistry } from "../engines/registry";
import type { AgentRuntime } from "./runtime";

export interface AgentsDeps {
  sessions: LocalSessions;
  engines: EngineRegistry;
  runtime: AgentRuntime;
}

export const agentsModule = ({ sessions, engines, runtime }: AgentsDeps) =>
  new Elysia({ name: "agents" })
    .use(authGuard(sessions))
    .get(
      "/provider",
      async () => ({ id: engines.store.get().default, status: await engines.defaultStatus() }),
      {
        auth: true,
        detail: { summary: "Whether the default agent engine is ready" },
      },
    )
    .post(
      "/provider/check",
      async () => {
        engines.resetStatus();
        return { id: engines.store.get().default, status: await engines.defaultStatus() };
      },
      { auth: true },
    )
    .post(
      "/runs/:runId/stop",
      ({ params, status }) =>
        runtime.stop(params.runId)
          ? { stopped: true }
          : status(404, { error: "Run is not active" }),
      { auth: true },
    );
