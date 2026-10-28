import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Skill, SkillVersion } from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { unifiedDiff } from "../../lib/diff";
import { commitAll, git } from "../../lib/git";
import type { AgentDirectory } from "../agents/directory";
import { type AgentProfile, SKILL_NAME_PATTERN } from "../agents/profiles";
import type { ApprovalRecord, ApprovalService } from "../approvals/service";

export class SkillError extends Error {
  override name = "SkillError";
}

const MAX_SKILL = 30_000;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface SkillChange {
  name: string;
  content: string;
  reason: string;
  attachTo: string[];
}

/** Reads `description` and the instructions from a SKILL.md; throws when the format is wrong. */
export function parseSkill(name: string, text: string): { description: string; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new SkillError(`skills/${name}/SKILL.md needs frontmatter with a description`);
  const meta: unknown = Bun.YAML.parse(match[1] ?? "");
  const description = (meta as { description?: unknown } | null)?.description;
  if (typeof description !== "string" || !description.trim()) {
    throw new SkillError(`skills/${name}/SKILL.md needs a description in its frontmatter`);
  }
  return { description: description.trim(), body: (match[2] ?? "").trim() };
}

/**
 * Skills: versioned folders `skills/<name>/SKILL.md` in the user data repo (docs/SPEC.md section 9).
 * Every change goes through an approval with a diff; versions are git commits; rollback restores one.
 */
export class SkillService {
  constructor(
    private readonly deps: {
      db: Surreal;
      dataDir: string;
      agents: AgentDirectory;
      approvals: ApprovalService;
    },
  ) {
    deps.approvals.register("skill_change", async (payload, ctx) =>
      this.apply(payload as unknown as SkillChange, ctx.requestedBy),
    );
  }

  private fileOf(name: string): string {
    return join(this.deps.dataDir, "skills", name, "SKILL.md");
  }

  read(name: string): string | null {
    const file = this.fileOf(name);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  }

