/// <reference path="../../../providers/vendor-files.d.ts" />
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_ID_PATTERN, BAR_APP_ID, type Chat, MAX_APP_DESCRIPTION, slugify } from "@aura/shared";
import { commitAll, git } from "../../../lib/git";
import { errorMessage, log } from "../../../lib/log";
import type { ProjectInfo, ProjectService } from "../../chats/projects/service";
import type { AgentDirectory } from "../../helpers/agents/directory";
import { type AgentProfile, ORCHESTRATOR_HANDLE } from "../../helpers/agents/profiles";
import { bulletsOf, INVALID_MANIFEST, MORE_PERMISSIONS } from "../../system/approvals/plain";
import type { ApprovalService } from "../../system/approvals/service";
import type { EventHub } from "../../system/realtime/hub";
import type { AppSource, ExtensionService } from "../customize/extensions";
import { describeManifest, validateManifest } from "../customize/extensions";
import { EXTENSION_GUIDE } from "../customize/tools";
import barMain from "./bar/main.js.txt" with { type: "text" };
import barReadme from "./bar/README.md" with { type: "text" };
import barStyles from "./bar/styles.css" with { type: "text" };

export class AppError extends Error {
  override name = "AppError";
}

export const BUILDER_HANDLE = "builder";

/** The branch with the author's versions of an app installed from a pack. */
const UPSTREAM = "upstream";
/** The files a pack manages in an app. */
const PACK_FILES = ["manifest.json", "main.js", "styles.css"];

/** The agent that writes and changes apps in their chats; created with the first app. */
export const BUILDER_DEFAULT: AgentProfile = {
  handle: BUILDER_HANDLE,
  name: "Builder",
  role: "Builds and changes Aura apps in their chats",
  engine: null,
  model: null,
  builtinTools: ["Read", "Write", "Edit", "Glob", "Grep"],
  budgetUsd: null,
  skills: [],
  systemPrompt: [
    "You build and change one Aura app: a small web app that runs in a sandboxed frame inside Aura.",
    "You work in the app's folder: manifest.json, main.js (and styles.css). Read them before you change them.",
    'Your changes do not go live by themselves: after your reply the user sees them on an approval card, and the app reloads when they approve. Say in one sentence why, then list what changes as short bullet points in plain words in the user\'s language ("- A new Email column in the clients table"); they become the card\'s "What will change". Do not paste the code: the diff is on the card\'s technical details.',
    "When the app needs a library (charts, dates, markdown, maps…), add it with add_library instead of writing it yourself or loading it from a URL.",
    "Keep changes small and focused on what the user asked. Keep the app's permissions, hosts and secrets in manifest.json to what it needs, and say so when you add one.",
    "When the app needs a key or a token, list only its NAME in the manifest's secrets (like SERVICE_API_KEY) and tell the user to enter the value with the key button on the app's tile. Never ask for the value in the chat and never write one into a file.",
    "If the user asks to use the app (add a record, look something up), and you cannot do it from its files, say what is missing.",
    "",
    "App API (manifest permissions in brackets):",
    EXTENSION_GUIDE,
  ].join("\n"),
};

const MAX_DIFF = 12_000;

