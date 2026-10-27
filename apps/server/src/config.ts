import { homedir } from "node:os";
import { join, resolve } from "node:path";
import pkg from "../package.json" with { type: "json" };

export const SERVER_VERSION: string = pkg.version;

export interface ServerConfig {
  host: string;
  port: number;
  /** User data directory (agents, skills, themes...). See docs/SPEC.md section 5. */
  dataDir: string;
  /** SurrealDB connection URL, e.g. `surrealkv:///abs/path` or `mem://`. */
  dbUrl: string;
  /** Origins allowed to call the HTTP API (desktop webview, Vite dev server). */
  corsOrigins: string[];
  /** Model used when an agent profile does not name one. */
  defaultModel: string;
}

export const DEFAULT_MODEL = "claude-opus-5-5";

export const DEFAULT_PORT = 4517;

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "tauri://localhost",
  "http://tauri.localhost",
];

export class ConfigError extends Error {
  override name = "ConfigError";
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`AURA_PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const dataDir = resolve(env.AURA_DATA_DIR ?? join(homedir(), ".aura"));
  const dbUrl = env.AURA_DB_URL ?? `surrealkv://${join(dataDir, "state", "db")}`;
  const extraOrigins = (env.AURA_CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    host: env.AURA_HOST ?? "127.0.0.1",
    port: parsePort(env.AURA_PORT),
    dataDir,
    dbUrl,
    corsOrigins: [...DEFAULT_CORS_ORIGINS, ...extraOrigins],
    defaultModel: env.AURA_DEFAULT_MODEL || DEFAULT_MODEL,
  };
}
