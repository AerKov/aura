import type { CustomizeState } from "@aura/shared";
import { Elysia, t } from "elysia";
import { AppSecretError, type AppSecrets } from "../apps/secrets";
import type { AppSnapshots } from "../apps/snapshots";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { ChatRepo } from "../chat/repo";
import { ChatError } from "../chat/service";
import type { ModuleService } from "../core/modules";
import { ProjectError, type ProjectService } from "../projects/service";
import type { EventHub } from "../realtime/hub";
import { AppearanceError, type AppearanceService } from "./appearance";
import { type ExtensionBridge, ExtensionDenied } from "./bridge";
import { ExtensionError, type ExtensionService, FRAME_CSP } from "./extensions";
import type { McpService } from "./mcp";
import { leaveSafeMode, type SafeMode } from "./safe-mode";

export interface CustomizeRouteDeps {
  sessions: LocalSessions;
  appearance: AppearanceService;
  extensions: ExtensionService;
  mcp: McpService;
  safeMode: SafeMode;
  modules: ModuleService;
  appSecrets: AppSecrets;
  appSnapshots: AppSnapshots;
  hub: EventHub;
  appVersion: string;
  corsOrigins: string[];
  repo: ChatRepo;
  extensionBridge: ExtensionBridge;
  projects: ProjectService;
  owner: { id: string };
}

/** Maps a bridge failure to a status: refused (403) or invalid (400). */
function bridgeError(error: unknown): { code: 400 | 403; error: string } {
  if (error instanceof ExtensionDenied) return { code: 403, error: error.message };
  if (error instanceof ExtensionError) return { code: 400, error: error.message };
  throw error;
}

