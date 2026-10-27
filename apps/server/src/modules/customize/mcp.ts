import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServerInfo } from "@aura/shared";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import { proxyEnv } from "../../lib/proxy";
import type { McpServerSpec } from "../../providers/types";
import type { AgentDirectory } from "../agents/directory";
import type { ApprovalRecord, ApprovalService } from "../approvals/service";
import { resolveEnv, resolveTemplates, validateEnvMap, validateHeaders } from "../integrations/env";
import type { SecretStore } from "../integrations/secrets";

export class McpError extends Error {
  override name = "McpError";
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  /** Values must be `${env:NAME}` references: secrets never go into the git repo. */
  env?: Record<string, string>;
  url?: string;
  /** Headers for a server at a URL; credentials only as `${secret:…}` references. */
  headers?: Record<string, string>;
  /** The server's variables also reach its agents' shell commands (for a CLI or script too). */
  shareEnv?: boolean;
  agents: string[];
}

const NAME = /^[a-z][a-z0-9_-]{1,31}$/;

export function validateServer(name: string, value: unknown): McpServerConfig {
  if (!NAME.test(name))
    throw new McpError(
      `server name "${name}" must be 2-32 chars: lowercase letters, digits, - or _`,
    );
  if (typeof value !== "object" || value === null)
    throw new McpError(`${name}: config must be an object`);
  const v = value as Record<string, unknown>;
  const agents = v.agents;
  if (!Array.isArray(agents) || !agents.every((a) => typeof a === "string"))
    throw new McpError(`${name}: agents must be a list of handles`);
  if (typeof v.url === "string") {
    if (!/^https?:\/\/[^\s]+$/.test(v.url)) throw new McpError(`${name}: url must be http(s)`);
    const headers = validateHeaders(v.headers, (message) => new McpError(`${name}: ${message}`));
    return { url: v.url, ...(Object.keys(headers).length > 0 ? { headers } : {}), agents };
  }
  if (typeof v.command !== "string" || !v.command.trim())
    throw new McpError(`${name}: command or url is required`);
  const args = v.args ?? [];
  if (!Array.isArray(args) || !args.every((a) => typeof a === "string"))
    throw new McpError(`${name}: args must be strings`);
  const env = validateEnvMap(v.env, (message) => new McpError(`${name}: ${message}`));
  return {
    command: v.command,
    args: args as string[],
    env,
    ...(v.shareEnv === true ? { shareEnv: true } : {}),
    agents,
  };
}

/** Tier 2 customization: MCP servers in `mcp/servers.json`, each granted to specific agents. */
export class McpService {
  constructor(
    private readonly deps: {
      dataDir: string;
      agents: AgentDirectory;
      approvals: ApprovalService;
      safeMode: () => boolean;
      env?: Record<string, string | undefined>;
      /** Values for `${secret:…}` references (ADR 0020). */
      secrets?: SecretStore;
    },
  ) {
    deps.approvals.register("mcp_server", async (payload, ctx) =>
      this.apply(payload, ctx.requestedBy),
    );
  }

  private get file(): string {
    return join(this.deps.dataDir, "mcp", "servers.json");
  }

  private readRaw(): Record<string, unknown> {
    if (!existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as {
        servers?: Record<string, unknown>;
      };
      return parsed.servers ?? {};
    } catch (error) {
      log.error("invalid mcp/servers.json", { error: errorMessage(error) });
      return {};
    }
  }

  servers(): Record<string, McpServerConfig> {
    const out: Record<string, McpServerConfig> = {};
    for (const [name, value] of Object.entries(this.readRaw())) {
      try {
        out[name] = validateServer(name, value);
      } catch (error) {
        log.error("invalid mcp server", { name, error: errorMessage(error) });
      }
    }
    return out;
  }

  list(): McpServerInfo[] {
    return Object.entries(this.servers()).map(([name, s]) => ({
      name,
      target: s.url ?? [s.command, ...(s.args ?? [])].join(" "),
      agents: s.agents,
    }));
  }

  /** MCP servers an agent may use in a run; none in safe mode. */
  forAgent(handle: string): Record<string, McpServerSpec> {
    if (this.deps.safeMode()) return {};
    const env = this.deps.env ?? process.env;
    const out: Record<string, McpServerSpec> = {};
    for (const [name, s] of Object.entries(this.servers())) {
      if (!s.agents.includes(handle)) continue;
      if (s.url) {
        const { values, missing } = resolveTemplates(s.headers ?? {}, {
          secret: (n) => this.deps.secrets?.get(n) ?? null,
          env,
        });
        if (missing.length > 0)
          log.warn("mcp server connects without some headers", { server: name, missing });
        out[name] = { type: "http", url: s.url, headers: values };
      } else if (s.command) {
        const { values, missing } = resolveEnv(s.env ?? {}, {
          secret: (n) => this.deps.secrets?.get(n) ?? null,
          env,
        });
        if (missing.length > 0)
          log.warn("mcp server starts without some variables", { server: name, missing });
        out[name] = {
          type: "stdio",
          command: s.command,
          args: s.args ?? [],
          env: { ...proxyEnv(env), ...values },
        };
      }
    }
    return out;
  }

