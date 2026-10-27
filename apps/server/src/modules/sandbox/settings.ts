import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";

/**
 * How agents' shell commands are isolated (ADR 0015):
 * - `auto`: in an OS sandbox when this machine supports it, otherwise as before, with a warning;
 * - `required`: never run a shell command outside the sandbox;
 * - `off`: no sandbox (app-level checks only).
 */
export type SandboxMode = "auto" | "required" | "off";

export interface SandboxSettings {
  mode: SandboxMode;
  /** Hosts shell commands may reach: package registries and code hosts by default. */
  allowedDomains: string[];
}

export const DEFAULT_ALLOWED_DOMAINS = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "bun.sh",
  "jsr.io",
  "deno.land",
  "pypi.org",
  "files.pythonhosted.org",
  "crates.io",
  "index.crates.io",
  "static.crates.io",
  "proxy.golang.org",
  "sum.golang.org",
  "github.com",
  "*.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "codeload.github.com",
];

export const DEFAULT_SANDBOX: SandboxSettings = {
  mode: "auto",
  allowedDomains: DEFAULT_ALLOWED_DOMAINS,
};

/** A host name, or `*.` plus a host name. No schemes, paths, ports or bare wildcards. */
const DOMAIN = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export class SandboxSettingsError extends Error {
  override name = "SandboxSettingsError";
}

export function validDomains(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new SandboxSettingsError("allowed domains must be a list");
  const domains = raw.map((d) => (typeof d === "string" ? d.trim().toLowerCase() : ""));
  const bad = domains.find((d) => !DOMAIN.test(d));
  if (bad !== undefined)
    throw new SandboxSettingsError(`"${bad}" is not a domain like example.com or *.example.com`);
  if (domains.length > 200) throw new SandboxSettingsError("at most 200 domains");
  return [...new Set(domains)];
}

function isMode(value: unknown): value is SandboxMode {
  return value === "auto" || value === "required" || value === "off";
}

/** Reads untrusted settings; bad fields fall back to defaults. */
export function parseSandbox(raw: unknown): SandboxSettings {
  const settings = structuredClone(DEFAULT_SANDBOX);
  if (!raw || typeof raw !== "object") return settings;
  const record = raw as Record<string, unknown>;
  if (isMode(record.mode)) settings.mode = record.mode;
  if (record.allowedDomains !== undefined) {
    try {
      settings.allowedDomains = validDomains(record.allowedDomains);
    } catch (error) {
      log.warn("sandbox.json: invalid domains; using defaults", { error: errorMessage(error) });
    }
  }
  return settings;
}

/** `<dataDir>/sandbox.json`: config in files, committed (rule 3, 10). */
export class SandboxStore {
  private cached: SandboxSettings | null = null;

  constructor(private readonly dataDir: string) {}

  private get file(): string {
    return join(this.dataDir, "sandbox.json");
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

  async update(patch: { mode?: SandboxMode; allowedDomains?: string[] }): Promise<SandboxSettings> {
    const next = structuredClone(this.get());
    if (patch.mode !== undefined) {
      if (!isMode(patch.mode)) throw new SandboxSettingsError("mode must be auto, required or off");
      next.mode = patch.mode;
    }
    if (patch.allowedDomains !== undefined)
      next.allowedDomains = validDomains(patch.allowedDomains);
    writeFileSync(this.file, `${JSON.stringify(next, null, 2)}\n`);
    this.cached = next;
    await commitAll(
      this.dataDir,
      `chore(sandbox): ${next.mode} mode, ${next.allowedDomains.length} allowed domains`,
    );
    return next;
  }
}
