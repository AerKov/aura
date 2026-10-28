import { APP_ID_PATTERN, type Chat, slugify } from "@aura/shared";
import { commitAll, git } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import type { AgentDirectory } from "../agents/directory";
import { type AgentProfile, ORCHESTRATOR_HANDLE } from "../agents/profiles";
import type { ApprovalService } from "../approvals/service";
import type { AppSource, ExtensionService } from "../customize/extensions";
import { describeManifest, validateManifest } from "../customize/extensions";
import { EXTENSION_GUIDE } from "../customize/tools";
import type { ProjectInfo, ProjectService } from "../projects/service";
import type { EventHub } from "../realtime/hub";

export class AppError extends Error {
  override name = "AppError";
}

export const BUILDER_HANDLE = "builder";

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
    "Your changes do not go live by themselves: after your reply the user sees them as a diff on an approval card, and the app reloads when they approve. Say in one or two sentences what you changed and why; do not paste the code.",
    "Keep changes small and focused on what the user asked. Keep the app's permissions, hosts and secrets in manifest.json to what it needs, and say so when you add one.",
    "If the user asks to use the app (add a record, look something up), and you cannot do it from its files, say what is missing.",
    "",
    "App API (manifest permissions in brackets):",
    EXTENSION_GUIDE,
  ].join("\n"),
};

const MAX_DIFF = 12_000;

/** A new app's first files: an empty panel that says how to build it. */
function scaffold(id: string, name: string): Record<string, string> {
  const manifest = {
    id,
    name,
    version: "0.1.0",
    minAppVersion: "0.23.0",
    permissions: ["ui.panel", "storage"],
    author: "you",
    icon: "blocks",
  };
  return {
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
      files: scaffold(id, name),
      agents: [BUILDER_HANDLE],
      brief: description
        ? `@${BUILDER_HANDLE} Build this app: ${description}`
        : `@${BUILDER_HANDLE} This is the chat of the app "${name}". Wait for the user to say what it should do.`,
      kickoff: description.length > 0,
    });
    await this.load();
    // The user created it: it runs with what its scaffold asks for (a panel and its own data).
    await this.deps.extensions().regrant(id);
    return { project, chat };
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
    const full = await git(app.dir, ["diff", "--cached", "HEAD"]);
    const diff =
      full.length > MAX_DIFF
        ? `${full.slice(0, MAX_DIFF)}\n… ${full.length - MAX_DIFF} more`
        : full;
    await this.deps.approvals.request({
      kind: "app_change",
      requestedBy: run.handle,
      chatId: run.chatId,
      topicId: run.topicId,
      title: `Change ${project.name}`,
      why: run.summary,
      preview: [
        ...(await this.permissionNote(app)),
        "```",
        stat,
        "```",
        "",
        "```diff",
        diff,
        "```",
      ].join("\n"),
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
