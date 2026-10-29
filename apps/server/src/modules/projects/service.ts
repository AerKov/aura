import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  budgetText,
  type Chat,
  type Project,
  type ProjectKind,
  parseMentions,
  SLUG_PATTERN,
  slugify,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { isoOf, keyOf } from "../../db/convert";
import { timeStamp } from "../../lib/files";
import { commitAll, ensureRepo } from "../../lib/git";
import type { AgentDirectory } from "../agents/directory";
import { ORCHESTRATOR_HANDLE, validTokens } from "../agents/profiles";
import type { RunRepo } from "../agents/runs";
import { type ChatRepo, OWNER_ID } from "../chat/repo";
import type { ChatService } from "../chat/service";

export class ProjectError extends Error {
  override name = "ProjectError";
}

export interface ProjectInfo extends Project {
  workspace: string;
  /** Where an app keeps its data (ADR 0024); config, so it lives here, not the data itself. */
  dataStore: "database" | "files";
}

export interface ProjectInput {
  name: string;
  slug?: string;
  brief: string;
  agents: string[];
  /** Limits; absent or null means none (ADR 0023). */
  budgetUsd?: number | null;
  budgetTokens?: number | null;
  /** The agent the kickoff wakes; defaults to the first agent mentioned in the brief. */
  startWith?: string;
  /** "app": an app's code (ADR 0024). */
  kind?: ProjectKind;
  /** Files written into the new workspace before its first commit (an app's scaffold). */
  files?: Record<string, string>;
  /** Post the brief and wake the starting agent (default true). */
  kickoff?: boolean;
}

export interface ValidProject {
  name: string;
  slug: string;
  brief: string;
  agents: string[];
  startWith: string;
  budgetUsd: number | null;
  budgetTokens: number | null;
}

/** Checks a pair of limits (null = none); shared by creation and later changes. */
export function validBudget(input: { usd?: number | null; tokens?: number | null }): {
  usd: number | null;
  tokens: number | null;
} {
  const usd = input.usd ?? null;
  if (usd !== null && (!Number.isFinite(usd) || usd <= 0 || usd > 1000))
    throw new ProjectError("budget must be a positive number of USD (max 1000)");
  const tokens = validTokens(input.tokens, (m) => new ProjectError(m));
  return { usd, tokens };
}

type Row = Record<string, unknown>;

/** Projects: a group chat, a git workspace and a budget (docs/SPEC.md section 2). */
export class ProjectService {
  constructor(
    private readonly deps: {
      db: Surreal;
      dataDir: string;
      chat: ChatService;
      repo: ChatRepo;
      runs: RunRepo;
      agents: AgentDirectory;
      /** Called after a user-facing project setting changed (to refresh clients). */
      onChange?: (project: Project) => void;
    },
  ) {}

  workspaceOf(slug: string): string {
    return join(this.deps.dataDir, "projects", slug);
  }

