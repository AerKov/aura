import type { EngineId } from "@aura/shared";
import { commitAll } from "../../lib/git";
import { errorMessage } from "../../lib/log";
import { type McpProbe, probeMcpServer } from "../../providers/mcp-client";
import { NATIVE_BUILTINS } from "../../providers/native-tools";
import type { ProviderStatus } from "../../providers/types";
import type { AgentDirectory } from "../agents/directory";
import { BUILTIN_TOOLS, type BuiltinTool, validateProfile } from "../agents/profiles";
import type { RunRepo } from "../agents/runs";
import type { ChatRepo } from "../chat/repo";
import type { McpService } from "../customize/mcp";
import { type EngineSelector, engineKind, engineLabel } from "../engines/registry";
import type { SandboxService } from "../sandbox/service";
import { looksSecret, redact } from "./env";
import type { SecretStore } from "./secrets";

export class IntegrationError extends Error {
  override name = "IntegrationError";
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
  env: EnvEntry[];
  mcpServers: { name: string; target: string }[];
  chats: { id: string; title: string }[];
  lastRun: { status: string; error: string | null; at: string } | null;
  /** Things that stop the agent from working as configured, in plain words. */
  warnings: string[];
}

export interface HostCheck {
  url: string;
  host: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error: string | null;
  /** Whether agents' sandboxed commands may reach this host. */
  sandbox: { active: boolean; allowed: boolean };
}

/** Whether `host` matches an allowlist entry (`example.com` or `*.example.com`). */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((d) =>
    d.startsWith("*.") ? h.endsWith(d.slice(1)) || h === d.slice(2) : h === d,
  );
}

const REF = /^\$\{(env|secret):([A-Z_][A-Z0-9_]*)\}$/;

/**
 * Integrations and diagnostics (ADR 0020): MCP servers and secrets managed by the user, a
 * connection test, a host check and each agent's status, so nothing fails without a reason.
 */
export class IntegrationsService {
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
      sandbox: SandboxService;
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
      env?: Record<string, string>;
      agents: string[];
    },
  ): Promise<string> {
    const config = input.url
      ? { url: input.url, agents: input.agents }
      : {
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
  async testServer(name: string): Promise<McpProbe & { missing: string[] }> {
    const found = this.deps.mcp.specOf(name);
    if (!found) throw new IntegrationError(`No MCP server "${name}"`);
    const probe = await probeMcpServer(found.spec);
    const secrets = this.deps.secrets.values();
    const hint =
      found.missing.length > 0
        ? ` These variables have no value: ${found.missing.join(", ")}. Set them under Secrets.`
        : "";
    return {
      ...probe,
      error: probe.error
        ? redact(probe.error, secrets) + hint
        : found.missing.length
          ? hint.trim()
          : null,
      log: redact(probe.log, secrets),
      missing: found.missing,
    };
  }

  secretNames(): string[] {
    return this.deps.secrets.names();
  }

  setSecret(name: string, value: string | null): void {
    this.deps.secrets.set(name, value);
  }

  /** Can this computer reach `url`, and may agents' sandboxed commands? (alpha feedback B9) */
  async checkHost(raw: string): Promise<HostCheck> {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new IntegrationError(`"${raw}" is not a URL like https://redmine.example.com`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new IntegrationError("Only http(s) addresses can be checked");
    const status = this.deps.sandbox.status();
    const sandbox = {
      active: status.active,
      allowed: hostAllowed(url.hostname, status.allowedDomains),
    };
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      await res.body?.cancel().catch(() => {});
      return {
        url: url.href,
        host: url.hostname,
        ok: true,
        status: res.status,
        ms: Date.now() - started,
        error: null,
        sandbox,
      };
    } catch (error) {
      const text = errorMessage(error);
      const explained = /ENOTFOUND|getaddrinfo|resolve/i.test(text)
        ? "The host name was not found. Check the address, or connect to the VPN it needs."
        : /ECONNREFUSED|refused/i.test(text)
          ? "The host answered, but nothing listens on that port."
          : /timed? ?out|abort/i.test(text)
            ? "No answer in 8 seconds. A firewall or VPN may be in the way."
            : /certificate|SSL|TLS/i.test(text)
              ? "The secure connection failed (certificate problem)."
              : text.slice(0, 300);
      return {
        url: url.href,
        host: url.hostname,
        ok: false,
        status: null,
        ms: Date.now() - started,
        error: explained,
        sandbox,
      };
    }
  }

  async agentStatus(handle: string): Promise<AgentStatus> {
    const profile = await this.deps.agents.get(handle);
    if (!profile)
      throw new IntegrationError(
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
    const env = this.envEntries(profile.env ?? {});
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
      warnings.push(`${e.name} has no value: set it under Secrets on the Integrations page.`);
    if (env.length > 0 && !profile.builtinTools.includes("Bash"))
      warnings.push("The agent has variables but no Bash, so no command can use them.");
    const sandbox = this.deps.sandbox.status();
    if (profile.builtinTools.includes("Bash") && sandbox.active) {
      for (const e of env) {
        if (REF.test(e.value) || looksSecret(e.name)) continue;
        let host: string | null = null;
        try {
          host = new URL(e.value).hostname;
        } catch {}
        if (host && !hostAllowed(host, sandbox.allowedDomains))
          warnings.push(
            `${e.name} points to ${host}, which the command sandbox blocks. Add it to the allowed hosts on the Engines page.`,
          );
      }
    }
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
      env,
      mcpServers: servers,
      chats,
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
    patch: { tools?: string[]; env?: Record<string, string> },
  ): Promise<AgentStatus> {
    const profile = await this.deps.agents.get(handle);
    if (!profile) throw new IntegrationError(`No agent @${handle}`);
    const next = validateProfile({
      handle,
      name: profile.name,
      role: profile.role,
      engine: profile.engine,
      model: profile.model,
      systemPrompt: profile.systemPrompt,
      tools: (patch.tools ?? profile.builtinTools) as BuiltinTool[],
      budgetUsd: profile.budgetUsd,
      skills: profile.skills,
      env: patch.env ?? profile.env,
    });
    await this.deps.agents.update(next);
    const what = [patch.tools ? "tools" : "", patch.env ? "environment" : ""].filter(Boolean);
    await commitAll(this.deps.dataDir, `agents(@${handle}): update ${what.join(" and ")}`, "owner");
    return this.agentStatus(handle);
  }
}
