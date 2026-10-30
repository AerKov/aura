/// <reference path="../../../providers/vendor-files.d.ts" />
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BAR_APP_ID,
  EXTENSION_ICONS,
  type ExtensionIcon,
  type ExtensionInfo,
  type ExtensionPermission,
  LOCALE_CODE,
  MAX_APP_DESCRIPTION,
  MAX_APP_GROUP,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { commitAll, git } from "../../../lib/git";
import type { ApprovalRecord, ApprovalService } from "../../system/approvals/service";
import type { EventHub } from "../../system/realtime/hub";
import {
  type Contract,
  describeContract,
  EMPTY_CONTRACT,
  validateContract,
} from "../apps/contract";
import { LIBRARY_PATH, MAX_LIBRARIES_TOTAL } from "../apps/libraries";
import kitSource from "./kit.js.txt" with { type: "text" };

export class ExtensionError extends Error {
  override name = "ExtensionError";
}

export const PERMISSIONS: Record<ExtensionPermission, string> = {
  "chat.read": "Read chats and messages",
  "chat.write": "Post messages (as the extension)",
  "ui.panel": "Show a panel in the app",
  "ui.bar": "Be Aura's bar: list and open apps, see the screen and the status",
  "alerts.read": "Read alerts",
  "alerts.write": "Post alert cards to the Alerts chat (as itself; warnings wake the orchestrator)",
  storage: "Keep its own data",
  net: "Reach the listed hosts (through Aura)",
  "agents.ask": "Ask agents for you (as your message, within budgets)",
  "files.read": "Read project files",
  docs: "Keep its own files (PDFs, images…), let you add and save them, and show them",
  "apps.call": "Use other apps' actions listed below",
};

const ID = /^[a-z][a-z0-9-]{1,47}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const MAX_CODE = 200_000;
/** A host name, optionally with a port, or `*.` for its subdomains. */
const HOST = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;
const SECRET_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
export const ERROR_LIMIT = 3;

export interface Manifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  permissions: ExtensionPermission[];
  author: string;
  mobile?: boolean;
  icon?: ExtensionIcon;
  /** One line on what it is for, for the launcher (ADR 0033). */
  description?: string;
  /** Its launcher group. */
  group?: string;
  /** Hosts `net` may reach. */
  hosts?: string[];
  /** Stored secrets the server may substitute into its requests. */
  secrets?: string[];
  /** An app's data and actions (phases 24-25). */
  contract?: Contract;
  /** Library files in its folder, loaded before main.js in this order (ADR 0033). */
  libraries?: string[];
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function validateManifest(value: unknown, expectedId?: string): Manifest {
  if (typeof value !== "object" || value === null)
    throw new ExtensionError("manifest must be an object");
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || !ID.test(m.id))
    throw new ExtensionError("id must be 2-48 chars: lowercase letters, digits, dashes");
  if (expectedId && m.id !== expectedId)
    throw new ExtensionError(`manifest id "${m.id}" does not match the folder "${expectedId}"`);
  if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 60)
    throw new ExtensionError("name is required (max 60 chars)");
  if (typeof m.version !== "string" || !SEMVER.test(m.version))
    throw new ExtensionError("version must be x.y.z");
  if (typeof m.minAppVersion !== "string" || !SEMVER.test(m.minAppVersion))
    throw new ExtensionError("minAppVersion must be x.y.z");
  if (
    !Array.isArray(m.permissions) ||
    !m.permissions.every((p) => typeof p === "string" && p in PERMISSIONS)
  ) {
    throw new ExtensionError(
      `permissions must be a subset of ${Object.keys(PERMISSIONS).join(", ")}`,
    );
  }
  if (typeof m.author !== "string" || !m.author.trim())
    throw new ExtensionError("author is required");
  const permissions = [...new Set(m.permissions as ExtensionPermission[])];
  // Only the bar app may be the bar (ADR 0029).
  if (permissions.includes("ui.bar") && m.id !== BAR_APP_ID)
    throw new ExtensionError(`only the app "${BAR_APP_ID}" may ask for ui.bar`);
  if (m.icon !== undefined && !(EXTENSION_ICONS as readonly unknown[]).includes(m.icon))
    throw new ExtensionError(`icon must be one of ${EXTENSION_ICONS.join(", ")}`);
  const libraries = stringList(m.libraries, "libraries");
  const badLibrary = libraries.find((l) => !LIBRARY_PATH.test(l));
  if (badLibrary)
    throw new ExtensionError(
      `"${badLibrary}" is not a library path: lib/… ending in .js, .mjs or .css (add_library puts files there)`,
    );
  const description = optionalText(m.description, "description", MAX_APP_DESCRIPTION);
  const group = optionalText(m.group, "group", MAX_APP_GROUP);
  const hosts = stringList(m.hosts, "hosts").map((h) => h.toLowerCase());
  const bad = hosts.find((h) => !HOST.test(h));
  if (bad) throw new ExtensionError(`"${bad}" is not a host name (e.g. api.example.com)`);
  const secrets = stringList(m.secrets, "secrets");
  const badSecret = secrets.find((s) => !SECRET_NAME.test(s));
  if (badSecret) throw new ExtensionError(`"${badSecret}" is not a secret name (UPPER_CASE)`);
  if (permissions.includes("net") !== hosts.length > 0)
    throw new ExtensionError('the "net" permission and a non-empty hosts list go together');
  if (secrets.length > 0 && hosts.length === 0)
    throw new ExtensionError("secrets are only used in requests to hosts; list the hosts");
  let contract: Contract;
  try {
    contract = validateContract(m);
  } catch (error) {
    throw new ExtensionError(error instanceof Error ? error.message : String(error));
  }
  if (permissions.includes("apps.call") !== contract.uses.length > 0)
    throw new ExtensionError('the "apps.call" permission and a non-empty uses list go together');
  return {
    id: m.id,
    name: m.name.trim(),
    version: m.version,
    minAppVersion: m.minAppVersion,
    permissions,
    author: m.author.trim(),
    mobile: m.mobile === true,
    ...(m.icon ? { icon: m.icon as ExtensionIcon } : {}),
    ...(description ? { description } : {}),
    ...(group ? { group } : {}),
    ...(hosts.length ? { hosts: [...new Set(hosts)] } : {}),
    ...(secrets.length ? { secrets: [...new Set(secrets)] } : {}),
    ...(Object.keys(contract.collections).length || contract.uses.length ? { contract } : {}),
    ...(libraries.length ? { libraries: [...new Set(libraries)] } : {}),
  };
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max || value.includes("\n"))
    throw new ExtensionError(`${field} must be one line of at most ${max} characters`);
  return value.trim() || null;
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20 || !value.every((v) => typeof v === "string"))
    throw new ExtensionError(`${field} must be a list of at most 20 strings`);
  return value as string[];
}