export const customizeModule = (deps: CustomizeRouteDeps) =>
  new Elysia({ name: "customize" })
    // The extension frame is loaded by an <iframe> (no session header). It only serves enabled
    // extensions, with a strict CSP and only into the app's own origins.
    // `?draft=1` previews an app's changes that wait for approval (ADR 0024).
    .get("/extensions/:extensionId/frame", async ({ params, query, set, status }) => {
      const html = await deps.extensions
        .frame(params.extensionId, query.draft === "1")
        .catch(() => null);
      if (!html) return status(404, "Extension is not enabled");
      set.headers["content-type"] = "text/html; charset=utf-8";
      set.headers["content-security-policy"] =
        `${FRAME_CSP}; frame-ancestors 'self' ${deps.corsOrigins.join(" ")}`;
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
          rail: t.Optional(
            t.Object({
              order: t.Optional(t.Array(t.String({ maxLength: 52 }), { maxItems: 64 })),
              hidden: t.Optional(t.Array(t.String({ maxLength: 52 }), { maxItems: 64 })),
              edge: t.Optional(
                t.Union([
                  t.Literal("left"),
                  t.Literal("right"),
                  t.Literal("top"),
                  t.Literal("bottom"),
                ]),
              ),
              mode: t.Optional(t.Union([t.Literal("builtin"), t.Literal("app"), t.Literal("off")])),
              size: t.Optional(t.Nullable(t.Integer({ minimum: 24, maximum: 96 }))),
            }),
          ),
          wm: t.Optional(
            t.Object({
              gaps: t.Optional(t.Integer({ minimum: 0, maximum: 24 })),
              radius: t.Optional(t.Integer({ minimum: 0, maximum: 24 })),
              border: t.Optional(t.Integer({ minimum: 0, maximum: 4 })),
              titles: t.Optional(
                t.Union([t.Literal("full"), t.Literal("minimal"), t.Literal("none")]),
              ),
              mod: t.Optional(
                t.Union([t.Literal("alt"), t.Literal("ctrl-alt"), t.Literal("meta")]),
              ),
            }),
          ),
        }),
      },
    )
    .get(
      "/customize",
      async (): Promise<CustomizeState> => ({
        safeMode: deps.safeMode,
        appVersion: deps.appVersion,
        modules: deps.modules.all(),
        extensions: await deps.extensions.list(),
        mcpServers: deps.mcp.list(),
      }),
      { auth: true },
    )
    .post(
      "/customize/safe-mode/off",
      ({ status }) => {
        if (!deps.safeMode.on) return { safeMode: deps.safeMode };
        if (!leaveSafeMode(deps.safeMode))
          return status(409, { error: "Safe mode is forced by AURA_SAFE_MODE" });
        deps.hub.publish({ type: "customize.updated" });
        return { safeMode: deps.safeMode };
      },
      { auth: true, detail: { summary: "Leave automatic safe mode for this run" } },
    )
    // Each app's own secrets (ADR 0030): names it declares and whether each has a value.
    .get(
      "/extensions/:extensionId/secrets",
      async ({ params, status }) => {
        const info = await deps.extensions.info(params.extensionId).catch(() => null);
        if (!info) return status(404, { error: "No such app" });
        const set = new Set(deps.appSecrets.names(info.id));
        return info.secrets.map((name) => ({ name, set: set.has(name) }));
      },
      { auth: true },
    )
    .put(
      "/extensions/:extensionId/secrets/:name",
      async ({ params, body, status }) => {
        const info = await deps.extensions.info(params.extensionId).catch(() => null);
        if (!info) return status(404, { error: "No such app" });
        if (!info.secrets.includes(params.name))
          return status(400, { error: `The app does not use a secret named ${params.name}` });
        try {
          deps.appSecrets.set(info.id, params.name, body.value);
        } catch (error) {
          if (error instanceof AppSecretError) return status(400, { error: error.message });
          throw error;
        }
        const set = new Set(deps.appSecrets.names(info.id));
        return info.secrets.map((name) => ({ name, set: set.has(name) }));
      },
      {
        auth: true,
        params: t.Object({ extensionId: t.String(), name: t.String({ maxLength: 64 }) }),
        body: t.Object({ value: t.Nullable(t.String({ maxLength: 8000 })) }),
      },
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
    .delete(
      "/extensions/:extensionId",
      async ({ params, status }) => {
        try {
          await deps.extensions.remove(params.extensionId);
          await deps.extensionBridge.forget(params.extensionId);
          return { ok: true };
        } catch (error) {
          if (error instanceof ExtensionError) return status(404, { error: error.message });
          throw error;
        }
      },
      { auth: true },
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
    )
    .put(
      "/projects/:projectId/budget",
      async ({ params, body, status }) => {
        try {
          const { workspace: _w, ...project } = await deps.projects.setBudget(params.projectId, {
            usd: body.usd,
            tokens: body.tokens,
          });
          return project;
        } catch (error) {
          if (error instanceof ProjectError) return status(400, { error: error.message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Object({ usd: t.Nullable(t.Number()), tokens: t.Nullable(t.Integer()) }),
      },
    )
    .put(
      "/projects/:projectId/app",
      async ({ params, body, status }) => {
        if (body.extensionId) {
          const info = await deps.extensions.info(body.extensionId);
          if (!info.enabled || !info.permissions.includes("ui.panel"))
            return status(400, { error: "Only an enabled extension with a panel can be the app" });
        }
        if (!(await deps.projects.get(params.projectId)))
          return status(404, { error: "Project not found" });
        const { workspace: _w, ...project } = await deps.projects.setApp(
          params.projectId,
          body.extensionId,
        );
        return project;
      },
      {
        auth: true,
        body: t.Object({ extensionId: t.Nullable(t.String({ maxLength: 48 })) }),
      },
    )
    // Extension API v2 (ADR 0021). The frame asks the app over postMessage; the app calls these
    // with the user's session, and each call checks what the user granted the extension.
    .get(
      "/extensions/:extensionId/storage",
      async ({ params, query, status }) => {
        try {
          return query.key === undefined
            ? { keys: await deps.extensionBridge.storageKeys(params.extensionId) }
            : { value: await deps.extensionBridge.storageGet(params.extensionId, query.key) };
        } catch (error) {
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      { auth: true, query: t.Object({ key: t.Optional(t.String({ maxLength: 200 })) }) },
    )
    .put(
      "/extensions/:extensionId/storage",
      async ({ params, body, status }) => {
        try {
          if (body.value === null || body.value === undefined)
            await deps.extensionBridge.storageDelete(params.extensionId, body.key);
          else await deps.extensionBridge.storageSet(params.extensionId, body.key, body.value);
          return { ok: true };
        } catch (error) {
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      {
        auth: true,
        body: t.Object({ key: t.String({ minLength: 1, maxLength: 200 }), value: t.Unknown() }),
      },
    )
    .post(
      "/extensions/:extensionId/fetch",
      async ({ params, body, status }) => {
        try {
          return await deps.extensionBridge.fetch(params.extensionId, body);
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError")
            return status(400, { error: "The host did not answer in 20 seconds" });
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      {
        auth: true,
        body: t.Object({
          url: t.String({ minLength: 1, maxLength: 4000 }),
          method: t.Optional(t.String({ maxLength: 10 })),
          headers: t.Optional(t.Record(t.String({ maxLength: 64 }), t.String({ maxLength: 8000 }))),
          body: t.Optional(t.String({ maxLength: 1_000_000 })),
        }),
      },
    )
    .post(
      "/extensions/:extensionId/ask",
      async ({ params, body, status }) => {
        try {
          return await deps.extensionBridge.ask(params.extensionId, body, deps.owner);
        } catch (error) {
          if (error instanceof ChatError) return status(400, { error: error.message });
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      {
        auth: true,
        body: t.Object({
          chatId: t.String({ maxLength: 64 }),
          agent: t.String({ maxLength: 40 }),
          text: t.String({ minLength: 1, maxLength: 8000 }),
        }),
      },
    )
    // A client's snapshot of an app an agent asked to see (WISH-2).
    .post(
      "/extensions/:extensionId/snapshots/:requestId",
      ({ params, body, status }) =>
        deps.appSnapshots.answer(params.extensionId, params.requestId, body)
          ? { ok: true }
          : status(404, { error: "Nobody is waiting for this snapshot" }),
      {
        auth: true,
        body: t.Object({
          draft: t.Boolean(),
          width: t.Number(),
          height: t.Number(),
          outline: t.String({ maxLength: 50_000 }),
          errors: t.Array(t.String({ maxLength: 2000 }), { maxItems: 50 }),
        }),
      },
    )
    // An app's alert card in the Signals chat (WISH-7).
    .post(
      "/extensions/:extensionId/alerts",
      async ({ params, body, status }) => {
        try {
          return await deps.extensionBridge.postAlert(params.extensionId, body);
        } catch (error) {
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      {
        auth: true,
        body: t.Object({
          severity: t.Optional(t.UnionEnum(["info", "warning", "critical"])),
          title: t.String({ minLength: 1, maxLength: 200 }),
          summary: t.Optional(t.String({ maxLength: 2000 })),
          fingerprint: t.Optional(t.String({ maxLength: 200 })),
        }),
      },
    )
    .get(
      "/extensions/:extensionId/files",
      async ({ params, query, status }) => {
        try {
          return query.read
            ? {
                content: await deps.extensionBridge.readFile(
                  params.extensionId,
                  query.project,
                  query.path ?? "",
                ),
              }
            : {
                entries: await deps.extensionBridge.listFiles(
                  params.extensionId,
                  query.project,
                  query.path ?? "",
                ),
              };
        } catch (error) {
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      {
        auth: true,
        query: t.Object({
          project: t.String({ maxLength: 48 }),
          path: t.Optional(t.String({ maxLength: 1000 })),
          read: t.Optional(t.BooleanString()),
        }),
      },
    )
    // An app's collections, its own actions, and other apps' actions (ADR 0024, phases 24-25).
    .post(
      "/extensions/:extensionId/data",
      async ({ params, body, status }) => {
        try {
          return { result: await deps.extensionBridge.data(params.extensionId, body) };
        } catch (error) {
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      {
        auth: true,
        body: t.Object({
          op: t.Union([
            t.Literal("list"),
            t.Literal("count"),
            t.Literal("get"),
            t.Literal("insert"),
            t.Literal("update"),
            t.Literal("delete"),
            t.Literal("schema"),
          ]),
          collection: t.String({ maxLength: 32 }),
          id: t.Optional(t.String({ maxLength: 64 })),
          record: t.Optional(t.Unknown()),
          patch: t.Optional(t.Unknown()),
          query: t.Optional(
            t.Object({
              where: t.Optional(t.Record(t.String(), t.Unknown())),
              search: t.Optional(t.String({ maxLength: 200 })),
              sort: t.Optional(t.String({ maxLength: 40 })),
              limit: t.Optional(t.Number()),
            }),
          ),
        }),
      },
    )
    .post(
      "/extensions/:extensionId/actions/:action",
      async ({ params, body, status }) => {
        try {
          return {
            result: await deps.extensionBridge.runAction(
              params.extensionId,
              params.action,
              body.input,
            ),
          };
        } catch (error) {
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      { auth: true, body: t.Object({ input: t.Optional(t.Unknown()) }) },
    )
    .post(
      "/extensions/:extensionId/call",
      async ({ params, body, status }) => {
        try {
          return {
            result: await deps.extensionBridge.callApp(
              params.extensionId,
              body.app,
              body.action,
              body.input,
            ),
          };
        } catch (error) {
          const e = bridgeError(error);
          return status(e.code, { error: e.error });
        }
      },
      {
        auth: true,
        body: t.Object({
          app: t.String({ maxLength: 48 }),
          action: t.String({ maxLength: 32 }),
          input: t.Optional(t.Unknown()),
        }),
      },
    );
