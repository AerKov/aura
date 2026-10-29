import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { RecordId, type Surreal } from "surrealdb";
import { sizeOf, timeStamp } from "../../lib/files";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import type { AppLifecycle } from "../apps/lifecycle";
import type { AppService } from "../apps/service";

export class RestorePointError extends Error {
  override name = "RestorePointError";
}

export interface RestorePoint {
  id: string;
  label: string;
  createdAt: string;
  /** Made by Aura before going to another point, so the user can come forward again. */
  auto: boolean;
  appVersion: string;
  /** The apps it holds, by id. */
  apps: string[];
  /** Size on disk, in bytes. */
  size: number;
}

/** Top-level entries of the data dir that are not configuration. */
const NOT_CONFIG = new Set([".git", "state", "projects", "backups", "restore-points"]);
const ID = /^\d{8}T\d{6}-[a-z0-9]{4}$/;
/** Automatic points kept; the user's own are kept until they delete them. */
const KEEP_AUTO = 10;

function newId(): string {
  return `${timeStamp()}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
}

/**
 * Restore points of the whole Aura (ADR 0033): its configuration (agents, skills, themes,
 * extensions, tool servers, settings files), every app with its code, versions and data, and the
 * settings kept in the database (appearance, layout, language). Chats, runs, memory and secrets are
 * not part of them. Going to a point first makes a point of the present, so the user can come
 * back forward.
 */
export class RestorePointService {
  private busy = false;

  constructor(
    private readonly deps: {
      dataDir: string;
      appVersion: string;
      db: Surreal;
      apps: AppService;
      lifecycle: AppLifecycle;
      /** Re-reads what services keep in memory and tells clients, after a restore. */
      afterRestore: () => Promise<void>;
    },
  ) {}

  private get root(): string {
    return join(this.deps.dataDir, "restore-points");
  }

  private dirOf(id: string): string {
    const dir = join(this.root, id);
    if (!ID.test(id) || !existsSync(join(dir, "meta.json")))
      throw new RestorePointError(`No restore point "${id}"`);
    return dir;
  }

  list(): RestorePoint[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root)
      .filter((id) => ID.test(id) && existsSync(join(this.root, id, "meta.json")))
      .map((id) => this.read(id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private read(id: string): RestorePoint {
    const dir = join(this.root, id);
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Omit<
      RestorePoint,
      "size"
    >;
    return { ...meta, id, size: sizeOf(dir) };
  }

  /** Saves the present as a restore point. */
  async create(label: string, auto = false): Promise<RestorePoint> {
    const name = label.trim().slice(0, 100) || "Restore point";
    const id = newId();
    const dir = join(this.root, id);
    mkdirSync(join(dir, "config"), { recursive: true });
    try {
      // Configuration: the data dir's files, without its history (that stays in git).
      for (const name of readdirSync(this.deps.dataDir)) {
        if (!NOT_CONFIG.has(name))
          cpSync(join(this.deps.dataDir, name), join(dir, "config", name), { recursive: true });
      }
      const apps: string[] = [];
      for (const app of this.deps.apps.sources()) {
        await this.deps.lifecycle.archive(app.id, join(dir, "apps", app.id));
        apps.push(app.id);
      }
      const [settings] = await this.deps.db
        .query<[Record<string, unknown>[]]>("SELECT * FROM setting")
        .collect();
      writeFileSync(join(dir, "settings.json"), JSON.stringify(settings ?? []));
      const meta = {
        label: name,
        createdAt: new Date().toISOString(),
        auto,
        appVersion: this.deps.appVersion,
        apps,
      };
      writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    } catch (error) {
      rmSync(dir, { recursive: true, force: true });
      throw error;
    }
    if (auto) this.pruneAuto();
    log.info("restore point created", { id, label: name, auto });
    return this.read(id);
  }

  private pruneAuto(): void {
    for (const point of this.list()
      .filter((p) => p.auto)
      .slice(KEEP_AUTO)) {
      rmSync(join(this.root, point.id), { recursive: true, force: true });
    }
  }

  /**
   * User action (or an approved request): takes Aura to a restore point. The present is saved
   * first as an automatic point; apps made since are uninstalled with a backup.
   */
  async restore(id: string): Promise<{ restored: RestorePoint; saved: RestorePoint }> {
    const dir = this.dirOf(id);
    if (this.busy) throw new RestorePointError("Another restore is running");
    this.busy = true;
    try {
      const target = this.read(id);
      const saved = await this.create(`Before going to “${target.label}”`, true);

      // Configuration: the point's files replace the present ones, as one commit.
      for (const name of readdirSync(this.deps.dataDir)) {
        if (!NOT_CONFIG.has(name))
          rmSync(join(this.deps.dataDir, name), { recursive: true, force: true });
      }
      cpSync(join(dir, "config"), this.deps.dataDir, { recursive: true });
      await commitAll(this.deps.dataDir, `chore: go to the restore point “${target.label}”`);

      // Apps: the point's come back as they were; those made since leave with a backup.
      const wanted = new Set(target.apps);
      for (const app of [...this.deps.apps.sources()]) {
        if (!wanted.has(app.id)) await this.deps.lifecycle.uninstall(app.id);
      }
      for (const app of target.apps) {
        await this.deps.lifecycle.unarchive(join(dir, "apps", app)).catch((error: unknown) => {
          log.error("app not restored", { app, error: errorMessage(error) });
        });
      }

      const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")) as {
        id: unknown;
      }[];
      await this.deps.db.query("DELETE setting").collect();
      for (const row of settings) {
        const { id: rid, ...content } = row;
        const key = rid instanceof RecordId ? rid.id : String(rid).replace(/^setting:/, "");
        await this.deps.db
          .query("CREATE $id CONTENT $content", {
            id: new RecordId("setting", String(key)),
            content,
          })
          .collect();
      }

      await this.deps.afterRestore();
      log.info("went to a restore point", { id, saved: saved.id });
      return { restored: target, saved };
    } finally {
      this.busy = false;
    }
  }

  /** User action: deletes a restore point for good. */
  delete(id: string): void {
    rmSync(this.dirOf(id), { recursive: true, force: true });
  }
}
