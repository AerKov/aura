import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage, log } from "../../lib/log";
import { ENV_NAME } from "./env";

export class SecretError extends Error {
  override name = "SecretError";
}

/**
 * Agents' secrets, values for `${secret:NAME}` (ADR 0020, ADR 0030): `<dataDir>/state/
 * integration-secrets.json` (its name from before the Agents page held them), readable only by
 * the user (0600) and outside git. Values never leave the server except into the processes that
 * use them; the API returns names only.
 */
export class SecretStore {
  private cache: Record<string, string> | null = null;

  constructor(private readonly dataDir: string) {}

  private get file(): string {
    return join(this.dataDir, "state", "integration-secrets.json");
  }

  private read(): Record<string, string> {
    if (this.cache) return this.cache;
    const out: Record<string, string> = {};
    if (existsSync(this.file)) {
      try {
        const raw: unknown = JSON.parse(readFileSync(this.file, "utf8"));
        if (raw && typeof raw === "object") {
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (ENV_NAME.test(k) && typeof v === "string") out[k] = v;
          }
        }
      } catch (error) {
        log.warn("agent secrets are unreadable", { error: errorMessage(error) });
      }
    }
    this.cache = out;
    return out;
  }

  names(): string[] {
    return Object.keys(this.read()).sort();
  }

  get(name: string): string | null {
    return this.read()[name] ?? null;
  }

  /** Every stored value, to redact them from what people and models see. */
  values(): string[] {
    return Object.values(this.read());
  }

  set(name: string, value: string | null): void {
    if (!ENV_NAME.test(name)) throw new SecretError(`${name} is not a name like SERVICE_API_KEY`);
    if (value !== null && (value.length === 0 || value.length > 8000))
      throw new SecretError("A secret must be 1 to 8000 characters");
    const next = { ...this.read() };
    if (value === null) delete next[name];
    else next[name] = value;
    mkdirSync(join(this.dataDir, "state"), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    chmodSync(this.file, 0o600);
    this.cache = next;
    log.info("agent secret updated", { name, set: value !== null });
  }
}
