import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { HANDLE_PATTERN, type Message } from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { hostAllowed } from "../../../providers/hosts";
import type { ChatService } from "../../chats/chat/service";
import type { ProjectService } from "../../chats/projects/service";
import { redact } from "../../helpers/agents/env";
import { ActionError, type AppActions } from "../apps/actions";
import { type AppDataService, DataError, type Query } from "../apps/data";
import { ExtensionError, type ExtensionService } from "./extensions";

/** The request was refused by a permission or a limit (HTTP 403). */
export class ExtensionDenied extends Error {
  override name = "ExtensionDenied";
}

const MAX_KEY = 200;
const MAX_VALUE = 256_000;
const MAX_KEYS = 1000;
const MAX_RESPONSE = 2_000_000;
const MAX_FILE = 1_000_000;
const FETCH_TIMEOUT_MS = 20_000;
/** Agent requests per extension per minute: a buggy loop must not burn the budget. */
export const ASK_LIMIT = 10;
const SECRET_REF = /\$\{secret:([A-Z_][A-Z0-9_]{0,63})\}/g;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

export interface DataRequest {
  op: "list" | "count" | "get" | "insert" | "update" | "delete" | "schema";
  collection: string;
  id?: string;
  record?: unknown;
  patch?: unknown;
  query?: Query;
}

export interface FetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchResult {
  status: number;
  ok: boolean;
  contentType: string | null;
  body: string;
  truncated: boolean;
}

export interface FileEntry {
  name: string;
  type: "file" | "dir";
  size: number;
}

/**
 * The server side of the extension API v2 (ADR 0021): per-extension storage, network through
 * approved hosts with secrets put in by the server, asking agents as the user, and reading project
 * files. Every call checks what the user granted at install.
 */
export class ExtensionBridge {
  private readonly asks = new Map<string, number[]>();

  constructor(
    private readonly deps: {
      db: Surreal;
      extensions: ExtensionService;
      /** Each app's own secrets (ADR 0030). */
      secrets: { get(app: string, name: string): string | null };
      chat: ChatService;
      projects: ProjectService;
      fetch?: typeof fetch;
      now?: () => number;
      /** Apps built in Aura keep their data in their own store (ADR 0024). */
      apps?: { isApp: (id: string) => boolean; data: AppDataService; actions: AppActions };
    },
  ) {}

  private app(id: string) {
    const apps = this.deps.apps;
    return apps?.isApp(id) ? apps : null;
  }

  private async need(id: string, permission: Parameters<ExtensionService["grant"]>[1]) {
    const grant = await this.deps.extensions.grant(id, permission);
    if (!grant) throw new ExtensionDenied(`Permission "${permission}" was not granted`);
    return grant;
  }

  // Storage: a small key-value store per extension, kept in the database (not in chats).

  async storageGet(id: string, key: string): Promise<unknown> {
    await this.need(id, "storage");
    const app = this.app(id);
    if (app) return app.data.kvGet(id, this.key(key));
    const [rows] = await this.deps.db
      .query<[{ value?: string }[]]>("SELECT * FROM extension_data WHERE id = $id", {
        id: this.keyId(id, key),
      })
      .collect();
    const raw = rows?.[0]?.value;
    return typeof raw === "string" ? JSON.parse(raw) : null;
  }

  async storageSet(id: string, key: string, value: unknown): Promise<void> {
    await this.need(id, "storage");
    const json = JSON.stringify(value ?? null);
    if (json.length > MAX_VALUE) throw new ExtensionError("value is larger than 256 KB");
    const app = this.app(id);
    if (app) return app.data.kvSet(id, this.key(key), value);
    const keys = await this.storageKeys(id);
    if (!keys.includes(key) && keys.length >= MAX_KEYS)
      throw new ExtensionError(`storage holds at most ${MAX_KEYS} keys`);
    await this.deps.db
      .query("UPSERT $id CONTENT { ext: $ext, key: $key, value: $value }", {
        id: this.keyId(id, key),
        ext: id,
        key,
        value: json,
      })
      .collect();
  }

