import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../../lib/log";

export const CRASH_LIMIT = 3;
export const HEALTHY_AFTER_MS = 60_000;

export interface SafeMode {
  on: boolean;
  reason: string | null;
}

/**
 * Safe mode (docs/SPEC.md section 11): start without tier 2 and 3 customizations (MCP servers and UI
 * extensions) when asked to (`AURA_SAFE_MODE=1`) or after repeated crashes. Each start bumps a counter
 * that is reset once the server has run for a minute.
 */
export function detectSafeMode(
  dataDir: string,
  env: Record<string, string | undefined> = process.env,
): {
  mode: SafeMode;
  markHealthy: () => void;
} {
  const file = join(dataDir, "state", "boot.json");
  let attempts = 0;
  try {
    attempts = existsSync(file) ? Number(JSON.parse(readFileSync(file, "utf8")).attempts) || 0 : 0;
  } catch {
    attempts = 0;
  }
  attempts += 1;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ attempts }));

  const forced = env.AURA_SAFE_MODE === "1" || env.AURA_SAFE_MODE === "true";
  const crashed = attempts > CRASH_LIMIT;
  const mode: SafeMode = forced
    ? { on: true, reason: "AURA_SAFE_MODE is set" }
    : crashed
      ? { on: true, reason: `the app did not start cleanly ${attempts - 1} times in a row` }
      : { on: false, reason: null };
  if (mode.on)
    log.warn("safe mode: MCP servers and UI extensions are off", { reason: mode.reason });

  return {
    mode,
    markHealthy: () => writeFileSync(file, JSON.stringify({ attempts: 0 })),
  };
}