/** What an extension asks for, as shown on install cards (permissions, hosts, secrets). */
export function describeManifest(m: Manifest): string[] {
  return [
    ...m.permissions.map((p) => `- \`${p}\`: ${PERMISSIONS[p]}`),
    m.permissions.length === 0 ? "- nothing" : "",
    m.hosts?.length ? `- hosts: ${m.hosts.map((h) => `\`${h}\``).join(", ")}` : "",
    m.secrets?.length
      ? `- secrets put into those requests by Aura (the extension never sees them): ${m.secrets.map((s) => `\`${s}\``).join(", ")}`
      : "",
    ...(m.contract ? describeContract(m.contract) : []),
    ...(m.libraries ?? []).map((l) => `- library: \`${l}\` (runs inside the app only)`),
  ].filter(Boolean);
}

export interface AppSource {
  id: string;
  dir: string;
  chatId: string;
}

/** An app's live version and whether an agent left changes waiting for approval. */
async function appState(source: AppSource): Promise<ExtensionInfo["app"]> {
  const [revision, status] = await Promise.all([
    git(source.dir, ["rev-parse", "--short", "HEAD"]).catch(() => ""),
    git(source.dir, ["status", "--porcelain"]).catch(() => ""),
  ]);
  return { chatId: source.chatId, revision, draft: status.length > 0 };
}

interface State {
  enabled: boolean;
  granted: ExtensionPermission[];
  /** Hosts and secrets granted with the permissions; a later manifest edit does not widen them. */
  hosts: string[];
  secrets: string[];
  /** Other apps' actions it may call ("app.action"), as approved. */
  calls: string[];
  errors: number;
}

/** What the user granted an extension, without its error count. */
export type GrantedState = Omit<State, "errors">;

const grants = (m: Manifest) => ({
  granted: m.permissions,
  hosts: m.hosts ?? [],
  secrets: m.secrets ?? [],
  calls: m.contract?.uses ?? [],
});

/**
 * Tier 3 customization (docs/SPEC.md section 11): UI extensions in `extensions/<id>/`. They run in a
 * sandboxed iframe served from the server origin and reach the app only through a permission-checked
 * postMessage bridge. Extensions installed by hand stay disabled until the user enables them.
 */
export class ExtensionService {
  constructor(
    private readonly deps: {
      db: Surreal;
      dataDir: string;
      approvals: ApprovalService;
      hub: EventHub;
      appVersion: string;
      safeMode: () => boolean;
      /** Apps built in Aura (ADR 0024), whose code lives in a project workspace. */
      apps?: () => AppSource[];
      /** Project apps (ADR 0021): checks a project and pins an extension to it. */
      projectExists?: (project: string) => Promise<boolean>;
      bindProject?: (project: string, extensionId: string) => Promise<void>;
      /** An installed extension becomes an app with a chat (ADR 0039). */
      afterInstall?: (id: string) => Promise<void>;
    },
  ) {
    deps.approvals.register("extension_install", async (payload, ctx) =>
      this.install(payload, ctx.requestedBy),
    );
  }

