import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage, log } from "../../lib/log";
import { ENV_NAME } from "../agents/env";

export class AppSecretError extends Error {
  override name = "AppSecretError";
}

type Store = Record<string, Record<string, string>>;

/**
 * Each app's own secrets (ADR 0030): `<dataDir>/state/app-secrets.json`, readable only by the user
 * (0600) and outside git. An app's values are put into its own requests to its granted hosts and
 * nowhere else: no other app, no agent and no frame ever gets them; the API returns names only.
 */
export class AppSecrets {
  private cache: Store | null = null;

  constructor(private readonly dataDir: string) {}

  private get file(): string {
    return join(this.dataDir, "state", "app-secrets.json");
  }

  private read(): Store {
    if (this.cache) return this.cache;
    const out: Store = {};
    if (existsSync(this.file)) {
      try {
        const raw: unknown = JSON.parse(readFileSync(this.file, "utf8"));
        if (raw && typeof raw === "object") {
          for (const [app, values] of Object.entries(raw as Record<string, unknown>)) {
            if (!values || typeof values !== "object") continue;
            const own: Record<string, string> = {};
            for (const [k, v] of Object.entries(values as Record<string, unknown>))
              if (ENV_NAME.test(k) && typeof v === "string") own[k] = v;
            out[app] = own;
          }
        }
      } catch (error) {
        log.warn("app secrets are unreadable", { error: errorMessage(error) });
      }
    }
    this.cache = out;
    return out;
  }

  private write(next: Store): void {
    mkdirSync(join(this.dataDir, "state"), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    chmodSync(this.file, 0o600);
    this.cache = next;
  }

  get(app: string, name: string): string | null {
    return this.read()[app]?.[name] ?? null;
  }

  /** Names with a value, for one app. */
  names(app: string): string[] {
    return Object.keys(this.read()[app] ?? {}).sort();
  }

  /** Every stored value, to redact them from what people and models see. */
  values(): string[] {
    return Object.values(this.read()).flatMap((own) => Object.values(own));
  }

  set(app: string, name: string, value: string | null): void {
    if (!ENV_NAME.test(name))
      throw new AppSecretError(`${name} is not a name like SERVICE_API_KEY`);
    if (value !== null && (value.length === 0 || value.length > 8000))
      throw new AppSecretError("A secret must be 1 to 8000 characters");
    const store = this.read();
    const own = { ...(store[app] ?? {}) };
    if (value === null) delete own[name];
    else own[name] = value;
    this.write({ ...store, [app]: own });
    log.info("app secret updated", { app, name, set: value !== null });
  }

  /** Forgets every secret of an app (it was removed). */
  drop(app: string): void {
    const store = { ...this.read() };
    if (!(app in store)) return;
    delete store[app];
    this.write(store);
  }

  /**
   * Before ADR 0030 apps used the shared secrets they were granted. Copies each granted value into
   * the app's own store once, so nothing stops working; afterwards the stores are separate.
   */
  migrate(
    grants: { app: string; secrets: string[] }[],
    shared: { get(name: string): string | null },
  ): number {
    const store = this.read();
    let copied = 0;
    const next: Store = { ...store };
    for (const { app, secrets } of grants) {
      for (const name of secrets) {
        if (next[app]?.[name] !== undefined) continue;
        const value = shared.get(name);
        if (value === null) continue;
        next[app] = { ...(next[app] ?? {}), [name]: value };
        copied++;
      }
    }
    if (copied > 0) {
      this.write(next);
      log.info("copied granted secrets into apps' own stores", { copied });
    }
    return copied;
  }
}
