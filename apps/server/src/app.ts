import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { type HealthDeps, healthModule } from "./modules/health";
import { realtimeModule } from "./modules/realtime";

export interface AppDeps extends HealthDeps {
  corsOrigins: string[];
}

export function createApp(deps: AppDeps) {
  return new Elysia()
    .use(cors({ origin: deps.corsOrigins }))
    .use(healthModule(deps))
    .use(realtimeModule());
}

/** API type consumed by the desktop client through Eden Treaty. */
export type App = ReturnType<typeof createApp>;