/** A new app's first files: an empty panel that says how to build it. */
function scaffold(id: string, name: string, description: string): Record<string, string> {
  // The launcher shows one line; @builder refines it as the app takes shape.
  const line = description.split("\n")[0]?.trim().slice(0, MAX_APP_DESCRIPTION) ?? "";
  const manifest = {
    id,
    name,
    version: "0.1.0",
    minAppVersion: "0.23.0",
    permissions: ["ui.panel", "storage"],
    author: "you",
    icon: "blocks",
    ...(line ? { description: line } : {}),
  };
  return {
    // An app's data (the "files" store) is not part of its code versions.
    ".gitignore": "node_modules/\n.env\ndata/\n",
    "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "main.js": `export default function activate(ctx) {
  ctx.ui.registerPanel({
    title: ${JSON.stringify(name)},
    render(el) {
      const title = document.createElement("h2");
      title.textContent = ${JSON.stringify(name)};
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "This app is empty. Say in its chat what it should do, and @builder makes it.";
      el.append(title, hint);
    },
  });
}
`,
    "styles.css": ".hint { color: var(--muted-foreground); }\n",
  };
}

/** The bar app's first files (ADR 0029): the same bar as the built-in one, now the user's code. */
function barFiles(): Record<string, string> {
  const manifest = {
    id: BAR_APP_ID,
    name: "Bar",
    version: "0.1.0",
    minAppVersion: "0.31.0",
    permissions: ["ui.bar", "storage"],
    author: "you",
    description: "Aura's bar: your apps, the screen and the status, as your own code.",
    group: "System",
  };
  return {
    "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "main.js": barMain,
    "styles.css": barStyles,
    "README.md": barReadme,
  };
}

/**
 * Apps built in Aura (ADR 0024): a project whose workspace is the app's code, with a chat where
 * agents change it. The app runs its last approved commit; agents' edits wait as a draft until the
 * user approves the diff, and every version can be restored.
 */
export class AppService {
  private cache: AppSource[] = [];

  constructor(
    private readonly deps: {
      projects: ProjectService;
      extensions: () => ExtensionService;
      approvals: ApprovalService;
      agents: AgentDirectory;
      hub: EventHub;
      dataDir: string;
    },
  ) {
    deps.approvals.register("app_create", async (payload) => {
      const { project } = await this.create({
        name: String(payload.name ?? ""),
        id: typeof payload.id === "string" ? payload.id : undefined,
        description: String(payload.description ?? ""),
      });
      return `Created the app ${project.name}. It opens next to its chat.`;
    });
    deps.approvals.register("app_change", async (payload, ctx) =>
      this.apply(payload, ctx.requestedBy),
    );
    deps.approvals.onReject("app_change", async (payload) => {
      // Rejecting a change discards it, unless the agent has changed more since the card.
      const app = this.source(String(payload.app));
      if (app && (await treeOf(app.dir)) === payload.tree) await discardDraft(app.dir);
    });
  }

  /** Apps known to the extension service (refreshed on start and when an app is created). */
  sources(): AppSource[] {
    return this.cache;
  }

  async load(): Promise<void> {
    this.cache = (await this.deps.projects.list())
      .filter((p) => p.kind === "app")
      .map((p) => ({ id: p.id, dir: p.workspace, chatId: p.chatId }));
  }

  isApp(id: string): boolean {
    return this.cache.some((a) => a.id === id);
  }

  private source(id: string): AppSource | undefined {
    return this.cache.find((a) => a.id === id);
  }

  private mustSource(id: string): AppSource {
    const app = this.source(id);
    if (!app) throw new AppError(`No app "${id}"`);
    return app;
  }

  /** User action (or an approved request): a new app with its chat and @builder. */
  async create(input: {
    name: string;
    id?: string;
    description?: string;
    /** The app's code from a pack (phase 27) instead of the empty scaffold. */
    files?: Record<string, string>;
    /** The first message of its chat, instead of the usual one. */
    brief?: string;
  }): Promise<{ project: ProjectInfo; chat: Chat }> {
    const name = input.name.trim();
    if (!name || name.length > 60) throw new AppError("name is required (max 60 chars)");
    const id = input.id?.trim() || slugify(name);
    if (!APP_ID_PATTERN.test(id))
      throw new AppError("the app id needs 2-48 lowercase latin letters, digits or dashes");
    if ((await this.deps.extensions().list()).some((e) => e.id === id))
      throw new AppError(`There is an app or extension "${id}" already`);
    await this.ensureBuilder();
    const description = input.description?.trim() ?? "";
    const { project, chat } = await this.deps.projects.create({
      name,
      slug: id,
      kind: "app",
      files: { ...scaffold(id, name, description), ...(input.files ?? {}) },
      agents: [BUILDER_HANDLE],
      brief: input.brief
        ? input.brief
        : description
          ? `@${BUILDER_HANDLE} Build this app: ${description}`
          : `@${BUILDER_HANDLE} This is the chat of the app "${name}". Wait for the user to say what it should do.`,
      kickoff: description.length > 0,
    });
    await this.load();
    // The author's line of versions, which later updates are merged from (phase 27).
    await git(project.workspace, ["branch", UPSTREAM]);
    // The user created it (or approved the pack): it runs with what its manifest asks for.
    await this.deps.extensions().regrant(id);
    return { project, chat };
  }

  /**
   * The bar app (ADR 0029), created with the built-in bar's look the first time the user (or the
   * orchestrator) wants a bar of their own. Returns its chat.
   */
  async ensureBar(): Promise<{ id: string; chatId: string; created: boolean }> {
    const existing = this.source(BAR_APP_ID);
    if (existing) return { id: existing.id, chatId: existing.chatId, created: false };
    const { chat } = await this.create({
      name: "Bar",
      id: BAR_APP_ID,
      files: barFiles(),
      brief: `@${BUILDER_HANDLE} This is the chat of Aura's bar, the strip on the edge of the screen with the apps and the status. Its code is in this folder; README.md describes ctx.bar. Wait for the user to say how to change it.`,
    });
    return { id: BAR_APP_ID, chatId: chat.id, created: true };
  }

  private async ensureBuilder(): Promise<void> {
    if (await this.deps.agents.get(BUILDER_HANDLE)) return;
    await this.deps.agents.create(BUILDER_DEFAULT);
    await commitAll(
      this.deps.dataDir,
      `agents(@${BUILDER_HANDLE}): add`,
      ORCHESTRATOR_HANDLE,
    ).catch((error: unknown) => log.warn("builder commit failed", { error: errorMessage(error) }));
  }

  /**
   * After a run in an app's chat: if the agent changed files, the user gets the diff on an
   * approval card. Nothing goes live until they approve.
   */
  async afterRun(
    project: ProjectInfo,
    run: { handle: string; chatId: string; topicId: string | null; summary: string },
  ): Promise<void> {
    const app = this.source(project.id);
    if (!app) return;
    const status = await git(app.dir, ["status", "--porcelain"]);
    if (!status) return;
    const tree = await treeOf(app.dir);
    const pending = (await this.deps.approvals.listPending()).some(
      (a) => a.kind === "app_change" && a.payload.app === app.id && a.payload.tree === tree,
    );
    if (pending) return;
    const stat = await git(app.dir, ["diff", "--cached", "--stat", "HEAD"]);
    // Library files are listed, not shown line by line (ADR 0033).
    const full = await git(app.dir, ["diff", "--cached", "HEAD", "--", ".", ":(exclude)lib"]);
    const diff =
      full.length > MAX_DIFF
        ? `${full.slice(0, MAX_DIFF)}\n… ${full.length - MAX_DIFF} more`
        : full;
    const note = await this.permissionNote(app);
    // The builder's reply: its bullet list is what changes, the rest says why (ADR 0034).
    const changes = bulletsOf(run.summary);
    const why = changes.length
      ? run.summary
          .split("\n")
          .filter((line) => !/^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
          .join("\n")
          .trim()
      : run.summary;
    await this.deps.approvals.request({
      kind: "app_change",
      requestedBy: run.handle,
      chatId: run.chatId,
      topicId: run.topicId,
      title: `Change ${project.name}`,
      why,
      changes,
      warning:
        note.length === 0
          ? null
          : note[0]?.includes("not valid")
            ? INVALID_MANIFEST
            : MORE_PERMISSIONS,
      preview: [...note, "```", stat, "```", "", "```diff", diff, "```"].join("\n"),
      payload: { app: app.id, tree, summary: run.summary.slice(0, 200) },
    });
    // Clients show the app's draft (preview, discard).
    this.deps.hub.publish({ type: "customize.updated" });
  }

  /** Warns on the card when a change asks for more than the app has now. */
  private async permissionNote(app: AppSource): Promise<string[]> {
    try {
      const before = validateManifest(
        JSON.parse(await git(app.dir, ["show", "HEAD:manifest.json"])),
        app.id,
      );
      const after = validateManifest(
        JSON.parse(await Bun.file(`${app.dir}/manifest.json`).text()),
        app.id,
      );
      const was = new Set(describeManifest(before));
      const added = describeManifest(after).filter((line) => !was.has(line));
      return added.length > 0 ? ["**⚠️ It asks for more:**", ...added, ""] : [];
    } catch (error) {
      return [`**⚠️ manifest.json is not valid now:** ${errorMessage(error)}`, ""];
    }
  }

  private async apply(payload: Record<string, unknown>, author: string): Promise<string> {
    const app = this.mustSource(String(payload.app));
    if ((await treeOf(app.dir)) !== payload.tree)
      throw new AppError(
        "The app changed since this card; the newer change is on its own card (or ask again).",
      );
    validateManifest(JSON.parse(await Bun.file(`${app.dir}/manifest.json`).text()), app.id);
    const summary = String(payload.summary ?? "").split("\n")[0] || "change the app";
    const hash = await commitAll(app.dir, `${author}: ${summary}`, author);
    await this.deps.extensions().regrant(app.id);
    return `Applied as version ${hash ?? "(no change)"}; the app reloaded.`;
  }

  /** The app's versions, newest first. */
  async history(
    id: string,
  ): Promise<{ hash: string; author: string; at: string; subject: string }[]> {
    const app = this.mustSource(id);
    const out = await git(app.dir, ["log", "-n", "50", "--format=%h%x09%an%x09%aI%x09%s"]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash = "", author = "", at = "", ...rest] = line.split("\t");
        return { hash, author, at, subject: rest.join("\t") };
      });
  }

  /** User action: the app goes back to a version, as a new commit (so it can be undone too). */
  async restore(id: string, hash: string): Promise<string> {
    const app = this.mustSource(id);
    if (!/^[0-9a-f]{4,40}$/.test(hash)) throw new AppError("not a version");
    await git(app.dir, ["cat-file", "-e", `${hash}^{commit}`]).catch(() => {
      throw new AppError(`No version ${hash}`);
    });
    await discardDraft(app.dir);
    await git(app.dir, ["restore", `--source=${hash}`, "--staged", "--worktree", ":/"]);
    const commit = await commitAll(app.dir, `revert: back to ${hash}`, "owner");
    await this.deps.extensions().regrant(id);
    return commit ?? hash;
  }

  /**
   * Installs an app from a pack, or updates one installed before (phase 27). An update is the
   * author's new version on the `upstream` branch, merged into the user's: their changes stay,
   * and where both changed the same lines the author's version wins (versions can restore).
   */
  async installFromPack(
    id: string,
    files: Record<string, string>,
    pack: { id: string; version: string },
  ): Promise<string> {
    const manifest = JSON.parse(files["manifest.json"] ?? "{}") as { name?: unknown };
    const name = typeof manifest.name === "string" ? manifest.name : id;
    if (!this.isApp(id)) {
      await this.create({ name, id, files });
      return `app ${name}`;
    }
    const app = this.mustSource(id);
    if ((await git(app.dir, ["status", "--porcelain"])).length > 0)
      throw new AppError(
        `${name} has a change waiting for approval; approve or discard it before updating`,
      );
    const tmp = join(tmpdir(), `aura-upstream-${id}-${Bun.randomUUIDv7()}`);
    let hadUpstream = true;
    await git(app.dir, ["rev-parse", "--verify", UPSTREAM]).catch(() => {
      hadUpstream = false;
    });
    // An app made in Aura and later published: its first version is the base.
    if (!hadUpstream) await git(app.dir, ["branch", UPSTREAM, "HEAD"]);
    try {
      await git(app.dir, ["worktree", "add", "-q", tmp, UPSTREAM]);
      for (const name of PACK_FILES) {
        const target = join(tmp, name);
        if (name in files) writeFileSync(target, files[name] ?? "");
        else if (existsSync(target)) rmSync(target);
      }
      await commitAll(tmp, `upstream: ${pack.id} ${pack.version}`, "author");
    } finally {
      await git(app.dir, ["worktree", "remove", "--force", tmp]).catch(() => {});
    }
    const before = await git(app.dir, ["rev-parse", "HEAD"]);
    try {
      await git(app.dir, [
        "merge",
        "--no-edit",
        "-X",
        "theirs",
        "-m",
        `update: ${pack.id} ${pack.version}`,
        UPSTREAM,
      ]);
    } catch (error) {
      await git(app.dir, ["merge", "--abort"]).catch(() => {});
      throw new AppError(`Could not merge the update into ${name}: ${errorMessage(error)}`);
    }
    const changed = await git(app.dir, ["diff", "--name-only", before, "HEAD"]);
    await this.deps.extensions().regrant(id);
    return changed
      ? `app ${name} updated (${changed.split("\n").join(", ")}; your own changes kept)`
      : `app ${name} (already up to date)`;
  }

  /** User action: throws away changes waiting for approval. */
  async discard(id: string): Promise<void> {
    await discardDraft(this.mustSource(id).dir);
    this.deps.hub.publish({ type: "customize.updated" });
  }
}

/** The tree an approval refers to: everything in the working copy, staged. */
async function treeOf(dir: string): Promise<string> {
  await git(dir, ["add", "-A"]);
  return git(dir, ["write-tree"]);
}

async function discardDraft(dir: string): Promise<void> {
  await git(dir, ["reset", "-q", "--hard", "HEAD"]);
  await git(dir, ["clean", "-fdq"]);
}
