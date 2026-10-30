import { Elysia, t } from "elysia";
import type { ExtensionService } from "../../apps/customize/extensions";
import { authGuard } from "../../system/auth";
import type { LocalSessions } from "../../system/auth/sessions";
import type { ChatRepo } from "../chat/repo";
import { FileError, type FileScope, type FileStore } from "./store";

export interface FilesDeps {
  sessions: LocalSessions;
  files: FileStore;
  repo: ChatRepo;
  extensions: ExtensionService;
}

const STATUS = { invalid: 400, "too-large": 413, full: 413, "not-found": 404 } as const;

/**
 * Bytes of a stored file. Never shown as a page: the type is a label, `nosniff` and a sandboxing
 * policy keep a hostile HTML or SVG file inert even if someone opens the URL directly.
 */
function fileResponse(path: string, name: string, type: string, download: boolean): Response {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(Bun.file(path), {
    headers: {
      "content-type": type,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
}

/**
 * Files in chats (attachments) and in apps (ADR 0036). The user's own client uses the chat routes;
 * an app's frame reaches its files only through the host, which calls the app routes, and those
 * check the app's `docs` permission.
 */
export const filesModule = (deps: FilesDeps) => {
  const guard = async <T>(
    run: () => T | Promise<T>,
    set: { status?: number | string },
  ): Promise<T | { error: string }> => {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof FileError)) throw error;
      set.status = STATUS[error.code];
      return { error: error.message };
    }
  };
  const chatScope = async (chatId: string): Promise<FileScope | null> =>
    (await deps.repo.findChat(chatId)) ? { kind: "chat", id: chatId } : null;
  const appScope = async (appId: string): Promise<FileScope | null> =>
    (await deps.extensions.hasPermission(appId, "docs")) ? { kind: "app", id: appId } : null;

  const upload = t.Object({ file: t.File() });
  const download = t.Object({ download: t.Optional(t.String()) });

  return new Elysia({ name: "files" })
    .use(authGuard(deps.sessions))
    .post(
      "/chats/:chatId/files",
      async ({ params, body, set, status }) => {
        const scope = await chatScope(params.chatId);
        if (!scope) return status(404, { error: "Chat not found" });
        return guard(
          async () =>
            deps.files.put(scope, body.file.name, new Uint8Array(await body.file.arrayBuffer())),
          set,
        );
      },
      { auth: true, params: t.Object({ chatId: t.String() }), body: upload },
    )
    .get(
      "/chats/:chatId/files/:fileId",
      async ({ params, query, status }) => {
        const scope = await chatScope(params.chatId);
        const found = scope && deps.files.find(scope, params.fileId);
        if (!found) return status(404, { error: "No such file" });
        return fileResponse(found.path, found.ref.name, found.ref.type, query.download === "1");
      },
      { auth: true, params: t.Object({ chatId: t.String(), fileId: t.String() }), query: download },
    )
    .get(
      "/extensions/:extensionId/docs",
      async ({ params, status }) => {
        const scope = await appScope(params.extensionId);
        if (!scope) return status(403, { error: 'Permission "docs" was not granted' });
        return deps.files.list(scope);
      },
      { auth: true, params: t.Object({ extensionId: t.String() }) },
    )
    .post(
      "/extensions/:extensionId/docs",
      async ({ params, body, set, status }) => {
        const scope = await appScope(params.extensionId);
        if (!scope) return status(403, { error: 'Permission "docs" was not granted' });
        return guard(
          async () =>
            deps.files.put(scope, body.file.name, new Uint8Array(await body.file.arrayBuffer())),
          set,
        );
      },
      { auth: true, params: t.Object({ extensionId: t.String() }), body: upload },
    )
    .get(
      "/extensions/:extensionId/docs/:fileId",
      async ({ params, query, status }) => {
        const scope = await appScope(params.extensionId);
        if (!scope) return status(403, { error: 'Permission "docs" was not granted' });
        const found = deps.files.find(scope, params.fileId);
        if (!found) return status(404, { error: "No such file" });
        return fileResponse(found.path, found.ref.name, found.ref.type, query.download === "1");
      },
      {
        auth: true,
        params: t.Object({ extensionId: t.String(), fileId: t.String() }),
        query: download,
      },
    )
    .delete(
      "/extensions/:extensionId/docs/:fileId",
      async ({ params, status }) => {
        const scope = await appScope(params.extensionId);
        if (!scope) return status(403, { error: 'Permission "docs" was not granted' });
        if (!deps.files.remove(scope, params.fileId)) return status(404, { error: "No such file" });
        return { ok: true };
      },
      { auth: true, params: t.Object({ extensionId: t.String(), fileId: t.String() }) },
    );
};
