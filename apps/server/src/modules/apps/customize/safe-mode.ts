import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../../../lib/log";

export const CRASH_LIMIT = 3;
/** A server that has run this long started cleanly (and a clean shutdown counts too). */
export const HEALTHY_AFTER_MS = 10_000;
export const FORCED_REASON = "AURA_SAFE_MODE is set";

export interface SafeMode {
  on: boolean;
  reason: string | null;
}

/**
 * Safe mode (docs/SPEC.md section 11): start without tier 2 and 3 customizations (MCP servers and UI
 * extensions) when asked to (`AURA_SAFE_MODE=1`) or after repeated crashes at startup. Each start bumps
 * a counter that is reset once the server has run for HEALTHY_AFTER_MS or shuts down cleanly. The user
 * can leave safe mode at once with `leaveSafeMode`.
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
    ? { on: true, reason: FORCED_REASON }
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

/**
 * Turns automatic safe mode off for this run (the user asked to). Extensions and MCP servers check
 * the shared flag on each use, so they come back without a restart. The env flag cannot be left.
 */
export function leaveSafeMode(mode: SafeMode): boolean {
  if (!mode.on || mode.reason === FORCED_REASON) return false;
  mode.on = false;
  mode.reason = null;
  log.info("safe mode left by the user");
  return true;
}
