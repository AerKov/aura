import type { ComponentHealth, HealthReport } from "@aura/shared";
import { Elysia } from "elysia";
import { SERVER_VERSION } from "../../../config";

export interface HealthDeps {
  dbHealth: () => Promise<ComponentHealth>;
  startedAt: number;
}

export const healthModule = ({ dbHealth, startedAt }: HealthDeps) =>
  new Elysia({ name: "health" }).get(
    "/health",
    async (): Promise<HealthReport> => {
      const db = await dbHealth();
      return {
        status: db.ok ? "ok" : "degraded",
        server: { version: SERVER_VERSION, uptimeMs: Date.now() - startedAt },
        db,
      };
    },
    { detail: { summary: "Server and database health" } },
  );
