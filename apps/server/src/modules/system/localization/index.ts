import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { LocalizationError, type LocalizationService } from "./service";

/** The Localization app (ADR 0033): part of the core, always on. */
export const localizationModule = ({
  sessions,
  localization,
}: {
  sessions: LocalSessions;
  localization: LocalizationService;
}) =>
  new Elysia({ name: "localization" })
    .use(authGuard(sessions))
    .get("/localization", () => localization.get(), { auth: true })
    .put(
      "/localization",
      async ({ body, status }) => {
        try {
          return await localization.set(body.choice);
        } catch (error) {
          if (error instanceof LocalizationError) return status(400, { error: error.message });
          throw error;
        }
      },
      { auth: true, body: t.Object({ choice: t.String({ maxLength: 10 }) }) },
    )
    .get("/localization/strings/:code", ({ params }) => localization.strings(params.code), {
      auth: true,
      params: t.Object({ code: t.String({ maxLength: 10 }) }),
    });
