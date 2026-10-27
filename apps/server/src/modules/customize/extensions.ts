import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXTENSION_ICONS,
  type ExtensionIcon,
  type ExtensionInfo,
  type ExtensionPermission,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { commitAll } from "../../lib/git";
import type { ApprovalRecord, ApprovalService } from "../approvals/service";
import type { EventHub } from "../realtime/hub";

export class ExtensionError extends Error {
  override name = "ExtensionError";
}

export const PERMISSIONS: Record<ExtensionPermission, string> = {
  "chat.read": "Read chats and messages",
  "chat.write": "Post messages (as the extension)",
  "ui.panel": "Show a panel in the app",
  "alerts.read": "Read alerts",
  storage: "Keep its own data",
  net: "Reach the listed hosts (through Aura)",
  "agents.ask": "Ask agents for you (as your message, within budgets)",
  "files.read": "Read project files",
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
  /** Hosts `net` may reach. */
  hosts?: string[];
  /** Stored secrets the server may substitute into its requests. */
  secrets?: string[];
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
  if (m.icon !== undefined && !(EXTENSION_ICONS as readonly unknown[]).includes(m.icon))
    throw new ExtensionError(`icon must be one of ${EXTENSION_ICONS.join(", ")}`);
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
  return {
    id: m.id,
    name: m.name.trim(),
    version: m.version,
    minAppVersion: m.minAppVersion,
    permissions,
    author: m.author.trim(),
    mobile: m.mobile === true,
    ...(m.icon ? { icon: m.icon as ExtensionIcon } : {}),
    ...(hosts.length ? { hosts: [...new Set(hosts)] } : {}),
    ...(secrets.length ? { secrets: [...new Set(secrets)] } : {}),
  };
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
  ].filter(Boolean);
}

interface State {
  enabled: boolean;
  granted: ExtensionPermission[];
  /** Hosts and secrets granted with the permissions; a later manifest edit does not widen them. */
  hosts: string[];
  secrets: string[];
  errors: number;
}

