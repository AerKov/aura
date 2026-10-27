import { join } from "node:path";
import type { Surreal } from "surrealdb";
import { ensureRepo } from "./lib/git";
import type { AgentDirectory } from "./modules/agents/directory";
import { RunRepo } from "./modules/agents/runs";
import { AgentRuntime } from "./modules/agents/runtime";
import { registerExecutors, toolsFor } from "./modules/agents/tools";
import { AlertService, TriageLimiter } from "./modules/alerts/service";
import { ApprovalService } from "./modules/approvals/service";
import { ChatRepo } from "./modules/chat/repo";
import { ChatService } from "./modules/chat/service";
import { JobService } from "./modules/jobs/service";
import { ProjectService } from "./modules/projects/service";
import type { EventHub } from "./modules/realtime/hub";
import { SkillService } from "./modules/skills/service";
import { TaskService } from "./modules/tasks/service";
import type { LLMProvider } from "./providers/types";

/** The user data directory is a git repo; DB state and project repos are kept out of it. */
export const DATA_GITIGNORE = "state/\nprojects/\n";

export async function prepareDataDir(dataDir: string): Promise<void> {
  await ensureRepo(dataDir, DATA_GITIGNORE);
}

/** Wires the domain services shared by the server entry point and tests. */
export async function createServices(deps: {
  db: Surreal;
  hub: EventHub;
  provider: LLMProvider;
  agents: AgentDirectory;
  dataDir: string;
  defaultModel?: string;
  maxChainDepth?: number;
  triageDelayMs?: number;
}) {
  const repo = new ChatRepo(deps.db);
  const chat = new ChatService(repo);
  const owner = await chat.bootstrap();
  const runs = new RunRepo(deps.db);
  const projects = new ProjectService({
    db: deps.db,
    dataDir: deps.dataDir,
    chat,
    repo,
    runs,
    agents: deps.agents,
  });
  const approvals = new ApprovalService(deps.db, repo);
  const skills = new SkillService({
    db: deps.db,
    dataDir: deps.dataDir,
    agents: deps.agents,
    approvals,
  });
  const tasks = new TaskService({ db: deps.db, repo, chat });
  const jobs = new JobService({ db: deps.db, repo, chat });
  const alerts = new AlertService({
    db: deps.db,
    repo,
    chat,
    limiter: new TriageLimiter(),
    triageDelayMs: deps.triageDelayMs,
  });
  const toolDeps = { agents: deps.agents, projects, approvals, skills, tasks, jobs, repo, chat };
  registerExecutors(toolDeps);
  const runtime = new AgentRuntime({
    chat,
    repo,
    runs,
    hub: deps.hub,
    provider: deps.provider,
    agents: deps.agents,
    projects,
    appTools: (ctx) => toolsFor(toolDeps, ctx),
    promptExtras: (profile) => skills.promptFor(profile),
    ownerName: owner.name,
    scratchDir: join(deps.dataDir, "state", "scratch"),
    defaultModel: deps.defaultModel,
    maxChainDepth: deps.maxChainDepth,
  });
  const lastOwnMessage = (await repo.listMessages("direct", { limit: 50 }))
    .filter((m) => m.author.kind === "user")
    .at(-1);
  if (lastOwnMessage) runtime.primeLanguage(lastOwnMessage.body);
  return {
    repo,
    chat,
    owner,
    runs,
    projects,
    runtime,
    approvals,
    skills,
    tasks,
    jobs,
    alerts,
    toolDeps,
  };
}
