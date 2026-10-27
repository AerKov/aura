import type { CustomizeState } from "@aura/shared";
import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { ChatRepo } from "../chat/repo";
import { AppearanceError, type AppearanceService } from "./appearance";
import { ExtensionError, type ExtensionService, FRAME_CSP } from "./extensions";
import type { McpService } from "./mcp";
import type { SafeMode } from "./safe-mode";

export interface CustomizeRouteDeps {
  sessions: LocalSessions;
  appearance: AppearanceService;
  extensions: ExtensionService;
  mcp: McpService;
  safeMode: SafeMode;
  appVersion: string;
  corsOrigins: string[];
  repo: ChatRepo;
}

export const customizeModule = (deps: CustomizeRouteDeps) =>
  new Elysia({ name: "customize" })
    // The extension frame is loaded by an <iframe> (no session header). It only serves enabled
    // extensions, with a strict CSP and only into the app's own origins.
    .get("/extensions/:extensionId/frame", async ({ params, set, status }) => {
      const html = await deps.extensions.frame(params.extensionId).catch(() => null);
      if (!html) return status(404, "Extension is not enabled");
      set.headers["content-type"] = "text/html; charset=utf-8";
      set.headers["content-security-policy"] =
        `${FRAME_CSP}; frame-ancestors ${deps.corsOrigins.join(" ")}`;
      set.headers["x-content-type-options"] = "nosniff";
      return html;
    })
    .use(authGuard(deps.sessions))
    .get("/appearance", () => deps.appearance.get(), { auth: true })
    .put(
      "/appearance",
      async ({ body, status }) => {
        try {
          return await deps.appearance.set(body);
        } catch (error) {
          if (error instanceof AppearanceError) return status(400, { error: error.message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Object({
          theme: t.Optional(t.Nullable(t.String({ maxLength: 48 }))),
          snippets: t.Optional(t.Array(t.String({ maxLength: 48 }))),
        }),
      },
    )
    .get(
      "/customize",
      async (): Promise<CustomizeState> => ({
        safeMode: deps.safeMode,
        appVersion: deps.appVersion,
        extensions: await deps.extensions.list(),
        mcpServers: deps.mcp.list(),
      }),
      { auth: true },
    )
    .post(
      "/extensions/:extensionId/enabled",
      async ({ params, body, status }) => {
        try {
          return await deps.extensions.setEnabled(params.extensionId, body.enabled);
        } catch (error) {
          if (error instanceof ExtensionError) return status(400, { error: error.message });
          throw error;
        }
      },
      { auth: true, body: t.Object({ enabled: t.Boolean() }) },
    )
    .post(
      "/extensions/:extensionId/error",
      ({ params }) => deps.extensions.reportError(params.extensionId),
      { auth: true },
    )
    .post(
      "/extensions/:extensionId/messages",
      async ({ params, body, status }) => {
        if (!(await deps.extensions.hasPermission(params.extensionId, "chat.write"))) {
          return status(403, { error: "The extension may not post messages" });
        }
        if (!(await deps.repo.findChat(body.chatId)))
          return status(404, { error: "Chat not found" });
        // Extension posts are shown but do not wake agents (an extension cannot spend budget).
        return deps.repo.createMessage({
          chatId: body.chatId,
          author: { kind: "bot", id: `extension:${params.extensionId}` },
          body: body.body,
        });
      },
      {
        auth: true,
        body: t.Object({
          chatId: t.String({ maxLength: 64 }),
          body: t.String({ minLength: 1, maxLength: 8000 }),
        }),
      },
    );