  async get(slug: string): Promise<ProjectInfo | null> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM project WHERE id = $id", { id: new RecordId("project", slug) })
      .collect();
    const row = rows?.[0];
    return row ? this.toProject(row) : null;
  }

  async list(): Promise<ProjectInfo[]> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM project ORDER BY created_at DESC")
      .collect();
    return Promise.all((rows ?? []).map((row) => this.toProject(row)));
  }

  /**
   * Validates a project request without side effects. `pendingAgents` are agents that will be
   * created together with the project (one approval for the whole plan).
   */
  async validate(input: ProjectInput, pendingAgents: string[] = []): Promise<ValidProject> {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new ProjectError("name is required (max 80 chars)");
    const slug = input.slug?.trim() || slugify(name);
    if (!SLUG_PATTERN.test(slug)) {
      throw new ProjectError(
        "slug must be 2-48 chars of lowercase latin letters, digits and dashes",
      );
    }
    const budget = validBudget({ usd: input.budgetUsd, tokens: input.budgetTokens });
    const brief = input.brief.trim();
    if (!brief || brief.length > 8000) throw new ProjectError("brief is required (max 8000 chars)");

    const agents = [...new Set(input.agents.map((a) => a.replace(/^@/, "")))].filter(
      (h) => h !== ORCHESTRATOR_HANDLE,
    );
    if (agents.length === 0) throw new ProjectError("a project needs at least one agent");
    for (const handle of agents) {
      if (!pendingAgents.includes(handle) && !(await this.deps.agents.get(handle))) {
        throw new ProjectError(`@${handle} does not exist; create it first`);
      }
    }
    const mentioned = parseMentions(brief).filter((h) => agents.includes(h));
    if (mentioned.length === 0) {
      throw new ProjectError("the brief must @mention the agent who starts the work");
    }
    const startWith = input.startWith?.replace(/^@/, "") ?? mentioned[0];
    if (!startWith || !agents.includes(startWith)) {
      throw new ProjectError("start_with must be one of the project's agents");
    }
    if ((await this.get(slug)) || existsSync(this.workspaceOf(slug))) {
      throw new ProjectError(`a project "${slug}" already exists`);
    }
    return {
      name,
      slug,
      brief,
      agents,
      startWith,
      budgetUsd: budget.usd,
      budgetTokens: budget.tokens,
    };
  }

  async create(input: ProjectInput): Promise<{ project: ProjectInfo; chat: Chat }> {
    const { name, slug, brief, agents, startWith, budgetUsd, budgetTokens } =
      await this.validate(input);

    // Workspace first: a git repo with the brief, so every agent change is a reversible commit.
    const workspace = this.workspaceOf(slug);
    await ensureRepo(workspace, "node_modules/\n.env\n");
    writeFileSync(join(workspace, "BRIEF.md"), `# ${name}\n\n${brief}\n`);
    for (const [file, content] of Object.entries(input.files ?? {}))
      writeFileSync(join(workspace, file), content);
    await commitAll(
      workspace,
      input.kind === "app" ? "feat: start the app" : "docs: add project brief",
      ORCHESTRATOR_HANDLE,
    );

    const chat = await this.deps.repo.createChat({
      kind: "group",
      title: name,
      projectId: slug,
      members: [
        { participant: { kind: "user", id: OWNER_ID }, role: "owner" },
        { participant: { kind: "agent", id: ORCHESTRATOR_HANDLE }, role: "member" },
        ...agents.map((id) => ({
          participant: { kind: "agent" as const, id },
          role: "member" as const,
        })),
      ],
    });

    await this.deps.db
      .query("CREATE $id CONTENT $content", {
        id: new RecordId("project", slug),
        content: {
          name,
          status: "active",
          chat: new RecordId("chat", chat.id),
          repo_path: workspace,
          ...(budgetUsd !== null ? { budget_usd: budgetUsd } : {}),
          ...(budgetTokens !== null ? { budget_tokens: budgetTokens } : {}),
          ...(input.kind === "app" ? { kind: "app", app: slug } : {}),
        },
      })
      .collect();

    await this.deps.repo.createMessage({
      chatId: chat.id,
      author: { kind: "bot", id: "system" },
      kind: "system",
      body: `${input.kind === "app" ? "App" : "Project"} created · budget: ${budgetText({ usd: budgetUsd, tokens: budgetTokens })} · team: ${agents.map((a) => `@${a}`).join(", ")}`,
    });

    // The kickoff comes from the orchestrator and wakes only the agent who starts; the others
    // are mentioned in the brief for context and get handed off to later.
    if (input.kickoff !== false) {
      const kickoff = await this.deps.repo.createMessage({
        chatId: chat.id,
        author: { kind: "agent", id: ORCHESTRATOR_HANDLE },
        body: brief,
        mentions: [startWith],
        chainDepth: 1,
      });
      this.deps.chat.notify(kickoff, chat);
    }

    const project = await this.get(slug);
    if (!project) throw new ProjectError("project was not saved");
    return { project, chat };
  }

  /** Removes a project's record, its tasks and its workspace (an app being uninstalled). */
  async remove(slug: string): Promise<void> {
    await this.deps.db
      .query("DELETE task WHERE project = $slug; DELETE $id;", {
        slug,
        id: new RecordId("project", slug),
      })
      .collect();
    rmSync(this.workspaceOf(slug), { recursive: true, force: true });
  }

  /**
   * Removes a project's record and tasks and moves its workspace to `backups/projects`, so the
   * files can still be taken back by hand. Returns where they went.
   */
  async archive(slug: string): Promise<string> {
    const source = this.workspaceOf(slug);
    const target = join(this.deps.dataDir, "backups", "projects", `${slug}-${timeStamp()}`);
    if (existsSync(source)) {
      mkdirSync(dirname(target), { recursive: true });
      renameSync(source, target);
    }
    await this.remove(slug);
    return target;
  }

  /** User action (or an approved request): changes or removes the project's limits. */
  async setBudget(
    slug: string,
    input: { usd: number | null; tokens: number | null },
  ): Promise<ProjectInfo> {
    if (!(await this.get(slug))) throw new ProjectError(`No project "${slug}"`);
    const { usd, tokens } = validBudget(input);
    await this.deps.db
      .query(
        `UPDATE $id SET budget_usd = ${usd === null ? "NONE" : "$usd"}, budget_tokens = ${tokens === null ? "NONE" : "$tokens"}`,
        { id: new RecordId("project", slug), usd, tokens },
      )
      .collect();
    const project = await this.get(slug);
    if (!project) throw new ProjectError(`No project "${slug}"`);
    this.deps.onChange?.(project);
    return project;
  }

  async setDataStore(slug: string, store: "database" | "files"): Promise<void> {
    await this.deps.db
      .query("UPDATE $id SET data_store = $store", { id: new RecordId("project", slug), store })
      .collect();
  }

  /** Pins an extension as the project's app (ADR 0021), or unpins it with null. */
  async setApp(slug: string, extensionId: string | null): Promise<ProjectInfo> {
    if (!(await this.get(slug))) throw new ProjectError(`No project "${slug}"`);
    await this.deps.db
      .query(extensionId ? "UPDATE $id SET app = $app" : "UPDATE $id SET app = NONE", {
        id: new RecordId("project", slug),
        app: extensionId,
      })
      .collect();
    const project = await this.get(slug);
    if (!project) throw new ProjectError(`No project "${slug}"`);
    this.deps.onChange?.(project);
    return project;
  }

  private async toProject(row: Row): Promise<ProjectInfo> {
    const id = keyOf(row.id);
    const spent = await this.deps.runs.spentByProject(id);
    return {
      id,
      name: String(row.name),
      status: row.status as Project["status"],
      chatId: keyOf(row.chat),
      budgetUsd: typeof row.budget_usd === "number" ? row.budget_usd : null,
      budgetTokens: typeof row.budget_tokens === "number" ? row.budget_tokens : null,
      spentUsd: spent.usd,
      spentTokens: spent.tokens,
      app: typeof row.app === "string" ? row.app : null,
      kind: row.kind === "app" ? "app" : "project",
      dataStore: row.data_store === "files" ? "files" : "database",
      createdAt: isoOf(row.created_at),
      workspace: String(row.repo_path),
    };
  }
}
