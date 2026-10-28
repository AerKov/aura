import type { EngineId } from "@aura/shared";
import { commitAll } from "../../lib/git";
import { errorMessage } from "../../lib/log";
import { type McpProbe, probeMcpServer } from "../../providers/mcp-client";
import { NATIVE_BUILTINS } from "../../providers/native-tools";
import type { ProviderStatus } from "../../providers/types";
import type { ChatRepo } from "../chat/repo";
import type { McpService } from "../customize/mcp";
import { type EngineSelector, engineKind, engineLabel } from "../engines/registry";
import type { AgentDirectory } from "./directory";
import { redact, resolveTemplates } from "./env";
import { BUILTIN_TOOLS, type BuiltinTool, validateProfile } from "./profiles";
import type { RunRepo } from "./runs";
import type { SecretStore } from "./secrets";

export class AgentSetupError extends Error {
  override name = "AgentSetupError";
}

export interface EnvEntry {
  name: string;
  /** The plain value, or the reference (`${secret:…}`); never a secret value. */
  value: string;
  /** Whether the variable has a value now. */
  set: boolean;
}

export interface AgentStatus {
  handle: string;
  name: string;
  role: string;
  engine: { id: string; label: string; kind: "official" | "acp" | "aura"; status: ProviderStatus };
  model: string | null;
  tools: string[];
  /** Granted tools this engine does not provide. */
  unsupported: string[];
  /** The agent's own variables. */
  env: EnvEntry[];
  /** Variables shared by its command tool servers; the agent's own win on a clash. */
  sharedEnv: (EnvEntry & { from: string })[];
  mcpServers: { name: string; target: string }[];
  chats: { id: string; title: string }[];
  lastRun: { status: string; error: string | null; at: string } | null;
  /** Its limits (null = none) and what it used; dollars are API-price estimates (ADR 0023). */
  budget: { usd: number | null; tokens: number | null; spentUsd: number; spentTokens: number };
  /** Things that stop the agent from working as configured, in plain words. */
  warnings: string[];
}

const REF = /^\$\{(env|secret):([A-Z_][A-Z0-9_]*)\}$/;

/**
 * Everything about agents for the Agents page (ADR 0020, ADR 0030): each agent's status and
 * settings, the MCP tool servers they use, and the secrets their variables refer to, so nothing
 * fails without a reason.
 */
export class AgentSetupService {
  constructor(
    private readonly deps: {
      dataDir: string;
      mcp: McpService;
      secrets: SecretStore;
      agents: AgentDirectory;
      engines: EngineSelector;
      engineStatus?: (engine: EngineId) => Promise<ProviderStatus>;
      runs: RunRepo;
      repo: ChatRepo;
      env?: Record<string, string | undefined>;
    },
  ) {}

  private envEntries(map: Record<string, string>): EnvEntry[] {
    const env = this.deps.env ?? process.env;
    return Object.entries(map).map(([name, value]) => {
      const ref = REF.exec(value);
      const set = ref
        ? ref[1] === "secret"
          ? this.deps.secrets.get(ref[2] ?? "") !== null
          : Boolean(env[ref[2] ?? ""])
        : true;
      return { name, value, set };
    });
  }

  /** Headers as configured (references, never values), with whether each resolves now. */
  private headerEntries(map: Record<string, string>): EnvEntry[] {
    const env = this.deps.env ?? process.env;
    const { missing } = resolveTemplates(map, {
      secret: (n) => this.deps.secrets.get(n),
      env,
    });
    return Object.entries(map).map(([name, value]) => ({
      name,
      value,
      set: !missing.includes(name),
    }));
  }

  /** Variables an agent's commands get besides its own: from command servers that share theirs. */
  sharedEnvFor(handle: string): { env: Record<string, string>; from: Record<string, string> } {
    return this.deps.mcp.sharedEnvFor(handle);
  }