  async storageDelete(id: string, key: string): Promise<void> {
    await this.need(id, "storage");
    const app = this.app(id);
    if (app) return app.data.kvSet(id, this.key(key), null);
    await this.deps.db.query("DELETE $id", { id: this.keyId(id, key) }).collect();
  }

  async storageKeys(id: string): Promise<string[]> {
    await this.need(id, "storage");
    const app = this.app(id);
    if (app) return app.data.kvKeys(id);
    const [rows] = await this.deps.db
      .query<[{ key: string }[]]>("SELECT key FROM extension_data WHERE ext = $ext", { ext: id })
      .collect();
    return (rows ?? []).map((r) => r.key).sort();
  }

  /** Removes everything an extension stored (when it is removed). */
  async forget(id: string): Promise<void> {
    await this.deps.db.query("DELETE extension_data WHERE ext = $ext", { ext: id }).collect();
  }

  private key(key: string): string {
    if (!key || key.length > MAX_KEY) throw new ExtensionError("key must be 1-200 characters");
    return key;
  }

  // An app's collections and actions (ADR 0024, phases 24-25), with its storage permission.

  async data(id: string, req: DataRequest): Promise<unknown> {
    await this.need(id, "storage");
    const app = this.app(id);
    if (!app) throw new ExtensionDenied("Only apps built in Aura have collections");
    try {
      switch (req.op) {
        case "schema":
          // The collection's fields, for forms and tables built by the kit.
          return (
            (await this.deps.extensions.contract(id)).collections[req.collection]?.fields ?? null
          );
        case "list":
          return await app.data.list(id, req.collection, req.query);
        case "count":
          return await app.data.count(id, req.collection, req.query);
        case "get":
          return await app.data.get(id, req.collection, req.id ?? "");
        case "insert":
          return await app.data.insert(id, req.collection, req.record);
        case "update":
          return await app.data.update(id, req.collection, req.id ?? "", req.patch);
        case "delete":
          return await app.data.remove(id, req.collection, req.id ?? "");
      }
    } catch (error) {
      if (error instanceof DataError) throw new ExtensionError(error.message);
      throw error;
    }
  }

  async runAction(id: string, action: string, input: unknown): Promise<unknown> {
    await this.need(id, "storage");
    const app = this.app(id);
    if (!app) throw new ExtensionDenied("Only apps built in Aura have actions");
    return this.translate(() => app.actions.run(id, action, input));
  }

  /** Another app's action, through the contract both sides agreed to (phase 25). */
  async callApp(id: string, target: string, action: string, input: unknown): Promise<unknown> {
    await this.need(id, "apps.call");
    const apps = this.deps.apps;
    if (!apps?.isApp(target)) throw new ExtensionError(`There is no app "${target}"`);
    return this.translate(() => apps.actions.callFrom(id, target, action, input));
  }

