import { join } from "node:path";
import type { Surreal } from "surrealdb";
import { ensureRepo } from "./lib/git";
import type { AgentDirectory } from "./modules/agents/directory";
import { orchestratorTools } from "./modules/agents/orchestrator-tools";
import { ORCHESTRATOR_HANDLE } from "./modules/agents/profiles";
import { RunRepo } from "./modules/agents/runs";
import { AgentRuntime } from "./modules/agents/runtime";
import { ChatRepo } from "./modules/chat/repo";
import { ChatService } from "./modules/chat/service";
import { ProjectService } from "./modules/projects/service";
import type { EventHub } from "./modules/realtime/hub";
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
  const tools = orchestratorTools({ agents: deps.agents, projects });
  const runtime = new AgentRuntime({
    chat,
    repo,
    runs,
    hub: deps.hub,
    provider: deps.provider,
    agents: deps.agents,
    projects,
    appTools: (handle) => (handle === ORCHESTRATOR_HANDLE ? tools : []),
    ownerName: owner.name,
    scratchDir: join(deps.dataDir, "state", "scratch"),
    defaultModel: deps.defaultModel,
    maxChainDepth: deps.maxChainDepth,
  });
  const lastOwnMessage = (await repo.listMessages("direct", { limit: 50 }))
    .filter((m) => m.author.kind === "user")
    .at(-1);
  if (lastOwnMessage) runtime.primeLanguage(lastOwnMessage.body);
  return { repo, chat, owner, runs, projects, runtime };
}