  /** The tool servers and the secrets' names (never values), for the Agents page. */
  overview() {
    const servers = this.deps.mcp.servers();
    return {
      servers: Object.entries(servers).map(([name, s]) => ({
        name,
        kind: s.url ? ("http" as const) : ("stdio" as const),
        command: s.command ?? null,
        args: s.args ?? [],
        url: s.url ?? null,
        env: this.envEntries(s.env ?? {}),
        headers: this.headerEntries(s.headers ?? {}),
        shareEnv: s.shareEnv === true,
        agents: s.agents,
      })),
      secrets: this.deps.secrets.names(),
    };
  }

  async saveServer(
    name: string,
    input: {
      command?: string;
      args?: string[];
      url?: string;
      headers?: Record<string, string>;
      env?: Record<string, string>;
      shareEnv?: boolean;
      agents: string[];
    },
  ): Promise<string> {
    const config = input.url
      ? { url: input.url, headers: input.headers ?? {}, agents: input.agents }
      : {
          shareEnv: input.shareEnv === true,
          command: input.command,
          args: input.args ?? [],
          env: input.env ?? {},
          agents: input.agents,
        };
    return this.deps.mcp.save(name, config, "owner");
  }

  removeServer(name: string): Promise<void> {
    return this.deps.mcp.remove(name, "owner");
  }

  /** Starts the server once, as an agent's run would, and reports its tools or what failed. */
  async testServer(name: string): Promise<McpProbe & { missing: string[]; unpassed: string[] }> {
    const found = this.deps.mcp.specOf(name);
    if (!found) throw new AgentSetupError(`No MCP server "${name}"`);
    const probe = await probeMcpServer(found.spec);
    const secrets = this.deps.secrets.values();
    // Stored secrets the server talks about (in its log or error) but was not given: the usual
    // reason a server "works" yet complains about missing configuration.
    const given = new Set(Object.keys(this.deps.mcp.servers()[name]?.env ?? {}));
    const said = `${probe.log}\n${probe.error ?? ""}`;
    const unpassed = this.deps.secrets
      .names()
      .filter((n) => !given.has(n) && new RegExp(`\\b${n}\\b`).test(said));
    const hints = [
      found.missing.length > 0
        ? `These variables have no value: ${found.missing.join(", ")}. Set them under Secrets.`
        : "",
      unpassed.length > 0
        ? `The server asks for ${unpassed.join(", ")}, which you stored as secrets but did not give to this server.`
        : "",
    ].filter(Boolean);
    const errors = [probe.error ? redact(probe.error, secrets) : "", ...hints].filter(Boolean);
    return {
      ...probe,
      error: errors.length > 0 ? errors.join(" ") : null,
      log: redact(probe.log, secrets),
      missing: found.missing,
      unpassed,
    };
  }

  secretNames(): string[] {
    return this.deps.secrets.names();
  }

  setSecret(name: string, value: string | null): void {
    this.deps.secrets.set(name, value);
  }