  private async translate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ActionError) throw new ExtensionDenied(error.message);
      if (error instanceof DataError) throw new ExtensionError(error.message);
      throw error;
    }
  }

  private keyId(id: string, key: string): RecordId {
    if (!key || key.length > MAX_KEY) throw new ExtensionError("key must be 1-200 characters");
    return new RecordId("extension_data", [id, key]);
  }

  // Network: only the hosts granted at install; the server puts stored secrets into the request
  // and hides their values in the answer, so the frame never holds a key.

  async fetch(id: string, req: FetchRequest): Promise<FetchResult> {
    const grant = await this.need(id, "net");
    const used: string[] = [];
    const fill = (text: string) =>
      text.replace(SECRET_REF, (_ref, name: string) => {
        if (!grant.secrets.includes(name))
          throw new ExtensionDenied(`Secret ${name} is not in the extension's manifest`);
        const value = this.deps.secrets.get(id, name);
        if (value === null)
          throw new ExtensionError(`Secret ${name} has no value: set it in the app's Secrets`);
        used.push(value);
        return value;
      });

    let url: URL;
    try {
      url = new URL(fill(req.url));
    } catch (error) {
      if (error instanceof ExtensionDenied || error instanceof ExtensionError) throw error;
      throw new ExtensionError("url is not a valid address");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new ExtensionError("only http and https addresses");
    if (!allowedHost(url, grant.hosts))
      throw new ExtensionDenied(
        `${url.host} is not among the extension's hosts (${grant.hosts.join(", ") || "none"})`,
      );
    const method = (req.method ?? "GET").toUpperCase();
    if (!METHODS.has(method)) throw new ExtensionError(`method ${method} is not supported`);
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(req.headers ?? {})) headers[name] = fill(value);

    const response = await (this.deps.fetch ?? fetch)(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : req.body,
      // A redirect could lead to another host: the extension gets it and decides.
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await response.text();
    const truncated = text.length > MAX_RESPONSE;
    return {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      body: redact(truncated ? text.slice(0, MAX_RESPONSE) : text, used),
      truncated,
    };
  }

  // Agents: a message from the user with @agent, so the normal routing, budgets and depth apply.

  async ask(
    id: string,
    input: { chatId: string; agent: string; text: string },
    owner: { id: string },
  ): Promise<Message> {
    await this.need(id, "agents.ask");
    const agent = input.agent.replace(/^@/, "").toLowerCase();
    if (!HANDLE_PATTERN.test(agent)) throw new ExtensionError(`"${input.agent}" is not an agent`);
    const text = input.text.trim();
    if (!text) throw new ExtensionError("text is empty");
    const now = (this.deps.now ?? Date.now)();
    const recent = (this.asks.get(id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= ASK_LIMIT)
      throw new ExtensionDenied(`At most ${ASK_LIMIT} agent requests a minute`);
    this.asks.set(id, [...recent, now]);
    return this.deps.chat.post({
      chatId: input.chatId,
      author: { kind: "user", id: owner.id },
      body: `@${agent} ${text}`,
    });
  }

  // Project files, read-only and inside the project folder.

  async listFiles(id: string, project: string, path: string): Promise<FileEntry[]> {
    await this.need(id, "files.read");
    const dir = await this.resolve(project, path);
    if (!statSync(dir).isDirectory()) throw new ExtensionError(`${path} is not a folder`);
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.name !== ".git" && (e.isFile() || e.isDirectory()))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? ("dir" as const) : ("file" as const),
        size: e.isFile() ? statSync(join(dir, e.name)).size : 0,
      }))
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
      );
  }

  async readFile(id: string, project: string, path: string): Promise<string> {
    await this.need(id, "files.read");
    const file = await this.resolve(project, path);
    const stat = statSync(file);
    if (!stat.isFile()) throw new ExtensionError(`${path} is not a file`);
    if (stat.size > MAX_FILE) throw new ExtensionError(`${path} is larger than 1 MB`);
    return readFile(file, "utf8");
  }

  private async resolve(project: string, path: string): Promise<string> {
    const info = await this.deps.projects.get(project);
    if (!info) throw new ExtensionError(`No project "${project}"`);
    const root = realpathSync(info.workspace);
    const target = resolve(root, path.replace(/^\/+/, ""));
    if (!existsSync(target)) throw new ExtensionError(`${path} does not exist`);
    // Symlinks are resolved too, so a link cannot lead out of the project.
    const real = realpathSync(target);
    const rel = relative(root, real);
    if (rel.startsWith("..") || rel.startsWith(sep) || rel.split(sep).includes(".git"))
      throw new ExtensionDenied(`${path} is outside the project files`);
    return real;
  }
}

/** `host:port` entries match the exact address; plain names match any port (and `*.` subdomains). */
function allowedHost(url: URL, hosts: readonly string[]): boolean {
  return hosts.some((h) =>
    h.includes(":") ? url.host.toLowerCase() === h : hostAllowed(url.hostname, [h]),
  );
}
