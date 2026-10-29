import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";

/**
 * How agents' shell commands are isolated (ADR 0015). The sandbox has no network (ADR 0030):
 * - `auto`: in an OS sandbox when this machine supports it, otherwise as before, with a warning;
 * - `required`: never run a shell command outside the sandbox;
 * - `off`: no sandbox (app-level checks only).
 */
export type SandboxMode = "auto" | "required" | "off";

export interface SandboxSettings {
  mode: SandboxMode;
}

export const DEFAULT_SANDBOX: SandboxSettings = { mode: "auto" };

export class SandboxSettingsError extends Error {
  override name = "SandboxSettingsError";
}

function isMode(value: unknown): value is SandboxMode {
  return value === "auto" || value === "required" || value === "off";
}

/** Reads untrusted settings; bad fields fall back to defaults, old fields are ignored. */
export function parseSandbox(raw: unknown): SandboxSettings {
  const settings = structuredClone(DEFAULT_SANDBOX);
  if (!raw || typeof raw !== "object") return settings;
  const record = raw as Record<string, unknown>;
  if (isMode(record.mode)) settings.mode = record.mode;
  return settings;
}

export interface SandboxPatch {
  mode?: SandboxMode;
}

/** `<dataDir>/sandbox.json`: config in files, committed (rule 3, 10). */
export class SandboxStore {
  private cached: SandboxSettings | null = null;

  constructor(private readonly dataDir: string) {}

  private get file(): string {
    return join(this.dataDir, "sandbox.json");
  }

  /** Drops the cached settings, so the file is read again (a restore point put it back). */
  reload(): void {
    this.cached = null;
  }

  get(): SandboxSettings {
    if (this.cached) return this.cached;
    let raw: unknown = null;
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, "utf8"));
      } catch (error) {
        log.warn("sandbox.json is not valid JSON; using defaults", { error: errorMessage(error) });
      }
    }
    this.cached = parseSandbox(raw);
    return this.cached;
  }

  async update(patch: SandboxPatch): Promise<SandboxSettings> {
    const next = structuredClone(this.get());
    if (patch.mode !== undefined) {
      if (!isMode(patch.mode)) throw new SandboxSettingsError("mode must be auto, required or off");
      next.mode = patch.mode;
    }
    writeFileSync(this.file, `${JSON.stringify(next, null, 2)}\n`);
    this.cached = next;
    await commitAll(this.dataDir, `chore(sandbox): ${next.mode} mode`);
    return next;
  }
}
