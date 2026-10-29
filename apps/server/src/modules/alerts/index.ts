import { timingSafeEqual } from "node:crypto";
import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { JobError, type JobService } from "../jobs/service";
import type { AlertService } from "./service";

const MAX_BODY = 64 * 1024;

function sameToken(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface OpsDeps {
  sessions: LocalSessions;
  alerts: AlertService;
  jobs: JobService;
  webhookToken: string;
  publicUrl: string;
}

/**
 * Webhook ingest and schedules (Phase 5). Webhooks come from other services (often through a tunnel),
 * so they skip the loopback Host check and authenticate with the install's webhook token instead.
 */
export const opsModule = ({ sessions, alerts, jobs, webhookToken, publicUrl }: OpsDeps) =>
  new Elysia({ name: "ops" })
    .post(
      "/hooks/alerts/:source",
      async ({ params, query, headers, request, status }) => {
        const token = query.token ?? headers["x-aura-token"] ?? "";
        if (!sameToken(token, webhookToken)) return status(401, { error: "Invalid webhook token" });
        const text = await request.text();
        if (text.length > MAX_BODY) return status(413, { error: "Payload too large" });
        let payload: unknown = text;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          // Non-JSON bodies are kept as text.
        }
        return alerts.ingest(params.source, payload);
      },
      {
        query: t.Object({ token: t.Optional(t.String()) }),
        // The raw body is read manually above.
        parse: "none",
      },
    )
    .use(authGuard(sessions))
    .get(
      "/hooks/info",
      () => ({
        url: `${publicUrl}/hooks/alerts/<source>?token=${webhookToken}`,
        example: `curl -X POST '${publicUrl}/hooks/alerts/uptime?token=${webhookToken}' -H 'content-type: application/json' -d '{"title":"API down","message":"502 from /health","severity":"critical"}'`,
      }),
      { auth: true },
    )
    .get("/jobs", () => jobs.list(), { auth: true })
    .patch(
      "/jobs/:jobId",
      async ({ params, body, status }) => {
        try {
          return await jobs.setStatus(params.jobId, body.status);
        } catch (error) {
          if (error instanceof JobError) return status(404, { error: error.message });
          throw error;
        }
      },
      {
        auth: true,
        body: t.Object({ status: t.Union([t.Literal("active"), t.Literal("paused")]) }),
      },
    )
    .delete(
      "/jobs/:jobId",
      async ({ params, status }) => {
        try {
          await jobs.remove(params.jobId);
          return { removed: true };
        } catch (error) {
          if (error instanceof JobError) return status(404, { error: error.message });
          throw error;
        }
      },
      { auth: true },
    );