  async propose(
    input: { name: string; config: unknown },
    by: { requestedBy: string; chatId: string; why: string },
  ): Promise<ApprovalRecord> {
    const config = validateServer(input.name, input.config);
    for (const handle of config.agents) {
      if (!(await this.deps.agents.get(handle))) throw new McpError(`@${handle} does not exist`);
    }
    const target = config.url ?? [config.command, ...(config.args ?? [])].join(" ");
    return this.deps.approvals.request({
      kind: "mcp_server",
      requestedBy: by.requestedBy,
      chatId: by.chatId,
      title: `${this.servers()[input.name] ? "Update" : "Add"} MCP server "${input.name}"`,
      why: by.why,
      preview: [
        config.url
          ? `**Connects to:** \`${config.url}\``
          : "**Runs this command on your computer** (inside the project's container in container projects):",
        config.url ? "" : `\`\`\`sh\n${target}\n\`\`\``,
        `**For:** ${config.agents.map((a) => `@${a}`).join(", ") || "no agents"}`,
        Object.keys(config.env ?? {}).length
          ? `**Environment:** ${Object.entries(config.env ?? {})
              .map(([k, v]) => `\`${k}=${v}\``)
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      payload: { name: input.name, config },
    });
  }

  private async apply(payload: Record<string, unknown>, author: string): Promise<string> {
    return this.save(String(payload.name), payload.config, author);
  }

  /** Writes a server (a user action on the Integrations page, or an approved proposal). */
  async save(name: string, raw: unknown, author = "owner"): Promise<string> {
    const config = validateServer(name, raw);
    for (const handle of config.agents) {
      if (!(await this.deps.agents.get(handle))) throw new McpError(`@${handle} does not exist`);
    }
    const servers = this.readRaw();
    servers[name] = config;
    mkdirSync(join(this.deps.dataDir, "mcp"), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify({ servers }, null, 2)}\n`);
    await commitAll(
      this.deps.dataDir,
      `mcp(${name}): ${config.url ? "connect" : "add"} for ${config.agents.join(", ")}`,
      author,
    );
    return `MCP server "${name}" is available to ${config.agents.map((a) => `@${a}`).join(", ")} from their next run.`;
  }

  /** Variables of the command servers granted to an agent that share them with its commands. */
  sharedEnvFor(handle: string): { env: Record<string, string>; from: Record<string, string> } {
    const env: Record<string, string> = {};
    const from: Record<string, string> = {};
    if (this.deps.safeMode()) return { env, from };
    for (const [name, s] of Object.entries(this.servers())) {
      if (!s.shareEnv || !s.agents.includes(handle)) continue;
      for (const [key, value] of Object.entries(s.env ?? {})) {
        env[key] = value;
        from[key] = `server ${name}`;
      }
    }
    return { env, from };
  }

  /** Removes a server; agents lose its tools from their next run. */
  async remove(name: string, author = "owner"): Promise<void> {
    const servers = this.readRaw();
    if (!(name in servers)) throw new McpError(`No MCP server "${name}"`);
    delete servers[name];
    writeFileSync(this.file, `${JSON.stringify({ servers }, null, 2)}\n`);
    await commitAll(this.deps.dataDir, `mcp(${name}): remove`, author);
  }

  /** The launch spec of one server, with its variables resolved (for a connection test). */
  specOf(name: string): { spec: McpServerSpec; missing: string[] } | null {
    const s = this.servers()[name];
    if (!s) return null;
    const env = this.deps.env ?? process.env;
    if (s.url) {
      const { values, missing } = resolveTemplates(s.headers ?? {}, {
        secret: (n) => this.deps.secrets?.get(n) ?? null,
        env,
      });
      return { spec: { type: "http", url: s.url, headers: values }, missing };
    }
    const { values, missing } = resolveEnv(s.env ?? {}, {
      secret: (n) => this.deps.secrets?.get(n) ?? null,
      env,
    });
    return {
      spec: {
        type: "stdio",
        command: s.command ?? "",
        args: s.args ?? [],
        env: { ...proxyEnv(env), ...values },
      },
      missing,
    };
  }
}
