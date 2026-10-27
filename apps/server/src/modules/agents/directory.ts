import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import { ORCHESTRATOR_DEFAULT } from "./defaults";
import { type AgentProfile, ProfileError, parseAgentFile, serializeAgentFile } from "./profiles";

export interface AgentDirectory {
  get(handle: string): Promise<AgentProfile | null>;
  list(): Promise<AgentProfile[]>;
  create(profile: AgentProfile): Promise<AgentProfile>;
  /** Overwrites an existing profile (callers commit as part of a larger change). */
  update(profile: AgentProfile): Promise<void>;
}

/**
 * Agent profiles as files in the user data directory, the source of truth (CLAUDE.md rule 3).
 * Every change is a git commit in the data repo (rule 10).
 */
export class FileAgentDirectory implements AgentDirectory {
  private readonly root: string;

  constructor(private readonly dataDir: string) {
    this.root = join(dataDir, "agents");
  }

  /** Writes the default orchestrator profile if it does not exist yet. */
  async seed(): Promise<void> {
    if (existsSync(this.fileOf(ORCHESTRATOR_DEFAULT.handle))) return;
    this.write(ORCHESTRATOR_DEFAULT);
    await commitAll(this.dataDir, "feat(agents): add orchestrator");
  }

  async get(handle: string): Promise<AgentProfile | null> {
    const file = this.fileOf(handle);
    if (!existsSync(file)) return null;
    try {
      return parseAgentFile(handle, readFileSync(file, "utf8"));
    } catch (error) {
      log.error("invalid agent profile", { agent: handle, error: errorMessage(error) });
      return null;
    }
  }

  async list(): Promise<AgentProfile[]> {
    if (!existsSync(this.root)) return [];
    const handles = readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const profiles = await Promise.all(handles.map((handle) => this.get(handle)));
    return profiles.filter((p): p is AgentProfile => p !== null);
  }

  async create(profile: AgentProfile): Promise<AgentProfile> {
    if (existsSync(this.fileOf(profile.handle))) {
      throw new ProfileError(`@${profile.handle} already exists`);
    }
    this.write(profile);
    await commitAll(
      this.dataDir,
      `feat(agents): add @${profile.handle} (${profile.role.slice(0, 60)})`,
      "orchestrator",
    );
    return profile;
  }

  async update(profile: AgentProfile): Promise<void> {
    if (!existsSync(this.fileOf(profile.handle)))
      throw new ProfileError(`@${profile.handle} does not exist`);
    this.write(profile);
  }

  private write(profile: AgentProfile): void {
    mkdirSync(join(this.root, profile.handle), { recursive: true });
    writeFileSync(this.fileOf(profile.handle), serializeAgentFile(profile));
  }

  private fileOf(handle: string): string {
    return join(this.root, handle, "agent.md");
  }
}

/** In-memory directory for tests. */
export class MemoryAgentDirectory implements AgentDirectory {
  private readonly profiles = new Map<string, AgentProfile>();

  constructor(initial: AgentProfile[] = [ORCHESTRATOR_DEFAULT]) {
    for (const p of initial) this.profiles.set(p.handle, p);
  }

  async get(handle: string) {
    return this.profiles.get(handle) ?? null;
  }

  async list() {
    return [...this.profiles.values()];
  }

  async create(profile: AgentProfile) {
    if (this.profiles.has(profile.handle))
      throw new ProfileError(`@${profile.handle} already exists`);
    this.profiles.set(profile.handle, profile);
    return profile;
  }

  async update(profile: AgentProfile) {
    if (!this.profiles.has(profile.handle))
      throw new ProfileError(`@${profile.handle} does not exist`);
    this.profiles.set(profile.handle, profile);
  }
}
