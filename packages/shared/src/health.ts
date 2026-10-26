/** Health of a single dependency the server relies on. */
export type ComponentHealth = { ok: true; version: string } | { ok: false; error: string };

/** Response body of `GET /health`. */
export interface HealthReport {
  status: "ok" | "degraded";
  server: { version: string; uptimeMs: number };
  db: ComponentHealth;
}
