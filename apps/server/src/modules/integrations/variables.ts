import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import type { AgentDirectory } from "../agents/directory";
import { validateEnvMap } from "./env";

export class VariableSetError extends Error {
  override name = "VariableSetError";
}

export interface VariableSet {
  /** Variables: plain values or `${secret:…}` / `${env:…}` references. */
  env: Record<string, string>;
  /** Agents whose commands get these variables. */
  agents: string[];
}

const NAME = /^[a-z][a-z0-9_-]{1,31}$/;

/**
 * Shared variables for agents' commands (ADR 0020): one set per service a CLI or script talks to
 * (a tracker, a git host, a database), granted to several agents at once. In
 * `<dataDir>/integrations/variables.json`, committed, with secrets only as references.
 */
export class VariableSets {
  constructor(
    private readonly deps: {
      dataDir: string;
      agents: AgentDirectory;
    },
  ) {}

  private get file(): string {
    return join(this.deps.dataDir, "integrations", "variables.json");
  }

  list(): Record<string, VariableSet> {
    if (!existsSync(this.file)) return {};
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.file, "utf8"));
    } catch (error) {
      log.error("invalid integrations/variables.json", { error: errorMessage(error) });
      return {};
    }
    const sets = (raw as { sets?: Record<string, unknown> } | null)?.sets ?? {};
    const out: Record<string, VariableSet> = {};
    for (const [name, value] of Object.entries(sets)) {
      try {
        out[name] = validateSet(name, value);
      } catch (error) {
        log.error("invalid variable set", { name, error: errorMessage(error) });
      }
    }
    return out;
  }

  /** The variables an agent gets from shared sets, in the order the sets are listed. */
  forAgent(handle: string): { env: Record<string, string>; from: Record<string, string> } {
    const env: Record<string, string> = {};
    const from: Record<string, string> = {};
    for (const [name, set] of Object.entries(this.list())) {
      if (!set.agents.includes(handle)) continue;
      for (const [key, value] of Object.entries(set.env)) {
        env[key] = value;
        from[key] = name;
      }
    }
    return { env, from };
  }

  async save(name: string, raw: unknown, author = "owner"): Promise<void> {
    const set = validateSet(name, raw);
    for (const handle of set.agents) {
      if (!(await this.deps.agents.get(handle)))
        throw new VariableSetError(`@${handle} does not exist`);
    }
    const sets = this.list() as Record<string, VariableSet>;
    sets[name] = set;
    this.write(sets);
    await commitAll(
      this.deps.dataDir,
      `integrations(${name}): variables ${Object.keys(set.env).join(", ") || "none"} for ${set.agents.map((a) => `@${a}`).join(", ") || "no agent"}`,
      author,
    );
  }

  async remove(name: string, author = "owner"): Promise<void> {
    const sets = this.list();
    if (!(name in sets)) throw new VariableSetError(`No variable set "${name}"`);
    delete sets[name];
    this.write(sets);
    await commitAll(this.deps.dataDir, `integrations(${name}): remove variables`, author);
  }

  private write(sets: Record<string, VariableSet>): void {
    mkdirSync(join(this.deps.dataDir, "integrations"), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify({ sets }, null, 2)}\n`);
  }
}

function validateSet(name: string, value: unknown): VariableSet {
  if (!NAME.test(name))
    throw new VariableSetError(`"${name}" must be 2-32 chars: lowercase letters, digits, - or _`);
  if (!value || typeof value !== "object") throw new VariableSetError(`${name}: must be an object`);
  const v = value as Record<string, unknown>;
  const env = validateEnvMap(v.env, (message) => new VariableSetError(`${name}: ${message}`));
  if (Object.keys(env).length === 0)
    throw new VariableSetError(`${name}: add at least one variable`);
  const agents = v.agents ?? [];
  if (!Array.isArray(agents) || !agents.every((a) => typeof a === "string"))
    throw new VariableSetError(`${name}: agents must be a list of handles`);
  return { env, agents: [...new Set(agents as string[])] };
}
