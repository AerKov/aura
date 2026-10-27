import { join } from "node:path";
import type { EngineId } from "@aura/shared";
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
import { ContainerService, containerNote } from "./modules/containers/service";
import { AppearanceService } from "./modules/customize/appearance";
import { ExtensionService } from "./modules/customize/extensions";
import { McpService } from "./modules/customize/mcp";
import type { SafeMode } from "./modules/customize/safe-mode";
import { customizeTools } from "./modules/customize/tools";
import { DeviceService } from "./modules/devices/service";
import type { EngineSelector } from "./modules/engines/registry";
import { AURA_GUIDE, helpTools } from "./modules/help/tools";
import { redact, resolveEnv } from "./modules/integrations/env";
import { SecretStore } from "./modules/integrations/secrets";
import { IntegrationsService } from "./modules/integrations/service";
import { integrationTools } from "./modules/integrations/tools";
import { VariableSets } from "./modules/integrations/variables";
import { JobService } from "./modules/jobs/service";
import { MemoryService } from "./modules/memory/service";
import { ProjectService } from "./modules/projects/service";
import type { EventHub } from "./modules/realtime/hub";
import { SandboxService } from "./modules/sandbox/service";
import { SkillService } from "./modules/skills/service";
import { ChatSummaryService } from "./modules/summaries/service";
import { TaskService } from "./modules/tasks/service";
import type { Embedder } from "./providers/embeddings";
import type { ProviderStatus } from "./providers/types";

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
  /** Project containers (ADR 0018); created from the sandbox settings when absent. */
  containers?: ContainerService;
  /** Network for packs installed from a URL (replaced in tests). */
  fetch?: typeof fetch;
  /** Embedding model for semantic memory search; keyword search when absent. */
  embedder?: () => Embedder | null;
  /** Whether an engine is ready, for agents' status cards (ADR 0020). */
  engineStatus?: (engine: EngineId) => Promise<ProviderStatus>;
  /** Whether long chats are summarized for agents (engine settings, ADR 0017). */
  summaries?: () => boolean;
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
  const sandbox = deps.sandbox ?? new SandboxService({ dataDir: deps.dataDir });
  const containers =
    deps.containers ??
    new ContainerService({
      dataDir: deps.dataDir,
      settings: () => sandbox.store.get().container,
    });
  const projects = new ProjectService({
    db: deps.db,
    dataDir: deps.dataDir,
    chat,
    repo,
    runs,
    agents: deps.agents,
    newProjectIsolation: () => (sandbox.store.get().container.newProjects ? "container" : "host"),
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
    dataDir: deps.dataDir,
  };
  const appearance = new AppearanceService({
    db: deps.db,
    dataDir: deps.dataDir,
    approvals,
    hub: deps.hub,
  });
  const secrets = new SecretStore(deps.dataDir);
  const variables = new VariableSets({ dataDir: deps.dataDir, agents: deps.agents });
  const mcp = new McpService({
    dataDir: deps.dataDir,
    agents: deps.agents,
    approvals,
    safeMode: () => safeMode.on,
    secrets,
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
  const integrations = new IntegrationsService({
    dataDir: deps.dataDir,
    mcp,
    secrets,
    agents: deps.agents,
    engines: deps.engines,
    engineStatus: deps.engineStatus,
    runs,
    repo,
    sandbox,
    variables,
  });
  const scratchDir = join(deps.dataDir, "state", "scratch");
  const summaries = new ChatSummaryService({
    db: deps.db,
    repo,
    runs,
    engines: deps.engines,
    agents: deps.agents,
    projects,
    ownerName: owner.name,
    scratchDir,
    enabled: deps.summaries ?? (() => true),
  });
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
      ...(ctx.handle === "orchestrator" ? [...integrationTools(integrations), ...helpTools()] : []),
      // Every chat: a card lands where the user asked (alpha feedback: in a project chat the
      // orchestrator had no such tools and claimed to have sent cards).
      ...(ctx.handle === "orchestrator"
        ? [
            ...customizeTools(customize, { handle: ctx.handle, chatId: ctx.chat.id }),
            ...catalogTools(catalog, { handle: ctx.handle, chatId: ctx.chat.id }),
          ]
        : []),
    ],
    mcpServers: (handle) => mcp.forAgent(handle),
    projectMcp: (project, servers) =>
      project.isolation === "container"
        ? containers.wrapMcp(project, servers)
        : Promise.resolve(servers),
    promptExtras: (profile) =>
      skills.promptFor(profile) + (profile.handle === "orchestrator" ? AURA_GUIDE : ""),
    memoryPrompt: (input) => memory.promptFor(input),
    sandboxPolicy: () => sandbox.policy(),
    // Shared variable sets first; the agent's own variables win on a clash.
    agentEnv: (profile) =>
      resolveEnv(
        { ...integrations.sharedEnvFor(profile.handle).env, ...(profile.env ?? {}) },
        { secret: (n) => secrets.get(n), env: process.env },
      ),
    redact: (text) => redact(text, secrets.values()),
    projectShell: (project, handle, signal, env) =>
      project.isolation === "container"
        ? {
            tool: containers.bashTool(project, handle, signal, env),
            note: containerNote(sandbox.store.get().container),
          }
        : null,
    chatSummary: (chatId) => summaries.get(chatId),
    afterRun: (chat) => summaries.schedule(chat.id),
    ownerName: owner.name,
    scratchDir,
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
    summaries,
    sandbox,
    containers,
    secrets,
    integrations,
    appearance,
    mcp,
    extensions,
    catalog,
    safeMode,
    appVersion: SERVER_VERSION,
    devices,
  };
}