  private dirOf(id: string): string {
    return this.appOf(id)?.dir ?? join(this.deps.dataDir, "extensions", id);
  }

  /** An app built in Aura (ADR 0024): its code is a project's workspace. */
  private appOf(id: string): AppSource | undefined {
    return this.deps.apps?.().find((a) => a.id === id);
  }

  /**
   * A file of an extension. An app runs its last approved version (its git HEAD); `draft` reads
   * the working copy instead, with the changes an agent made and the user has not approved yet.
   */
  private async fileOf(id: string, name: string, draft = false): Promise<string | null> {
    const app = this.appOf(id);
    if (app && !draft) return git(app.dir, ["show", `HEAD:${name}`]).catch(() => null);
    const file = join(this.dirOf(id), name);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  }

  private async state(id: string): Promise<State> {
    const [rows] = await this.deps.db
      .query<[Record<string, unknown>[]]>("SELECT * FROM extension_state WHERE id = $id", {
        id: new RecordId("extension_state", id),
      })
      .collect();
    const row = rows?.[0];
    return {
      enabled: row?.enabled === true,
      granted: (row?.granted_permissions as ExtensionPermission[] | undefined) ?? [],
      hosts: (row?.granted_hosts as string[] | undefined) ?? [],
      secrets: (row?.granted_secrets as string[] | undefined) ?? [],
      calls: (row?.granted_calls as string[] | undefined) ?? [],
      errors: Number(row?.errors ?? 0),
    };
  }

  private async saveState(id: string, version: string, state: State): Promise<void> {
    await this.deps.db
      .query(
        "UPSERT $id CONTENT { version: $version, enabled: $enabled, granted_permissions: $granted, granted_hosts: $hosts, granted_secrets: $secrets, granted_calls: $calls, errors: $errors }",
        {
          id: new RecordId("extension_state", id),
          version,
          enabled: state.enabled,
          granted: state.granted,
          hosts: state.hosts,
          secrets: state.secrets,
          calls: state.calls,
          errors: state.errors,
        },
      )
      .collect();
    this.deps.hub.publish({ type: "customize.updated" });
  }