  async agentStatus(handle: string): Promise<AgentStatus> {
    const profile = await this.deps.agents.get(handle);
    if (!profile)
      throw new AgentSetupError(
        `@${handle} has no valid profile. Check agents/${handle}/agent.md for errors.`,
      );
    const { engine, model } = this.deps.engines.pick(profile);
    const kind = engineKind(engine);
    const status = this.deps.engineStatus
      ? await Promise.race([
          this.deps.engineStatus(engine),
          Bun.sleep(8000).then(
            (): ProviderStatus => ({ ok: false, reason: "No answer from the engine in 8 seconds" }),
          ),
        ]).catch((error: unknown): ProviderStatus => ({ ok: false, reason: errorMessage(error) }))
      : { ok: true as const };
    const supported: readonly string[] =
      kind === "aura" ? NATIVE_BUILTINS : kind === "official" ? BUILTIN_TOOLS : BUILTIN_TOOLS;
    const unsupported = profile.builtinTools.filter((t) => !supported.includes(t));
    const own = this.envEntries(profile.env ?? {});
    const shared = this.sharedEnvFor(handle);
    const sharedEnv = this.envEntries(shared.env)
      .filter((e) => !(e.name in (profile.env ?? {})))
      .map((e) => ({ ...e, from: shared.from[e.name] ?? "" }));
    const env = [...own, ...sharedEnv];
    const servers = Object.entries(this.deps.mcp.servers())
      .filter(([, s]) => s.agents.includes(handle))
      .map(([name, s]) => ({
        name,
        target: s.url ?? [s.command, ...(s.args ?? [])].join(" "),
      }));
    const chats: { id: string; title: string }[] = [];
    for (const id of await this.deps.repo.chatsOfAgent(handle)) {
      const chat = await this.deps.repo.findChat(id);
      if (chat) chats.push({ id, title: chat.title });
    }
    const lastRun = await this.deps.runs.latest(handle);

    const warnings: string[] = [];
    if (!status.ok) warnings.push(`${engineLabel(engine)} is not ready: ${status.reason}`);
    if (unsupported.length > 0)
      warnings.push(
        `${engineLabel(engine)} does not provide ${unsupported.join(", ")}, so the agent works without ${unsupported.length > 1 ? "them" : "it"}.`,
      );
    if (kind === "acp")
      warnings.push(
        `${engineLabel(engine)} uses its own tools; Aura allows or denies each one by the agent's tools above.`,
      );
    if (engine === "ollama")
      warnings.push(
        "On Ollama, tools work only with models that support tool calling (qwen3, llama3.1…).",
      );
    for (const e of env.filter((x) => !x.set))
      warnings.push(`${e.name} has no value: set it under Secrets below.`);
    if (env.length > 0 && !profile.builtinTools.includes("Bash"))
      warnings.push("The agent has variables but no Bash, so no command can use them.");
    if (chats.length === 0)
      warnings.push("The agent is not in any chat yet, so nobody can reach it.");
    if (lastRun?.status === "error" && lastRun.error)
      warnings.push(`The last run failed: ${redact(lastRun.error, this.deps.secrets.values())}`);

    return {
      handle,
      name: profile.name,
      role: profile.role,
      engine: { id: engine, label: engineLabel(engine), kind, status },
      model,
      tools: profile.builtinTools,
      unsupported,
      env: own,
      sharedEnv,
      mcpServers: servers,
      chats,
      budget: {
        usd: profile.budgetUsd,
        tokens: profile.budgetTokens ?? null,
        ...(await this.deps.runs.spentByAgent(handle).then((x) => ({
          spentUsd: x.usd,
          spentTokens: x.tokens,
        }))),
      },
      lastRun: lastRun
        ? {
            ...lastRun,
            error: lastRun.error ? redact(lastRun.error, this.deps.secrets.values()) : null,
          }
        : null,
      warnings,
    };
  }

  /** A user action from the agent's card: its tools and variables, as one commit. */
  async updateAgent(
    handle: string,
    patch: {
      tools?: string[];
      env?: Record<string, string>;
      budget?: { usd: number | null; tokens: number | null };
    },
  ): Promise<AgentStatus> {
    const profile = await this.deps.agents.get(handle);
    if (!profile) throw new AgentSetupError(`No agent @${handle}`);
    const next = validateProfile({
      handle,
      name: profile.name,
      role: profile.role,
      engine: profile.engine,
      model: profile.model,
      systemPrompt: profile.systemPrompt,
      tools: (patch.tools ?? profile.builtinTools) as BuiltinTool[],
      budgetUsd: patch.budget ? patch.budget.usd : profile.budgetUsd,
      budgetTokens: patch.budget ? patch.budget.tokens : profile.budgetTokens,
      skills: profile.skills,
      env: patch.env ?? profile.env,
    });
    await this.deps.agents.update(next);
    // The card sends every field; the commit names only what changed.
    const differs = (a: unknown, b: unknown) =>
      JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
    const what = [
      differs(next.builtinTools, profile.builtinTools) ? "tools" : "",
      differs(next.env, profile.env) ? "environment" : "",
      differs([next.budgetUsd, next.budgetTokens], [profile.budgetUsd, profile.budgetTokens])
        ? "budget"
        : "",
    ].filter(Boolean);
    if (what.length === 0) return this.agentStatus(handle);
    await commitAll(this.deps.dataDir, `agents(@${handle}): update ${what.join(", ")}`, "owner");
    return this.agentStatus(handle);
  }
}