  async list(): Promise<Skill[]> {
    const root = join(this.deps.dataDir, "skills");
    if (!existsSync(root)) return [];
    const names = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && SKILL_NAME_PATTERN.test(e.name))
      .map((e) => e.name)
      .sort();
    const agents = await this.deps.agents.list();
    return Promise.all(names.map((name) => this.describe(name, agents)));
  }

  private async describe(name: string, agents: AgentProfile[]): Promise<Skill> {
    let description = "";
    try {
      description = parseSkill(name, this.read(name) ?? "").description;
    } catch {
      description = "(invalid SKILL.md)";
    }
    const [rows] = await this.deps.db
      .query<[{ active_ref: string }[]]>("SELECT active_ref FROM skill_index WHERE id = $id", {
        id: new RecordId("skill_index", name),
      })
      .collect();
    return {
      name,
      description,
      agents: agents.filter((a) => a.skills.includes(name)).map((a) => a.handle),
      activeRef: rows?.[0]?.active_ref ?? null,
      versions: await this.versions(name),
    };
  }

  async versions(name: string): Promise<SkillVersion[]> {
    const log = await git(this.deps.dataDir, [
      "log",
      "--format=%h%x1f%s%x1f%cI",
      "--",
      `skills/${name}/SKILL.md`,
    ]);
    return log
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [ref = "", subject = "", date = ""] = line.split("\x1f");
        return { ref, subject, date };
      });
  }

  /** Validates a proposed change and asks the user to approve it, with a diff as the preview. */
  async propose(
    change: SkillChange,
    by: { requestedBy: string; chatId: string; topicId?: string | null },
  ): Promise<ApprovalRecord> {
    if (!SKILL_NAME_PATTERN.test(change.name)) {
      throw new SkillError("skill name must be 2-48 chars: lowercase letters, digits, dashes");
    }
    if (change.content.length > MAX_SKILL)
      throw new SkillError(`SKILL.md is longer than ${MAX_SKILL} chars`);
    parseSkill(change.name, change.content);
    const reason = change.reason.trim();
    if (!reason) throw new SkillError("a reason is required");
    for (const handle of change.attachTo) {
      if (!(await this.deps.agents.get(handle))) throw new SkillError(`@${handle} does not exist`);
    }

    const before = this.read(change.name) ?? "";
    const diff = unifiedDiff(before, change.content, `skills/${change.name}/SKILL.md`);
    if (!diff && change.attachTo.length === 0)
      throw new SkillError("the proposed content is identical");
    const attach =
      change.attachTo.length > 0
        ? `\n\nAttach to: ${change.attachTo.map((h) => `@${h}`).join(", ")}`
        : "";
    return this.deps.approvals.request({
      kind: "skill_change",
      requestedBy: by.requestedBy,
      chatId: by.chatId,
      topicId: by.topicId,
      title: before ? `Update skill "${change.name}"` : `New skill "${change.name}"`,
      why: reason + attach,
      preview: diff ? `\`\`\`diff\n${diff}\n\`\`\`` : "_No content change._",
      payload: { ...change, content: change.content, attachTo: change.attachTo },
    });
  }

  /** Executor for an approved skill change: write, attach, commit, record the active version. */
  private async apply(change: SkillChange, author: string): Promise<string> {
    mkdirSync(join(this.deps.dataDir, "skills", change.name), { recursive: true });
    writeFileSync(
      this.fileOf(change.name),
      change.content.endsWith("\n") ? change.content : `${change.content}\n`,
    );
    for (const handle of change.attachTo) {
      const profile = await this.deps.agents.get(handle);
      if (profile && !profile.skills.includes(change.name)) {
        await this.deps.agents.update({ ...profile, skills: [...profile.skills, change.name] });
      }
    }
    await commitAll(
      this.deps.dataDir,
      `skill(${change.name}): ${change.reason.split("\n")[0]?.slice(0, 60)}`,
      author,
    );
    const ref = await git(this.deps.dataDir, ["rev-parse", "--short", "HEAD"]);
    await this.setActive(change.name, ref);
    return `Skill "${change.name}" is now at ${ref}.`;
  }

  /** Restores the skill as it was at `ref` (user action from the UI; it is itself a new commit). */
  async rollback(name: string, ref: string): Promise<string> {
    if (!SKILL_NAME_PATTERN.test(name) || !/^[0-9a-f]{4,40}$/.test(ref))
      throw new SkillError("invalid skill or version");
    if (!(await this.versions(name)).some((v) => v.ref.startsWith(ref) || ref.startsWith(v.ref))) {
      throw new SkillError(`${ref} is not a version of "${name}"`);
    }
    const content = await git(this.deps.dataDir, ["show", `${ref}:skills/${name}/SKILL.md`]);
    writeFileSync(this.fileOf(name), `${content}\n`);
    const commit = await commitAll(
      this.deps.dataDir,
      `skill(${name}): roll back to ${ref}`,
      "owner",
    );
    const head = commit ?? (await git(this.deps.dataDir, ["rev-parse", "--short", "HEAD"]));
    await this.setActive(name, head);
    return head;
  }

  /** Instructions of an agent's skills, for its system prompt. Skills are user-approved. */
  promptFor(profile: AgentProfile): string {
    const sections: string[] = [];
    for (const name of profile.skills) {
      const text = this.read(name);
      if (!text) continue;
      try {
        const { description, body } = parseSkill(name, text);
        sections.push(`### ${name}\n_${description}_\n\n${body}`);
      } catch {
        // An invalid skill file is skipped; it shows as invalid in the skills list.
      }
    }
    return sections.length > 0 ? `\n\n## Skills\n${sections.join("\n\n")}` : "";
  }

  private async setActive(name: string, ref: string): Promise<void> {
    await this.deps.db
      .query("UPSERT $id SET active_ref = $ref, updated_at = time::now()", {
        id: new RecordId("skill_index", name),
        ref,
      })
      .collect();
  }
}
