import { join } from "node:path";
import type { Surreal } from "surrealdb";
import { SERVER_VERSION } from "./config";
import { ensureRepo } from "./lib/git";
import type { AgentDirectory } from "./modules/agents/directory";
import { RunRepo } from "./modules/agents/runs";
import { AgentRuntime } from "./modules/agents/runtime";
import { registerExecutors, toolsFor } from "./modules/agents/tools";
import { AlertService, TriageLimiter } from "./modules/alerts/service";
import { ApprovalService } from "./modules/approvals/service";
import { CatalogService } from "./modules/catalog/service";
import { catalogTools } from "./modules/catalog/tools";
import { ChatRepo } from "./modules/chat/repo";
import { ChatService } from "./modules/chat/service";
import { AppearanceService } from "./modules/customize/appearance";
import { ExtensionService } from "./modules/customize/extensions";
import { McpService } from "./modules/customize/mcp";
import type { SafeMode } from "./modules/customize/safe-mode";
import { customizeTools } from "./modules/customize/tools";
import { DeviceService } from "./modules/devices/service";
import type { EngineSelector } from "./modules/engines/registry";
import { JobService } from "./modules/jobs/service";
import { MemoryService } from "./modules/memory/service";
import { ProjectService } from "./modules/projects/service";
import type { EventHub } from "./modules/realtime/hub";
import { SandboxService } from "./modules/sandbox/service";
import { SkillService } from "./modules/skills/service";
import { TaskService } from "./modules/tasks/service";
import type { Embedder } from "./providers/embeddings";

/** The user data directory is a git repo; DB state and project repos are kept out of it. */
export const DATA_GITIGNORE = "state/\nprojects/\n";

export async function prepareDataDir(dataDir: string): Promise<void> {
  await ensureRepo(dataDir, DATA_GITIGNORE);
}

/** Wires the domain services shared by the server entry point and tests. */
export async function createServices(deps: {
  db: Surreal;
  hub: EventHub;
  engines: EngineSelector;
  /** OS sandbox for agents' shell commands; created from the data dir when absent. */
  sandbox?: SandboxService;
  /** Network for packs installed from a URL (replaced in tests). */
  fetch?: typeof fetch;
  /** Embedding model for semantic memory search; keyword search when absent. */
  embedder?: () => Embedder | null;
  agents: AgentDirectory;
  dataDir: string;
  maxChainDepth?: number;
  triageDelayMs?: number;
  safeMode?: SafeMode;
}) {
  const safeMode: SafeMode = deps.safeMode ?? { on: false, reason: null };
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
  const sandbox = deps.sandbox ?? new SandboxService({ dataDir: deps.dataDir });
  const memory = new MemoryService({ db: deps.db, embedder: deps.embedder ?? (() => null) });
  const toolDeps = {
    agents: deps.agents,
    projects,
    approvals,
    skills,
    tasks,
    jobs,
    repo,
    chat,
    memory,
  };
  const appearance = new AppearanceService({
    db: deps.db,
    dataDir: deps.dataDir,
    approvals,
    hub: deps.hub,
  });
  const mcp = new McpService({
    dataDir: deps.dataDir,
    agents: deps.agents,
    approvals,
    safeMode: () => safeMode.on,
  });
  const extensions = new ExtensionService({
    db: deps.db,
    dataDir: deps.dataDir,
    approvals,
    hub: deps.hub,
    appVersion: SERVER_VERSION,
    safeMode: () => safeMode.on,
  });
  const customize = { appearance, mcp, extensions };
  const catalog = new CatalogService({
    dataDir: deps.dataDir,
    approvals,
    extensions,
    hub: deps.hub,
    fetch: deps.fetch,
  });
  const devices = new DeviceService({ db: deps.db, owner });
  registerExecutors(toolDeps);
  const runtime = new AgentRuntime({
    chat,
    repo,
    runs,
    hub: deps.hub,
    engines: deps.engines,
    agents: deps.agents,
    projects,
    appTools: (ctx) => [
      ...toolsFor(toolDeps, ctx),
      ...(ctx.handle === "orchestrator" && ctx.chat.kind === "direct"
        ? [
            ...customizeTools(customize, { handle: ctx.handle, chatId: ctx.chat.id }),
            ...catalogTools(catalog, { handle: ctx.handle, chatId: ctx.chat.id }),
          ]
        : []),
    ],
    mcpServers: (handle) => mcp.forAgent(handle),
    promptExtras: (profile) => skills.promptFor(profile),
    memoryPrompt: (input) => memory.promptFor(input),
    sandboxPolicy: () => sandbox.policy(),
    ownerName: owner.name,
    scratchDir: join(deps.dataDir, "state", "scratch"),
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
    memory,
    sandbox,
    appearance,
    mcp,
    extensions,
    catalog,
    safeMode,
    appVersion: SERVER_VERSION,
    devices,
  };
}
