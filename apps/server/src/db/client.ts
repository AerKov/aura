import type { ComponentHealth } from "@crew/shared";
import { createRemoteEngines, Surreal } from "surrealdb";
import { errorMessage, log } from "../lib/log";
import { ensureNativeAddonPath } from "./native";
import { applySchema } from "./schema";

export const DB_NAMESPACE = "crew";
export const DB_DATABASE = "main";

export class DbConnectError extends Error {
  override name = "DbConnectError";
}

export interface Db {
  surreal: Surreal;
  health(): Promise<ComponentHealth>;
  close(): Promise<void>;
}

/** Opens the embedded (or remote) SurrealDB and selects the app namespace/database. */
export async function connectDb(url: string): Promise<Db> {
  ensureNativeAddonPath();
  // Dynamic import so the native addon path above is set before the addon loads.
  const { createNodeEngines } = await import("@surrealdb/node");
  const surreal = new Surreal({ engines: { ...createRemoteEngines(), ...createNodeEngines() } });

  try {
    await surreal.connect(url);
    await surreal.use({ namespace: DB_NAMESPACE, database: DB_DATABASE });
    await applySchema(surreal);
  } catch (error) {
    await surreal.close().catch(() => {});
    throw new DbConnectError(`Failed to open SurrealDB at ${redact(url)}: ${errorMessage(error)}`, {
      cause: error,
    });
  }

  return {
    surreal,
    async health() {
      try {
        const { version } = await surreal.version();
        await surreal.query("RETURN 1").collect();
        return { ok: true, version };
      } catch (error) {
        log.warn("db health check failed", { error: errorMessage(error) });
        return { ok: false, error: errorMessage(error) };
      }
    },
    async close() {
      await surreal.close();
    },
  };
}

/** Removes credentials from a connection URL before logging it. */
function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/, "//***@");
}