const grants = (m: Manifest) => ({
  granted: m.permissions,
  hosts: m.hosts ?? [],
  secrets: m.secrets ?? [],
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
      /** Project apps (ADR 0021): checks a project and pins an extension to it. */
      projectExists?: (project: string) => Promise<boolean>;
      bindProject?: (project: string, extensionId: string) => Promise<void>;
    },
  ) {
    deps.approvals.register("extension_install", async (payload, ctx) =>
      this.install(payload, ctx.requestedBy),
    );
  }

  private dirOf(id: string): string {
    return join(this.deps.dataDir, "extensions", id);
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
      errors: Number(row?.errors ?? 0),
    };
  }

  private async saveState(id: string, version: string, state: State): Promise<void> {
    await this.deps.db
      .query(
        "UPSERT $id CONTENT { version: $version, enabled: $enabled, granted_permissions: $granted, granted_hosts: $hosts, granted_secrets: $secrets, errors: $errors }",
        {
          id: new RecordId("extension_state", id),
          version,
          enabled: state.enabled,
          granted: state.granted,
          hosts: state.hosts,
          secrets: state.secrets,
          errors: state.errors,
        },
      )
      .collect();
    this.deps.hub.publish({ type: "customize.updated" });
  }

  private readManifest(id: string): Manifest {
    const file = join(this.dirOf(id), "manifest.json");
    if (!existsSync(file)) throw new ExtensionError("manifest.json is missing");
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      throw new ExtensionError("manifest.json is not valid JSON");
    }
    return validateManifest(parsed, id);
  }

  async list(): Promise<ExtensionInfo[]> {
    const root = join(this.deps.dataDir, "extensions");
    if (!existsSync(root)) return [];
    const ids = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && ID.test(e.name))
      .map((e) => e.name)
      .sort();
    return Promise.all(ids.map((id) => this.info(id)));
  }

  async info(id: string): Promise<ExtensionInfo> {
    const state = await this.state(id);
    try {
      const m = this.readManifest(id);
      const problem =
        compareVersions(m.minAppVersion, this.deps.appVersion) > 0
          ? `needs app ${m.minAppVersion} or newer (this is ${this.deps.appVersion})`
          : !existsSync(join(this.dirOf(id), "main.js"))
            ? "main.js is missing"
            : null;
      return {
        id: m.id,
        name: m.name,
        version: m.version,
        minAppVersion: m.minAppVersion,
        author: m.author,
        icon: m.icon ?? null,
        enabled: state.enabled && !problem,
        permissions: state.enabled ? state.granted : m.permissions,
        hosts: state.enabled ? state.hosts : (m.hosts ?? []),
        secrets: state.enabled ? state.secrets : (m.secrets ?? []),
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
        icon: null,
        hosts: [],
        secrets: [],
        enabled: false,
        problem: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** User action: removes the extension's files (one commit, so it can be restored) and its state. */
  async remove(id: string, author = "owner"): Promise<void> {
    if (!ID.test(id) || !existsSync(this.dirOf(id)))
      throw new ExtensionError(`No extension "${id}"`);
    rmSync(this.dirOf(id), { recursive: true, force: true });
    await this.deps.db.query("DELETE $id", { id: new RecordId("extension_state", id) }).collect();
    await commitAll(this.deps.dataDir, `extensions(${id}): remove`, author);
    this.deps.hub.publish({ type: "customize.updated" });
  }

  /** User action: enabling grants exactly the permissions the manifest requests (shown before). */
  async setEnabled(id: string, enabled: boolean): Promise<ExtensionInfo> {
    const manifest = this.readManifest(id);
    await this.saveState(id, manifest.version, {
      enabled,
      ...(enabled ? grants(manifest) : { granted: [], hosts: [], secrets: [] }),
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
    const manifest = this.readManifest(id);
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
  ): Promise<{ hosts: string[]; secrets: string[] } | null> {
    if (this.deps.safeMode() || !ID.test(id)) return null;
    const info = await this.info(id);
    if (!info.enabled || !info.permissions.includes(permission)) return null;
    return { hosts: info.hosts, secrets: info.secrets };
  }

  async propose(
    input: { manifest: unknown; mainJs: string; stylesCss?: string; project?: string },
    by: { requestedBy: string; chatId: string; why: string },
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
    if (typeof payload.project === "string" && payload.project) {
      await this.deps.bindProject?.(payload.project, manifest.id);
      return `Installed and enabled "${manifest.name}" as the app of project ${payload.project}.`;
    }
    return `Installed and enabled "${manifest.name}".`;
  }

  /** HTML of the sandboxed frame, or null when the extension may not run. */
  async frame(id: string): Promise<string | null> {
    if (this.deps.safeMode()) return null;
    const info = await this.info(id);
    if (!info.enabled) return null;
    const main = readFileSync(join(this.dirOf(id), "main.js"), "utf8");
    const stylesFile = join(this.dirOf(id), "styles.css");
    const styles = existsSync(stylesFile) ? readFileSync(stylesFile, "utf8") : "";
    return frameHtml(info, main, styles);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Escapes text for use inside a <script> or <style> element. */
function inert(text: string): string {
  return text.replace(/<\/(script|style)/gi, "<\\/$1");
}

function frameHtml(info: ExtensionInfo, main: string, styles: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(info.name)}</title>
<style>
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
</style>
<style>${inert(styles)}</style>
<script>${inert(BRIDGE)}</script>
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
  const report = (error) => parent.postMessage({ aura: 1, method: "error", params: { message: String(error && error.message || error) } }, "*");
  addEventListener("error", (event) => report(event.error || event.message));
  addEventListener("unhandledrejection", (event) => report(event.reason));
  // Themed controls for agents' forms and buttons. No <form> submit: sandboxed frames cannot submit.
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
  window.aura = Object.freeze({
    context: () => call("context.get"),
    storage: Object.freeze({
      get: (key) => call("storage.get", { key }),
      set: (key, value) => call("storage.set", { key, value }),
      delete: (key) => call("storage.set", { key, value: null }),
      keys: () => call("storage.keys"),
    }),
    net: Object.freeze({ fetch: (url, init) => call("net.fetch", { url, ...(init || {}) }) }),
    agents: Object.freeze({ ask: (agent, text, options) => call("agents.ask", { agent, text, ...(options || {}) }) }),
    files: Object.freeze({
      list: (path, options) => call("files.list", { path: path || "", ...(options || {}) }),
      read: (path, options) => call("files.read", { path, ...(options || {}) }),
    }),
    chat: Object.freeze({
      list: () => call("chat.list"),
      messages: (chatId) => call("chat.messages", { chatId }),
      post: (chatId, body) => call("chat.post", { chatId, body }),
    }),
    alerts: Object.freeze({ recent: () => call("alerts.recent") }),
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
  });
})();`;

export const FRAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