  private async readManifest(id: string): Promise<Manifest> {
    const text = await this.fileOf(id, "manifest.json");
    if (text === null) throw new ExtensionError("manifest.json is missing");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ExtensionError("manifest.json is not valid JSON");
    }
    return validateManifest(parsed, id);
  }

  async list(): Promise<ExtensionInfo[]> {
    const root = join(this.deps.dataDir, "extensions");
    const installed = existsSync(root)
      ? readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory() && ID.test(e.name))
          .map((e) => e.name)
      : [];
    const apps = (this.deps.apps?.() ?? []).map((a) => a.id);
    const ids = [...new Set([...installed, ...apps])].sort();
    return Promise.all(ids.map((id) => this.info(id)));
  }

  async info(id: string): Promise<ExtensionInfo> {
    const state = await this.state(id);
    try {
      const m = await this.readManifest(id);
      const problem =
        compareVersions(m.minAppVersion, this.deps.appVersion) > 0
          ? `needs app ${m.minAppVersion} or newer (this is ${this.deps.appVersion})`
          : (await this.fileOf(id, "main.js")) === null
            ? "main.js is missing"
            : null;
      const source = this.appOf(id);
      return {
        id: m.id,
        name: m.name,
        version: m.version,
        minAppVersion: m.minAppVersion,
        author: m.author,
        description: m.description ?? null,
        group: m.group ?? null,
        icon: m.icon ?? null,
        enabled: state.enabled && !problem,
        permissions: state.enabled ? state.granted : m.permissions,
        hosts: state.enabled ? state.hosts : (m.hosts ?? []),
        secrets: state.enabled ? state.secrets : (m.secrets ?? []),
        app: source ? await appState(source) : null,
        problem,
      };
    } catch (error) {
      return {
        id,
        name: id,
        version: "0.0.0",
        minAppVersion: "0.0.0",
        permissions: [],
        author: "",
        description: null,
        group: null,
        icon: null,
        hosts: [],
        secrets: [],
        app: null,
        enabled: false,
        problem: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** User action: removes the extension's files (one commit, so it can be restored) and its state. */
  async remove(id: string, author = "owner"): Promise<void> {
    if (this.appOf(id))
      throw new ExtensionError("This is an app built in Aura: archive its project instead");
    if (!ID.test(id) || !existsSync(this.dirOf(id)))
      throw new ExtensionError(`No extension "${id}"`);
    rmSync(this.dirOf(id), { recursive: true, force: true });
    await this.deps.db.query("DELETE $id", { id: new RecordId("extension_state", id) }).collect();
    await commitAll(this.deps.dataDir, `extensions(${id}): remove`, author);
    this.deps.hub.publish({ type: "customize.updated" });
  }

  /** What the user granted an app, to keep in its backup (ADR 0033). */
  async exportState(id: string): Promise<GrantedState> {
    const { enabled, granted, hosts, secrets, calls } = await this.state(id);
    return { enabled, granted, hosts, secrets, calls };
  }

  /** Puts back what was granted, when an app comes back from a backup or a restore point. */
  async importState(id: string, state: GrantedState): Promise<void> {
    const manifest = await this.readManifest(id);
    await this.saveState(id, manifest.version, { ...state, errors: 0 });
  }

  /** Forgets an app's grants when it is uninstalled. */
  async forgetState(id: string): Promise<void> {
    await this.deps.db.query("DELETE $id", { id: new RecordId("extension_state", id) }).collect();
    this.deps.hub.publish({ type: "customize.updated" });
  }

  /** User action: enabling grants exactly the permissions the manifest requests (shown before). */
  async setEnabled(id: string, enabled: boolean): Promise<ExtensionInfo> {
    const manifest = await this.readManifest(id);
    await this.saveState(id, manifest.version, {
      enabled,
      ...(enabled ? grants(manifest) : { granted: [], hosts: [], secrets: [], calls: [] }),
      errors: 0,
    });
    return this.info(id);
  }

  /** Called by the client when an extension throws; repeated errors disable it. */
  async reportError(id: string): Promise<{ disabled: boolean }> {
    const state = await this.state(id);
    if (!state.enabled) return { disabled: true };
    const errors = state.errors + 1;
    const disabled = errors >= ERROR_LIMIT;
    const manifest = await this.readManifest(id);
    await this.saveState(id, manifest.version, { ...state, enabled: !disabled, errors });
    return { disabled };
  }

  async hasPermission(id: string, permission: ExtensionPermission): Promise<boolean> {
    if (this.deps.safeMode()) return false;
    const info = await this.info(id);
    return info.enabled && info.permissions.includes(permission);
  }

  /** Whether the extension may run with this permission now, and what it was granted. */
  async grant(
    id: string,
    permission: ExtensionPermission,
  ): Promise<{ hosts: string[]; secrets: string[]; calls: string[] } | null> {
    if (this.deps.safeMode() || !ID.test(id)) return null;
    const info = await this.info(id);
    if (!info.enabled || !info.permissions.includes(permission)) return null;
    const state = await this.state(id);
    return { hosts: info.hosts, secrets: info.secrets, calls: state.calls };
  }

  /** The data and actions an app declares in its live (approved) manifest. */
  async contract(id: string): Promise<Contract> {
    return (await this.readManifest(id)).contract ?? EMPTY_CONTRACT;
  }

  async propose(
    input: { manifest: unknown; mainJs: string; stylesCss?: string; project?: string },
    by: { requestedBy: string; chatId: string; topicId?: string | null; why: string },
  ): Promise<ApprovalRecord> {
    const manifest = validateManifest(input.manifest);
    if (!input.mainJs.trim() || input.mainJs.length > MAX_CODE)
      throw new ExtensionError("main.js is required (max 200 KB)");
    if (!/export\s+default/.test(input.mainJs))
      throw new ExtensionError("main.js must `export default function activate(ctx)`");
    if (input.project && !(await this.deps.projectExists?.(input.project)))
      throw new ExtensionError(`No project "${input.project}"`);
    if (compareVersions(manifest.minAppVersion, this.deps.appVersion) > 0) {
      throw new ExtensionError(
        `minAppVersion ${manifest.minAppVersion} is newer than this app (${this.deps.appVersion})`,
      );
    }
    const code =
      input.mainJs.length > 6000
        ? `${input.mainJs.slice(0, 6000)}\n// … ${input.mainJs.length - 6000} more characters`
        : input.mainJs;
    return this.deps.approvals.request({
      kind: "extension_install",
      requestedBy: by.requestedBy,
      chatId: by.chatId,
      topicId: by.topicId,
      title: `Install extension "${manifest.name}" ${manifest.version}`,
      why: by.why,
      preview: [
        "**It asks for:**",
        ...describeManifest(manifest),
        "",
        input.project
          ? `It becomes the app of project **${input.project}** and opens next to its chat.\n`
          : "",
        "It runs sandboxed: no direct network, no access to the app except these permissions.",
        "",
        "**main.js**",
        `\`\`\`js\n${code}\n\`\`\``,
      ].join("\n"),
      payload: {
        manifest,
        mainJs: input.mainJs,
        stylesCss: input.stylesCss ?? "",
        project: input.project ?? null,
      },
    });
  }

  private async install(payload: Record<string, unknown>, author: string): Promise<string> {
    const manifest = validateManifest(payload.manifest);
    if (this.appOf(manifest.id))
      throw new ExtensionError(`"${manifest.id}" is an app built in Aura; choose another id`);
    const dir = this.dirOf(manifest.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(dir, "main.js"), String(payload.mainJs ?? ""));
    writeFileSync(join(dir, "styles.css"), String(payload.stylesCss ?? ""));
    await commitAll(
      this.deps.dataDir,
      `extension(${manifest.id}): install ${manifest.version}`,
      author,
    );
    // Approved by the user with its permissions shown, so it is enabled right away.
    await this.saveState(manifest.id, manifest.version, {
      enabled: true,
      ...grants(manifest),
      errors: 0,
    });
    await this.deps.afterInstall?.(manifest.id);
    if (typeof payload.project === "string" && payload.project) {
      await this.deps.bindProject?.(payload.project, manifest.id);
      return `Installed and enabled "${manifest.name}" as the app of project ${payload.project}.`;
    }
    return `Installed and enabled "${manifest.name}".`;
  }

  /** HTML of the sandboxed frame, or null when the extension may not run. */
  async frame(id: string, draft = false, language?: string): Promise<string | null> {
    if (this.deps.safeMode()) return null;
    const info = await this.info(id);
    if (!info.enabled) return null;
    const main = await this.fileOf(id, "main.js", draft);
    if (main === null) return null;
    const styles = (await this.fileOf(id, "styles.css", draft)) ?? "";
    const lang = language && LOCALE_CODE.test(language) ? language : "en";
    return frameHtml(info, main, styles, await this.libraries(id, draft), lang);
  }

  /** The app's library files, as its manifest lists them; missing ones are skipped. */
  private async libraries(id: string, draft: boolean): Promise<Library[]> {
    let paths: string[] = [];
    try {
      const text = await this.fileOf(id, "manifest.json", draft);
      paths = text ? (validateManifest(JSON.parse(text), id).libraries ?? []) : [];
    } catch {
      return [];
    }
    const out: Library[] = [];
    let total = 0;
    for (const path of paths) {
      const source = await this.fileOf(id, path, draft);
      if (source === null) continue;
      total += source.length;
      if (total > MAX_LIBRARIES_TOTAL) break;
      out.push({ path, source });
    }
    return out;
  }

  /**
   * After the user approved a change to an app: its manifest may ask for other permissions, which
   * the approval card showed, so they are granted as they now are.
   */
  async regrant(id: string): Promise<void> {
    const manifest = await this.readManifest(id);
    const state = await this.state(id);
    await this.saveState(id, manifest.version, { ...state, enabled: true, ...grants(manifest) });
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Escapes text for use inside a <script> or <style> element. */
function inert(text: string): string {
  return text.replace(/<\/(script|style)/gi, "<\\/$1");
}

interface Library {
  path: string;
  source: string;
}

function frameHtml(
  info: ExtensionInfo,
  main: string,
  styles: string,
  libraries: Library[] = [],
  language = "en",
): string {
  const css = libraries.filter((l) => l.path.endsWith(".css"));
  const scripts = libraries.filter((l) => l.path.endsWith(".js"));
  const modules = Object.fromEntries(
    libraries.filter((l) => l.path.endsWith(".mjs")).map((l) => [l.path, l.source]),
  );
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(info.name)}</title>
${FRAME_STYLE}
${css.map((l) => `<style>${inert(l.source)}</style>`).join("\n")}
<style>${inert(styles)}</style>
<script>window.__auraFrame = ${inert(JSON.stringify({ language, libraries: modules }))};</script>
${FRAME_RUNTIME}
${scripts.map((l) => `<script>${inert(l.source)}</script>`).join("\n")}
</head><body><div id="root"></div>
<script type="module">
const source = ${inert(JSON.stringify(main))};
try {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const mod = await import(url);
  if (typeof mod.default !== "function") throw new Error("main.js has no default export");
  await mod.default(window.aura);
} catch (error) {
  window.aura.__reportError(error);
}
</script>
</body></html>`;
}

/** The app kit (phase 26), loaded before the bridge. */
const KIT: string = kitSource;

/** Runs inside the frame: the only way an extension can talk to the app. */
const BRIDGE = `(() => {
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    parent.postMessage({ aura: 1, id, method, params: params ?? {} }, "*");
  });
  addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || data.aura !== 1) return;
    if (data.event === "theme") {
      // The app's design tokens, so extensions can match the current theme with var(--…).
      for (const [name, value] of Object.entries(data.payload || {})) {
        if (/^--[a-z-]+$/.test(name) && typeof value === "string") document.documentElement.style.setProperty(name, value);
      }
      return;
    }
    if (data.event === "snapshot") {
      // An agent looks at the app (WISH-2): an outline of what is on the page, and recent errors.
      const r = data.payload || {};
      call("snapshot.result", { requestId: r.requestId, width: innerWidth, height: innerHeight, outline: outline(), errors: errors.slice(-20) }).catch(() => {});
      return;
    }
    if (data.event) {
      for (const fn of listeners.get(data.event) ?? []) {
        try { fn(data.payload); } catch (error) { report(error); }
      }
      return;
    }
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result);
  });
  const errors = [];
  const report = (error) => {
    const message = String(error && error.message || error);
    errors.push(message);
    if (errors.length > 50) errors.shift();
    parent.postMessage({ aura: 1, method: "error", params: { message } }, "*");
  };
  // A compact text outline of the visible page, for agents (WISH-2).
  const outline = () => {
    const lines = [];
    const visible = (el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden"; };
    const say = (depth, text) => { const t = String(text).replace(/\\s+/g, " ").trim(); if (t) lines.push("  ".repeat(Math.min(depth, 8)) + t.slice(0, 200)); };
    const walk = (node, depth) => {
      if (lines.length > 400) return;
      if (node.nodeType === 3) { say(depth, node.textContent); return; }
      if (node.nodeType !== 1 || !visible(node)) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return;
      if (/^h[1-6]$/.test(tag)) return say(depth, "#".repeat(Number(tag[1])) + " " + node.textContent);
      if (tag === "button") return say(depth, "[button: " + (node.textContent.trim() || node.getAttribute("aria-label") || node.title) + "]" + (node.disabled ? " (disabled)" : ""));
      if (tag === "input" || tag === "textarea" || tag === "select") {
        const own = node.labels && node.labels[0] ? [...node.labels[0].childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ") : "";
        const label = own.trim() || node.placeholder || node.name;
        const value = node.type === "password" ? "•••" : node.type === "checkbox" ? (node.checked ? "checked" : "unchecked") : node.value;
        return say(depth, "[" + (node.type || tag) + (label ? " " + label.trim() : "") + (value ? " = " + value : "") + "]");
      }
      if (tag === "img") return say(depth, "[image " + (node.alt || "") + "]");
      if (tag === "table") { say(depth, "[table, " + node.rows.length + " rows]"); for (const row of [...node.rows].slice(0, 8)) say(depth + 1, [...row.cells].map((c) => c.textContent.trim()).join(" | ")); return; }
      // A label's own text is said by its field; its other elements are walked.
      if (tag === "label") { for (const child of node.children) walk(child, depth + 1); return; }
      for (const child of node.childNodes) walk(child, depth + 1);
    };
    walk(document.body, 0);
    return lines.join("\\n");
  };
  addEventListener("error", (event) => report(event.error || event.message));
  addEventListener("unhandledrejection", (event) => report(event.reason));
  // Themed controls for agents' forms and buttons. No <form> submit: sandboxed frames cannot submit.
  // File content as the host takes it: text, or bytes as base64 (a string, bytes or { base64 }).
  const bytesOrText = (data) => {
    if (typeof data === "string") return { text: data };
    if (data && typeof data.base64 === "string") return { base64: data.base64 };
    if (data && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { base64: btoa(binary) };
    }
    throw new Error("A file's content is a string, bytes or { base64 }");
  };
  const button = (el, label, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aura-button";
    b.textContent = label;
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await onClick(); } catch (error) { report(error); } finally { b.disabled = false; }
    });
    el.append(b);
    return b;
  };
  const form = (el, spec) => {
    const root = document.createElement("div");
    root.className = "aura-form";
    if (spec.title) { const h = document.createElement("h3"); h.textContent = spec.title; root.append(h); }
    const inputs = [];
    for (const f of spec.fields || []) {
      const label = document.createElement("label");
      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        for (const o of f.options || []) {
          const opt = document.createElement("option");
          opt.value = typeof o === "string" ? o : String(o.value);
          opt.textContent = typeof o === "string" ? o : String(o.label ?? o.value);
          input.append(opt);
        }
      } else if (f.type === "textarea") {
        input = document.createElement("textarea");
      } else {
        input = document.createElement("input");
        input.type = ["number", "date", "checkbox", "email", "url"].includes(f.type) ? f.type : "text";
      }
      input.name = f.name;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.required) input.required = true;
      if (f.value !== undefined) { if (input.type === "checkbox") input.checked = !!f.value; else input.value = String(f.value); }
      if (input.type === "checkbox") { label.className = "aura-check"; label.append(input, document.createTextNode(f.label || f.name)); }
      else { label.append(document.createTextNode(f.label || f.name), input); }
      root.append(label);
      inputs.push([f, input]);
    }
    const values = () => Object.fromEntries(inputs.map(([f, input]) => [f.name,
      input.type === "checkbox" ? input.checked : input.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value]));
    const submit = button(root, spec.submitLabel || "Send", async () => {
      for (const [, input] of inputs) if (!input.reportValidity()) return;
      await spec.onSubmit?.(values());
      if (spec.reset !== false) for (const [f, input] of inputs) {
        if (input.type === "checkbox") input.checked = !!f.value;
        else if (input.tagName === "SELECT" && f.value === undefined) input.selectedIndex = 0;
        else input.value = f.value === undefined ? "" : String(f.value);
      }
    });
    for (const [, input] of inputs) {
      if (input.tagName === "INPUT") input.addEventListener("keydown", (event) => { if (event.key === "Enter") submit.click(); });
    }
    el.append(root);
    return { element: root, values };
  };
  const frame = window.__auraFrame || { language: "en", libraries: {} };
  const api = {
    context: () => call("context.get"),
    // The language the user chose in Localization (ADR 0033); the frame reloads when it changes.
    language: frame.language,
    // ES module libraries load from memory: the frame has no network.
    lib: (path) => {
      if (!(path in frame.libraries)) return Promise.reject(new Error(path + " is not in the app's libraries"));
      return import(URL.createObjectURL(new Blob([frame.libraries[path]], { type: "text/javascript" })));
    },
    storage: Object.freeze({
      get: (key) => call("storage.get", { key }),
      set: (key, value) => call("storage.set", { key, value }),
      delete: (key) => call("storage.set", { key, value: null }),
      keys: () => call("storage.keys"),
    }),
    net: Object.freeze({ fetch: (url, init) => call("net.fetch", { url, ...(init || {}) }) }),
    agents: Object.freeze({ ask: (agent, text, options) => call("agents.ask", { agent, text, ...(options || {}) }) }),
    data: Object.freeze({
      list: (collection, query) => call("data", { op: "list", collection, query: query || {} }),
      count: (collection, query) => call("data", { op: "count", collection, query: query || {} }),
      get: (collection, id) => call("data", { op: "get", collection, id }),
      insert: (collection, record) => call("data", { op: "insert", collection, record }),
      update: (collection, id, patch) => call("data", { op: "update", collection, id, patch }),
      delete: (collection, id) => call("data", { op: "delete", collection, id }),
      schema: (collection) => call("data", { op: "schema", collection }),
      on: (collection, fn) => {
        if (!listeners.has("data.changed")) listeners.set("data.changed", []);
        listeners.get("data.changed").push((p) => { if (p && (p.collection === collection || p.collection === "*")) fn(p); });
      },
    }),
    actions: Object.freeze({ run: (name, input) => call("actions.run", { name, input: input || {} }) }),
    apps: Object.freeze({ call: (app, action, input) => call("apps.call", { app, action, input: input || {} }) }),
    files: Object.freeze({
      list: (path, options) => call("files.list", { path: path || "", ...(options || {}) }),
      read: (path, options) => call("files.read", { path, ...(options || {}) }),
    }),
    docs: Object.freeze({
      pick: (options) => call("docs.pick", options || {}),
      list: () => call("docs.list"),
      put: (name, data) => call("docs.put", { name, ...bytesOrText(data) }),
      read: (id, options) => call("docs.read", { id, as: (options && options.as) || "text" }),
      remove: (id) => call("docs.remove", { id }),
      view: (what) => call("docs.view", typeof what === "string" ? { id: what } : { ...what, ...bytesOrText(what.data) }),
      save: (id) => call("docs.save", { id }),
    }),
    chat: Object.freeze({
      list: () => call("chat.list"),
      messages: (chatId) => call("chat.messages", { chatId }),
      post: (chatId, body) => call("chat.post", { chatId, body }),
    }),
    alerts: Object.freeze({
      recent: () => call("alerts.recent"),
      post: (alert) => call("alerts.post", alert || {}),
    }),
    // Only for the bar app (ui.bar, ADR 0029).
    bar: Object.freeze({
      state: () => call("bar.state"),
      open: (key, where) => call("bar.open", { key, where: where || "here" }),
      menu: (items) => call("bar.menu", { items: items || [] }),
      on: (fn) => {
        if (!listeners.has("bar.state")) listeners.set("bar.state", []);
        listeners.get("bar.state").push(fn);
      },
    }),
    events: Object.freeze({
      on: (name, fn) => {
        if (!listeners.has(name)) { listeners.set(name, []); call("events.subscribe", { name }); }
        listeners.get(name).push(fn);
      },
    }),
    ui: Object.freeze({
      registerPanel: ({ title, render }) => {
        call("ui.setTitle", { title });
        render(document.getElementById("root"));
      },
      form,
      button,
    }),
    __reportError: report,
  };
  // The app kit (themed views bound to collections) is built on the same API.
  api.kit = Object.freeze(window.__auraKit ? window.__auraKit(api, report) : {});
  window.aura = Object.freeze(api);
})();`;

export const FRAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * What every frame gets, built once (ADR 0039): the base styles, the kit and the bridge. Only the
 * app's own code, styles and libraries differ from frame to frame.
 */
const FRAME_STYLE = `<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; font-size: 14px; }
body { margin: 0; padding: 12px; background: transparent; color: var(--foreground, CanvasText); }
.aura-form { display: flex; flex-direction: column; gap: 10px; }
.aura-form h3 { margin: 0; font-size: 15px; }
.aura-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted-foreground, GrayText); }
.aura-form label.aura-check { flex-direction: row; align-items: center; gap: 6px; }
.aura-form input:not([type=checkbox]), .aura-form textarea, .aura-form select {
  font: inherit; font-size: 14px; color: var(--foreground, CanvasText); background: var(--background, Canvas);
  border: 1px solid var(--border, GrayText); border-radius: calc(var(--radius, 8px) - 2px); padding: 6px 8px;
}
.aura-form textarea { min-height: 72px; resize: vertical; }
.aura-button {
  font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; align-self: flex-start;
  color: var(--primary-foreground, Canvas); background: var(--primary, AccentColor);
  border: 0; border-radius: calc(var(--radius, 8px) - 2px); padding: 6px 12px;
}
.aura-button:disabled { opacity: .6; cursor: default; }
.aura-kit-card { background: var(--card, Canvas); border: 1px solid var(--border, GrayText); border-radius: var(--radius, 10px); padding: 12px; margin-bottom: 12px; }
.aura-kit-muted { color: var(--muted-foreground, GrayText); font-size: 12px; }
.aura-kit-bar { display: flex; gap: 8px; margin-bottom: 8px; }
.aura-kit-search { flex: 1; font: inherit; color: inherit; background: var(--background, Canvas); border: 1px solid var(--border, GrayText); border-radius: calc(var(--radius, 8px) - 2px); padding: 5px 8px; }
.aura-kit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.aura-kit-table th { text-align: left; font-weight: 500; color: var(--muted-foreground, GrayText); cursor: pointer; padding: 6px; border-bottom: 1px solid var(--border, GrayText); white-space: nowrap; }
.aura-kit-table td { padding: 6px; border-bottom: 1px solid var(--border, GrayText); vertical-align: top; }
.aura-kit-actions { text-align: right; white-space: nowrap; }
.aura-kit-link { font: inherit; font-size: 12px; background: none; border: 0; color: var(--primary, LinkText); cursor: pointer; padding: 0 4px; }
.aura-kit-danger { color: #e11d48; }
.aura-kit-board { display: flex; gap: 10px; overflow-x: auto; align-items: flex-start; }
.aura-kit-column { flex: 0 0 220px; background: var(--muted, Canvas); border-radius: var(--radius, 10px); padding: 8px; min-height: 80px; }
.aura-kit-column.aura-kit-over { outline: 2px dashed var(--primary, AccentColor); }
.aura-kit-column-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--muted-foreground, GrayText); }
.aura-kit-item { background: var(--card, Canvas); border: 1px solid var(--border, GrayText); border-radius: calc(var(--radius, 8px) - 2px); padding: 8px; margin-bottom: 6px; cursor: grab; }
.aura-kit-item-title { font-weight: 600; font-size: 13px; }
.aura-kit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.aura-kit-tile { margin: 0; }
.aura-kit-body { margin: 6px 0; font-size: 13px; white-space: pre-wrap; }
.aura-kit-tag { display: inline-block; font-size: 11px; border: 1px solid var(--border, GrayText); border-radius: 999px; padding: 1px 8px; margin-right: 6px; }
.aura-kit-chart-row { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; align-items: center; margin: 4px 0; font-size: 12px; }
.aura-kit-chart-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aura-kit-chart-bar { height: 10px; border-radius: 999px; background: var(--primary, AccentColor); }
.aura-kit-stat { min-width: 120px; flex: 1; }
.aura-kit-stat-value { font-size: 24px; font-weight: 600; }
.aura-kit-row { display: flex; gap: 10px; flex-wrap: wrap; }
.aura-kit-row > * { flex: 1; }
.aura-kit-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border, GrayText); }
.aura-kit-tab { font: inherit; font-size: 13px; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 10px; cursor: pointer; color: var(--muted-foreground, GrayText); }
.aura-kit-tab.aura-kit-active { color: var(--foreground, CanvasText); border-bottom-color: var(--primary, AccentColor); }
</style>`;
const FRAME_RUNTIME = `<script>${inert(KIT)}</script>\n<script>${inert(BRIDGE)}</script>`;
