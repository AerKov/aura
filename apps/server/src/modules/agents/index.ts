import { Elysia } from "elysia";
import type { LLMProvider } from "../../providers/types";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { AgentRuntime } from "./runtime";

export interface AgentsDeps {
  sessions: LocalSessions;
  provider: LLMProvider & { resetStatus?: () => void };
  runtime: AgentRuntime;
}

export const agentsModule = ({ sessions, provider, runtime }: AgentsDeps) =>
  new Elysia({ name: "agents" })
    .use(authGuard(sessions))
    .get("/provider", async () => ({ id: provider.id, status: await provider.isAvailable() }), {
      auth: true,
      detail: { summary: "Whether the LLM provider (Claude Code) is ready" },
    })
    .post(
      "/provider/check",
      async () => {
        provider.resetStatus?.();
        return { id: provider.id, status: await provider.isAvailable() };
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
