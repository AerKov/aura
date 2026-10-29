import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { APP_ID_PATTERN } from "@aura/shared";
import { errorMessage, log } from "../../lib/log";
import type { ChatRepo } from "../chat/repo";
import type { ExtensionService, GrantedState } from "../customize/extensions";
import type { ProjectService } from "../projects/service";
import type { EventHub } from "../realtime/hub";
import type { AppDataService, DataRecord, StoreKind } from "./data";
import type { AppSecrets } from "./secrets";
import { type AppService, BUILDER_HANDLE } from "./service";

export class LifecycleError extends Error {
  override name = "LifecycleError";
}

/** What an app archive holds besides its code and data (ADR 0033). */
export interface ArchiveMeta {
  id: string;
  name: string;
  dataStore: StoreKind;
  extension: GrantedState;
  /** When it was archived. */
  at: string;
  appVersion: string;
}

/** A backup made when an app was uninstalled. */
export interface AppBackup {
  /** The backup's folder name under `backups/apps`. */
  name: string;
  id: string;
  appName: string;
  removedAt: string;
  /** Size on disk, in bytes. */
  size: number;
  /** Whether an app with its id exists now, so it cannot come back until that one goes. */
  taken: boolean;
}

const BACKUP_NAME = /^[a-z][a-z0-9-]{1,47}-\d{8}T\d{6}$/;
/** Messages of the app's chat kept in a backup, as a readable record. */
const CHAT_EXPORT_LIMIT = 5000;

/** Copies an app's folder without its files store (that is in data.json) or installed packages. */
function copyCode(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(from.length).replace(/^[/\\]/, "");
      const top = rel.split(/[/\\]/)[0];
      return top !== "data" && top !== "node_modules";
    },
  });
}

function sizeOf(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0);
}

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").slice(0, 15);
}

/**
 * Apps come and go as a whole (ADR 0033): uninstalling keeps a backup of the app (its code with
 * its versions, its data, what it was granted, its chat as text) in `backups/apps`, then removes
 * the app, its chat and its data. A backup brings the app back with a new chat. The same archive
 * format serves restore points.
 */
export class AppLifecycle {
  constructor(
    private readonly deps: {
      dataDir: string;
      appVersion: string;
      apps: AppService;
      projects: ProjectService;
      extensions: ExtensionService;
      data: AppDataService;
      repo: ChatRepo;
      secrets: AppSecrets;
      hub: EventHub;
    },
  ) {}

  private get backupRoot(): string {
    return join(this.deps.dataDir, "backups", "apps");
  }

  /** Writes an app's archive into `dir`: meta.json, code/ and data.json. Secrets are left out. */
  async archive(id: string, dir: string): Promise<ArchiveMeta> {
    const source = this.deps.apps.sources().find((a) => a.id === id);
    const project = await this.deps.projects.get(id);
    if (!source || !project) throw new LifecycleError(`No app "${id}"`);
    mkdirSync(dir, { recursive: true });
    const meta: ArchiveMeta = {
      id,
      name: project.name,
      dataStore: project.dataStore,
      extension: await this.deps.extensions.exportState(id),
      at: new Date().toISOString(),
      appVersion: this.deps.appVersion,
    };
    copyCode(source.dir, join(dir, "code"));
    writeFileSync(join(dir, "data.json"), JSON.stringify(await this.deps.data.dump(id)));
    writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    return meta;
  }

  /**
   * Puts an archived app back: creates it (with a new chat) when it is not there, then replaces its
   * code, data and grants with the archive's.
   */
  async unarchive(dir: string): Promise<ArchiveMeta> {
    const meta = readMeta(dir);
    const present = await this.deps.projects.get(meta.id);
    // Data kept in the other kind of store would linger there unseen.
    if (present && this.deps.apps.isApp(meta.id) && present.dataStore !== meta.dataStore)
      await this.deps.data.clear(meta.id);
    if (!this.deps.apps.isApp(meta.id)) {
      await this.deps.apps.create({
        name: meta.name,
        id: meta.id,
        brief: `@${BUILDER_HANDLE} The app "${meta.name}" came back from its backup of ${meta.at.slice(0, 10)}. Wait for the user to say what to change.`,
      });
    }
    const workspace = this.deps.projects.workspaceOf(meta.id);
    for (const name of readdirSync(workspace)) {
      if (name !== "data") rmSync(join(workspace, name), { recursive: true, force: true });
    }
    cpSync(join(dir, "code"), workspace, { recursive: true });
    await this.deps.projects.setDataStore(meta.id, meta.dataStore);
    const data = JSON.parse(readFileSync(join(dir, "data.json"), "utf8")) as Record<
      string,
      DataRecord[]
    >;
    await this.deps.data.replace(meta.id, data);
    await this.deps.extensions.importState(meta.id, meta.extension);
    await this.deps.apps.load();
    this.deps.hub.publish({ type: "customize.updated" });
    return meta;
  }

