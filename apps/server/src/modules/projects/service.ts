import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Chat,
  type Project,
  type ProjectIsolation,
  parseMentions,
  SLUG_PATTERN,
  slugify,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { isoOf, keyOf } from "../../db/convert";
import { commitAll, ensureRepo } from "../../lib/git";
import type { AgentDirectory } from "../agents/directory";
import { ORCHESTRATOR_HANDLE } from "../agents/profiles";
import type { RunRepo } from "../agents/runs";
import { type ChatRepo, OWNER_ID } from "../chat/repo";
import type { ChatService } from "../chat/service";

export class ProjectError extends Error {
  override name = "ProjectError";
}

export interface ProjectInfo extends Project {
  workspace: string;
}

export interface ProjectInput {
  name: string;
  slug?: string;
  brief: string;
  agents: string[];
  budgetUsd: number;
  /** The agent the kickoff wakes; defaults to the first agent mentioned in the brief. */
  startWith?: string;
}

export interface ValidProject {
  name: string;
  slug: string;
  brief: string;
  agents: string[];
  startWith: string;
  budgetUsd: number;
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
      /** Isolation for new projects (sandbox settings, ADR 0018). */
      newProjectIsolation?: () => ProjectIsolation;
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
    if (!Number.isFinite(input.budgetUsd) || input.budgetUsd <= 0 || input.budgetUsd > 1000) {
      throw new ProjectError("budget must be a positive number of USD (max 1000)");
    }
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
    return { name, slug, brief, agents, startWith, budgetUsd: input.budgetUsd };
  }

  async create(input: ProjectInput): Promise<{ project: ProjectInfo; chat: Chat }> {
    const { name, slug, brief, agents, startWith } = await this.validate(input);

    // Workspace first: a git repo with the brief, so every agent change is a reversible commit.
    const workspace = this.workspaceOf(slug);
    await ensureRepo(workspace, "node_modules/\n.env\n");
    writeFileSync(join(workspace, "BRIEF.md"), `# ${name}\n\n${brief}\n`);
    await commitAll(workspace, "docs: add project brief", ORCHESTRATOR_HANDLE);

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
          budget_usd: input.budgetUsd,
          isolation: this.deps.newProjectIsolation?.() ?? "host",
        },
      })
      .collect();

    await this.deps.repo.createMessage({
      chatId: chat.id,
      author: { kind: "bot", id: "system" },
      kind: "system",
      body: `Project created · budget $${input.budgetUsd.toFixed(2)} · team: ${agents.map((a) => `@${a}`).join(", ")}`,
    });

    // The kickoff comes from the orchestrator and wakes only the agent who starts; the others
    // are mentioned in the brief for context and get handed off to later.
    const kickoff = await this.deps.repo.createMessage({
      chatId: chat.id,
      author: { kind: "agent", id: ORCHESTRATOR_HANDLE },
      body: brief,
      mentions: [startWith],
      chainDepth: 1,
    });
    this.deps.chat.notify(kickoff, chat);

    const project = await this.get(slug);
    if (!project) throw new ProjectError("project was not saved");
    return { project, chat };
  }

  /** User action only: agents cannot change where their commands run. */
  async setIsolation(slug: string, isolation: ProjectIsolation): Promise<ProjectInfo> {
    if (!(await this.get(slug))) throw new ProjectError(`No project "${slug}"`);
    await this.deps.db
      .query("UPDATE $id SET isolation = $isolation", {
        id: new RecordId("project", slug),
        isolation,
      })
      .collect();
    const project = await this.get(slug);
    if (!project) throw new ProjectError(`No project "${slug}"`);
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
      spentUsd: spent.usd,
      isolation: row.isolation === "container" ? "container" : "host",
      createdAt: isoOf(row.created_at),
      workspace: String(row.repo_path),
    };
  }
}
