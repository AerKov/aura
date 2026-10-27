import { type EngineId, HANDLE_PATTERN, isEngineId, MODEL_ID_PATTERN } from "@aura/shared";

/** An agent profile, stored as `<dataDir>/agents/<handle>/agent.md` (docs/SPEC.md section 5). */
export interface AgentProfile {
  handle: string;
  name: string;
  role: string;
  /** What runs the agent (ADR 0011). null means the default engine from Engines settings. */
  engine: EngineId | null;
  model: string | null;
  systemPrompt: string;
  /** Built-in Claude Code tools. Empty for chat-only agents. */
  builtinTools: BuiltinTool[];
  /** Spend limit across all runs of this agent, in USD. null means no agent-level limit. */
  budgetUsd: number | null;
  /** Names of skills (folders in `skills/`) attached to this agent. */
  skills: string[];
}

export const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;

/**
 * Built-in tools an agent may be granted. File tools are confined to the project workspace; web tools
 * bring external content, which agents treat as data.
 */
export const BUILTIN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "WebSearch",
  "WebFetch",
] as const;
export type BuiltinTool = (typeof BUILTIN_TOOLS)[number];

export const ORCHESTRATOR_HANDLE = "orchestrator";

export class ProfileError extends Error {
  override name = "ProfileError";
}

const MAX_PROMPT = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates untrusted profile fields (from a file or from an agent's tool call). */
export function validateProfile(input: {
  handle: unknown;
  name: unknown;
  role: unknown;
  engine?: unknown;
  model?: unknown;
  systemPrompt: unknown;
  tools?: unknown;
  budgetUsd?: unknown;
  skills?: unknown;
}): AgentProfile {
  const { handle, name, role, engine, model, systemPrompt, tools, budgetUsd, skills } = input;
  if (typeof handle !== "string" || !HANDLE_PATTERN.test(handle)) {
    throw new ProfileError(
      "handle must be 2-32 chars: lowercase letters, digits, - or _, starting with a letter",
    );
  }
  if (typeof name !== "string" || !name.trim() || name.length > 60)
    throw new ProfileError("name is required (max 60 chars)");
  if (typeof role !== "string" || !role.trim() || role.length > 300)
    throw new ProfileError("role is required (max 300 chars)");
  if (
    model !== undefined &&
    model !== null &&
    (typeof model !== "string" || !MODEL_ID_PATTERN.test(model))
  ) {
    throw new ProfileError("model must be a model id like claude-sonnet-5-5 or qwen3:8b");
  }
  if (engine !== undefined && engine !== null && !isEngineId(engine)) {
    throw new ProfileError("engine must be claude-code, openrouter, ollama or openai-compatible");
  }
  if (
    typeof systemPrompt !== "string" ||
    !systemPrompt.trim() ||
    systemPrompt.length > MAX_PROMPT
  ) {
    throw new ProfileError(`system prompt is required (max ${MAX_PROMPT} chars)`);
  }
  const toolList = tools ?? [];
  if (
    !Array.isArray(toolList) ||
    !toolList.every((t) => (BUILTIN_TOOLS as readonly unknown[]).includes(t))
  ) {
    throw new ProfileError(`tools must be a subset of ${BUILTIN_TOOLS.join(", ")}`);
  }
  if (
    budgetUsd !== undefined &&
    budgetUsd !== null &&
    (typeof budgetUsd !== "number" ||
      !Number.isFinite(budgetUsd) ||
      budgetUsd <= 0 ||
      budgetUsd > 1000)
  ) {
    throw new ProfileError("budget must be a positive number of USD (max 1000)");
  }
  const skillList = skills ?? [];
  if (
    !Array.isArray(skillList) ||
    !skillList.every((x) => typeof x === "string" && SKILL_NAME_PATTERN.test(x))
  ) {
    throw new ProfileError(
      "skills must be a list of skill names (lowercase letters, digits, dashes)",
    );
  }
  return {
    handle,
    name: name.trim(),
    role: role.trim(),
    engine: isEngineId(engine) ? engine : null,
    model: typeof model === "string" ? model : null,
    systemPrompt: systemPrompt.trim(),
    builtinTools: [...new Set(toolList as BuiltinTool[])],
    budgetUsd: typeof budgetUsd === "number" ? budgetUsd : null,
    skills: [...new Set(skillList as string[])],
  };
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Parses `agent.md`: YAML frontmatter (name, role, engine, model, tools, budget_usd) + system prompt body. */
export function parseAgentFile(handle: string, text: string): AgentProfile {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new ProfileError(`agents/${handle}/agent.md has no frontmatter`);
  let meta: unknown;
  try {
    meta = Bun.YAML.parse(match[1] ?? "");
  } catch (error) {
    throw new ProfileError(`agents/${handle}/agent.md has invalid frontmatter: ${String(error)}`);
  }
  if (!isRecord(meta))
    throw new ProfileError(`agents/${handle}/agent.md frontmatter must be a mapping`);
  return validateProfile({
    handle,
    name: meta.name,
    role: meta.role,
    engine: meta.engine,
    model: meta.model,
    systemPrompt: match[2] ?? "",
    tools: meta.tools,
    budgetUsd: meta.budget_usd,
    skills: meta.skills,
  });
}

/** Serializes a profile. Values are written as JSON, which is valid YAML. */
export function serializeAgentFile(profile: AgentProfile): string {
  const lines = [
    "---",
    `name: ${JSON.stringify(profile.name)}`,
    `role: ${JSON.stringify(profile.role)}`,
    ...(profile.engine ? [`engine: ${JSON.stringify(profile.engine)}`] : []),
    ...(profile.model ? [`model: ${JSON.stringify(profile.model)}`] : []),
    `tools: ${JSON.stringify(profile.builtinTools)}`,
    ...(profile.budgetUsd !== null ? [`budget_usd: ${profile.budgetUsd}`] : []),
    ...(profile.skills.length > 0 ? [`skills: ${JSON.stringify(profile.skills)}`] : []),
    "---",
    "",
    profile.systemPrompt,
    "",
  ];
  return lines.join("\n");
}
