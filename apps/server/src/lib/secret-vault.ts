import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage, log } from "./log";

/** Names like `SERVICE_API_KEY`: what agents' and apps' secrets are called. */
const SECRET_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
const VERSION = 2;

interface VaultData {
  version: typeof VERSION;
  /** API keys of engines, by engine id. */
  engines: Record<string, string>;
  /** Values for `${secret:NAME}` that agents and tool servers use. */
  agents: Record<string, string>;
  /** Each app's own secrets, by app id. */
  apps: Record<string, Record<string, string>>;
}

function empty(): VaultData {
  return { version: VERSION, engines: {}, agents: {}, apps: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(raw: unknown, name?: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw))
    if (typeof v === "string" && v && (!name || name.test(k))) out[k] = v;
  return out;
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    log.warn("a secrets file is unreadable", { file, error: errorMessage(error) });
    return undefined;
  }
}

/**
 * The one secret store (ADR 0039): `<dataDir>/state/secrets.json`, readable only by the user
 * (0600), outside git and outside restore points. Engines' keys, agents' secrets and apps' secrets
 * are kept apart in it, so an app never gets an agent's value or another app's. Values leave the
 * server only into the requests and processes that use them; the API returns names only.
 *
 * Before it there were three files (`secrets.json` with engine keys, `integration-secrets.json`,
 * `app-secrets.json`); they are read once, moved in, and removed.
 *
 * One vault per data directory, shared by every service that holds secrets, so a write by one is
 * never lost to another's stale copy.
 */
export class SecretVault {
  private static readonly open = new Map<string, SecretVault>();

  static for(dataDir: string): SecretVault {
    let vault = SecretVault.open.get(dataDir);
    if (!vault) {
      vault = new SecretVault(dataDir);
      SecretVault.open.set(dataDir, vault);
    }
    return vault;
  }

  private data: VaultData | null = null;

  private constructor(private readonly dataDir: string) {}

  private get dir(): string {
    return join(this.dataDir, "state");
  }

  private get file(): string {
    return join(this.dir, "secrets.json");
  }

  private load(): VaultData {
    if (this.data) return this.data;
    const raw = readJson(this.file);
    const data = empty();
    let migrated = false;
    if (isRecord(raw) && raw.version === VERSION) {
      data.engines = strings(raw.engines);
      data.agents = strings(raw.agents, SECRET_NAME);
      if (isRecord(raw.apps))
        for (const [app, own] of Object.entries(raw.apps))
          data.apps[app] = strings(own, SECRET_NAME);
    } else if (isRecord(raw)) {
      // The old secrets.json: engine keys at the top level.
      data.engines = strings(raw);
      migrated = true;
    }
    const legacyAgents = join(this.dir, "integration-secrets.json");
    const legacyApps = join(this.dir, "app-secrets.json");
    const agents = readJson(legacyAgents);
    if (agents !== undefined) {
      data.agents = { ...strings(agents, SECRET_NAME), ...data.agents };
      migrated = true;
    }
    const apps = readJson(legacyApps);
    if (apps !== undefined) {
      if (isRecord(apps))
        for (const [app, own] of Object.entries(apps))
          data.apps[app] = { ...strings(own, SECRET_NAME), ...(data.apps[app] ?? {}) };
      migrated = true;
    }
    this.data = data;
    if (migrated) {
      this.save(data);
      rmSync(legacyAgents, { force: true });
      rmSync(legacyApps, { force: true });
      log.info("secrets moved into one store", {
        engines: Object.keys(data.engines).length,
        agents: Object.keys(data.agents).length,
        apps: Object.keys(data.apps).length,
      });
    }
    return data;
  }

  private save(next: VaultData): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    chmodSync(this.file, 0o600);
    this.data = next;
  }

  private update(change: (draft: VaultData) => void): void {
    const draft = structuredClone(this.load());
    change(draft);
    this.save(draft);
  }

  engineKey(engine: string): string | null {
    return this.load().engines[engine] ?? null;
  }

  setEngineKey(engine: string, value: string | null): void {
    this.update((d) => {
      if (value) d.engines[engine] = value;
      else delete d.engines[engine];
    });
  }

  agentSecret(name: string): string | null {
    return this.load().agents[name] ?? null;
  }

  agentSecretNames(): string[] {
    return Object.keys(this.load().agents).sort();
  }

  setAgentSecret(name: string, value: string | null): void {
    this.update((d) => {
      if (value === null) delete d.agents[name];
      else d.agents[name] = value;
    });
  }

  appSecret(app: string, name: string): string | null {
    return this.load().apps[app]?.[name] ?? null;
  }

  appSecretNames(app: string): string[] {
    return Object.keys(this.load().apps[app] ?? {}).sort();
  }

  /** Several values of apps at once (one write): `[app, name, value]`, null removes. */
  setAppSecrets(entries: [string, string, string | null][]): void {
    if (entries.length === 0) return;
    this.update((d) => {
      for (const [app, name, value] of entries) {
        const own = { ...(d.apps[app] ?? {}) };
        if (value === null) delete own[name];
        else own[name] = value;
        d.apps[app] = own;
      }
    });
  }

  /** Forgets every secret of an app (it was removed). */
  dropApp(app: string): void {
    if (!(app in this.load().apps)) return;
    this.update((d) => {
      delete d.apps[app];
    });
  }

  /** Values of agents and apps, to redact them from what people and models see. */
  agentValues(): string[] {
    return Object.values(this.load().agents);
  }

  appValues(): string[] {
    return Object.values(this.load().apps).flatMap((own) => Object.values(own));
  }
}
