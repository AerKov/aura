import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { PackError } from "./pack";
import type { CatalogService, PackRef } from "./service";

export interface CatalogDeps {
  sessions: LocalSessions;
  catalog: CatalogService;
}

const ref = t.Union([
  t.Object({ id: t.String({ maxLength: 48 }) }),
  t.Object({ url: t.String({ maxLength: 500 }) }),
]);

/** The catalog of packs (ADR 0016): browse, preview with diffs, install what was previewed. */
export const catalogModule = ({ sessions, catalog }: CatalogDeps) =>
  new Elysia({ name: "catalog" })
    .use(authGuard(sessions))
    .get("/catalog", () => catalog.list(), { auth: true })
    .post(
      "/catalog/preview",
      async ({ body, status }) => {
        try {
          return await catalog.preview(body as PackRef);
        } catch (error) {
          if (error instanceof PackError) return status(400, { error: error.message });
          throw error;
        }
      },
      { auth: true, body: ref },
    )
    .post(
      "/catalog/install",
      async ({ body, status }) => {
        const { sha256, ...rest } = body;
        try {
          return { result: await catalog.install(rest as PackRef, sha256) };
        } catch (error) {
          if (error instanceof PackError) return status(400, { error: error.message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Union([
          t.Object({
            id: t.String({ maxLength: 48 }),
            sha256: t.String({ pattern: "^[0-9a-f]{64}$" }),
          }),
          t.Object({
            url: t.String({ maxLength: 500 }),
            sha256: t.String({ pattern: "^[0-9a-f]{64}$" }),
          }),
        ]),
      },
    );
