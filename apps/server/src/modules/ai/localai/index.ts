import { LOCAL_MODELS, parseRepoSpec } from "@aura/shared";
import { Elysia, t } from "elysia";
import { authGuard } from "../../system/auth";
import type { LocalSessions } from "../../system/auth/sessions";
import type { EngineRegistry } from "../engines/registry";
import { ModelError } from "./huggingface";
import { ReleaseError } from "./release";
import { LocalAiError } from "./service";

export interface LocalAiDeps {
  sessions: LocalSessions;
  engines: EngineRegistry;
}

/** A model the user named: a catalog id, or a Hugging Face repository like `owner/name:Q4_K_M`. */
function specOf(name: string): { repo: string; quant: string } | null {
  const known = LOCAL_MODELS.find((m) => m.id === name);
  return known ? { repo: known.repo, quant: known.quant } : parseRepoSpec(name);
}

/**
 * The built-in llama.cpp (ADR 0038). A plan downloads nothing; an install runs only for a plan the
 * user approved, which the server remembers, so the addresses always come from the server.
 */
export const localAiModule = ({ sessions, engines }: LocalAiDeps) =>
  new Elysia({ name: "local-ai" })
    .use(authGuard(sessions))
    .get("/local-ai", () => engines.localAi.status(), { auth: true })
    .post(
      "/local-ai/plan",
      async ({ body, status }) => {
        const spec = body.model ? specOf(body.model) : null;
        if (body.model && !spec)
          return status(400, {
            error: "Choose a model from the list, or a Hugging Face repository like owner/name",
          });
        try {
          return await engines.localAi.plan(spec, body.asset ?? null, body.tag ?? null);
        } catch (error) {
          if (
            error instanceof LocalAiError ||
            error instanceof ReleaseError ||
            error instanceof ModelError
          )
            return status(400, { error: error.message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Object({
          model: t.Nullable(t.String({ maxLength: 160 })),
          /** A build chosen by the user from GET /local-ai/builds. */
          asset: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
          /** A release chosen from GET /local-ai/releases; the latest by default. */
          tag: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
        }),
      },
    )
    .get(
      "/local-ai/releases",
      async ({ status }) => {
        try {
          return await engines.localAi.releases();
        } catch (error) {
          if (error instanceof ReleaseError) return status(400, { error: error.message });
          throw error;
        }
      },
      { auth: true },
    )
    .get(
      "/local-ai/builds",
      async ({ query, status }) => {
        try {
          return await engines.localAi.builds(query.tag ?? null);
        } catch (error) {
          if (error instanceof ReleaseError) return status(400, { error: error.message });
          throw error;
        }
      },
      { auth: true, query: t.Object({ tag: t.Optional(t.String({ maxLength: 64 })) }) },
    )
    .post(
      "/local-ai/install",
      ({ body, status }) => {
        try {
          engines.localAi.install(body.planId);
          return engines.localAi.status();
        } catch (error) {
          if (error instanceof LocalAiError) return status(400, { error: error.message });
          throw error;
        }
      },
      { auth: true, body: t.Object({ planId: t.String({ maxLength: 64 }) }) },
    )
    .post(
      "/local-ai/cancel",
      () => {
        engines.localAi.cancel();
        return engines.localAi.status();
      },
      { auth: true },
    )
    .post(
      "/local-ai/use",
      async ({ body, status }) => {
        if (!engines.localAi.modelPath(body.file))
          return status(404, { error: "That model is not downloaded" });
        await engines.useLocalModel(body.file);
        // Start it now, so the user sees it load (or why it does not) instead of on the first reply.
        engines.localAi.startInBackground(body.file);
        return engines.localAi.status();
      },
      { auth: true, body: t.Object({ file: t.String({ maxLength: 200 }) }) },
    )
    .post(
      "/local-ai/stop",
      () => {
        engines.localAi.stop();
        return engines.localAi.status();
      },
      { auth: true },
    )
    .delete(
      "/local-ai/models/:file",
      ({ params }) => {
        engines.localAi.removeModel(params.file);
        return engines.localAi.status();
      },
      { auth: true, params: t.Object({ file: t.String({ maxLength: 200 }) }) },
    )
    .delete(
      "/local-ai",
      () => {
        engines.localAi.uninstall();
        return engines.localAi.status();
      },
      { auth: true },
    );
