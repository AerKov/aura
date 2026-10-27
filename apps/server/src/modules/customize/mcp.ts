import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServerInfo } from "@aura/shared";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import type { McpServerSpec } from "../../providers/types";
import type { AgentDirectory } from "../agents/directory";
import type { ApprovalRecord, ApprovalService } from "../approvals/service";

export class McpError extends Error {
  override name = "McpError";
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  /** Values must be `${env:NAME}` references: secrets never go into the git repo. */
  env?: Record<string, string>;
  url?: string;
  agents: string[];
}

const NAME = /^[a-z][a-z0-9_-]{1,31}$/;
const ENV_REF = /^\$\{env:([A-Z_][A-Z0-9_]*)\}$/;

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
    return { url: v.url, agents };
  }
  if (typeof v.command !== "string" || !v.command.trim())
    throw new McpError(`${name}: command or url is required`);
  const args = v.args ?? [];
  if (!Array.isArray(args) || !args.every((a) => typeof a === "string"))
    throw new McpError(`${name}: args must be strings`);
  const env = (v.env ?? {}) as Record<string, unknown>;
  for (const [key, val] of Object.entries(env)) {
    if (typeof val !== "string" || !ENV_REF.test(val)) {
      throw new McpError(
        `${name}: env.${key} must be a reference like \${env:${key}}; secrets are not stored in files`,
      );
    }
  }
  return { command: v.command, args: args as string[], env: env as Record<string, string>, agents };
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
        out[name] = { type: "http", url: s.url };
      } else if (s.command) {
        const resolved: Record<string, string> = {};
        for (const [key, ref] of Object.entries(s.env ?? {})) {
          const varName = ENV_REF.exec(ref)?.[1];
          const value = varName ? env[varName] : undefined;
          if (value !== undefined) resolved[key] = value;
        }
        out[name] = { type: "stdio", command: s.command, args: s.args ?? [], env: resolved };
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
          : "**Runs this command on your computer:**",
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
    const name = String(payload.name);
    const config = validateServer(name, payload.config);
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
}