  /** User action: backs the app up, then removes it, its chat, its data and its secrets. */
  async uninstall(id: string): Promise<AppBackup> {
    const source = this.deps.apps.sources().find((a) => a.id === id);
    if (!source) throw new LifecycleError(`No app "${id}"`);
    const name = `${id}-${stamp()}`;
    const dir = join(this.backupRoot, name);
    const meta = await this.archive(id, dir);
    writeFileSync(join(dir, "chat.md"), await this.chatText(source.chatId, meta.name));

    await this.remove(id, source.chatId);
    log.info("app uninstalled", { app: id, backup: name });
    return this.backupInfo(name);
  }

  /** Removes an app without a backup; callers keep one (uninstall, restore points). */
  async remove(id: string, chatId: string): Promise<void> {
    await this.deps.data.forget(id).catch((e: unknown) => {
      log.warn("app data not cleared", { app: id, error: errorMessage(e) });
    });
    await this.deps.extensions.forgetState(id);
    this.deps.secrets.drop(id);
    await this.deps.repo.removeChat(chatId);
    await this.deps.projects.remove(id);
    await this.deps.apps.load();
    this.deps.hub.publish({ type: "chat.removed", chatId });
    this.deps.hub.publish({ type: "customize.updated" });
  }

  backups(): AppBackup[] {
    if (!existsSync(this.backupRoot)) return [];
    return readdirSync(this.backupRoot)
      .filter(
        (name) => BACKUP_NAME.test(name) && existsSync(join(this.backupRoot, name, "meta.json")),
      )
      .map((name) => this.backupInfo(name))
      .sort((a, b) => b.removedAt.localeCompare(a.removedAt));
  }

  private backupInfo(name: string): AppBackup {
    const dir = join(this.backupRoot, name);
    const meta = readMeta(dir);
    return {
      name,
      id: meta.id,
      appName: meta.name,
      removedAt: meta.at,
      size: sizeOf(dir),
      taken: this.deps.apps.isApp(meta.id),
    };
  }

  private backupDir(name: string): string {
    const dir = join(this.backupRoot, name);
    if (!BACKUP_NAME.test(name) || !existsSync(join(dir, "meta.json")))
      throw new LifecycleError(`No backup "${name}"`);
    return dir;
  }

  /** User action: brings an uninstalled app back from its backup, with a new chat. */
  async restoreBackup(name: string): Promise<{ id: string; chatId: string }> {
    const dir = this.backupDir(name);
    const meta = readMeta(dir);
    if (
      this.deps.apps.isApp(meta.id) ||
      (await this.deps.extensions.list()).some((e) => e.id === meta.id)
    )
      throw new LifecycleError(
        `There is an app "${meta.id}" already. Uninstall it first to bring this one back.`,
      );
    await this.unarchive(dir);
    const chatId = this.deps.apps.sources().find((a) => a.id === meta.id)?.chatId ?? "";
    log.info("app restored from backup", { app: meta.id, backup: name });
    return { id: meta.id, chatId };
  }

  /** User action: deletes a backup for good. */
  deleteBackup(name: string): void {
    rmSync(this.backupDir(name), { recursive: true, force: true });
  }

  /** The app's chat as Markdown, for the backup: chats themselves are not restored. */
  private async chatText(chatId: string, appName: string): Promise<string> {
    const messages = await this.deps.repo
      .listMessages(chatId, { limit: CHAT_EXPORT_LIMIT })
      .catch(() => []);
    const lines = messages.map((m) => {
      const who = m.author.kind === "user" ? "You" : `@${m.author.id}`;
      return `### ${who} · ${m.createdAt}\n\n${m.body || (m.card ? `[${m.card.type}]` : "")}\n`;
    });
    return [`# The chat of ${appName}`, "", ...lines].join("\n");
  }
}

export function readMeta(dir: string): ArchiveMeta {
  const raw: unknown = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("id" in raw) ||
    typeof raw.id !== "string" ||
    !APP_ID_PATTERN.test(raw.id)
  )
    throw new LifecycleError(`${dir} has no valid meta.json`);
  return raw as ArchiveMeta;
}
