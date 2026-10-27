import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionInfo, ExtensionPermission } from "@aura/shared";
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
};

const ID = /^[a-z][a-z0-9-]{1,47}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const MAX_CODE = 200_000;
export const ERROR_LIMIT = 3;

export interface Manifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  permissions: ExtensionPermission[];
  author: string;
  mobile?: boolean;
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
  return {
    id: m.id,
    name: m.name.trim(),
    version: m.version,
    minAppVersion: m.minAppVersion,
    permissions: [...new Set(m.permissions as ExtensionPermission[])],
    author: m.author.trim(),
    mobile: m.mobile === true,
  };
}

interface State {
  enabled: boolean;
  granted: ExtensionPermission[];
  errors: number;
}

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
      errors: Number(row?.errors ?? 0),
    };
  }

  private async saveState(id: string, version: string, state: State): Promise<void> {
    await this.deps.db
      .query(
        "UPSERT $id CONTENT { version: $version, enabled: $enabled, granted_permissions: $granted, errors: $errors }",
        {
          id: new RecordId("extension_state", id),
          version,
          enabled: state.enabled,
          granted: state.granted,
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
        ...m,
        enabled: state.enabled && !problem,
        permissions: state.enabled ? state.granted : m.permissions,
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
      granted: enabled ? manifest.permissions : [],
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

  async propose(
    input: { manifest: unknown; mainJs: string; stylesCss?: string },
    by: { requestedBy: string; chatId: string; why: string },
  ): Promise<ApprovalRecord> {
    const manifest = validateManifest(input.manifest);
    if (!input.mainJs.trim() || input.mainJs.length > MAX_CODE)
      throw new ExtensionError("main.js is required (max 200 KB)");
    if (!/export\s+default/.test(input.mainJs))
      throw new ExtensionError("main.js must `export default function activate(ctx)`");
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
        ...manifest.permissions.map((p) => `- \`${p}\`: ${PERMISSIONS[p]}`),
        manifest.permissions.length === 0 ? "- nothing" : "",
        "",
        "It runs sandboxed: no network, no access to the app except these permissions.",
        "",
        "**main.js**",
        `\`\`\`js\n${code}\n\`\`\``,
      ].join("\n"),
      payload: { manifest, mainJs: input.mainJs, stylesCss: input.stylesCss ?? "" },
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
      granted: manifest.permissions,
      errors: 0,
    });
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
  window.aura = Object.freeze({
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
    }),
    __reportError: report,
  });
})();`;

export const FRAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
