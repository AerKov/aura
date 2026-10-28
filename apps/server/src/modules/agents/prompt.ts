import { sandboxNote } from "../sandbox/service";
import { userNote } from "./context";
import { teamRules } from "./defaults";
import { type AgentProfile, ORCHESTRATOR_HANDLE } from "./profiles";

/** Where a part of an agent's system prompt comes from (ADR 0032). */
export type PromptSource =
  | "profile"
  | "team"
  | "skills"
  | "guide"
  | "sandbox"
  | "environment"
  | "memory"
  | "user";

/** One part of the system prompt an agent runs with, in order. */
export interface PromptPart {
  source: PromptSource;
  /** What the part is, for the Agents page. */
  title: string;
  text: string;
}

/** A note from agent memory that was put into a run's prompt. */
export interface InjectedNote {
  id: string;
  text: string;
}

/**
 * The full system prompt of one run, as parts: the agent's own prompt from `agent.md`, then what
 * Aura adds at run time. The runtime joins them; the Agents page shows them one by one.
 */
export function systemPromptParts(input: {
  profile: AgentProfile;
  /** Team members when the run is in a project chat; null outside projects. */
  team: string[] | null;
  extras: PromptPart[];
  sandbox: boolean;
  env: { values: Record<string, string>; missing: string[] };
  memory: string;
  ownerName: string;
  language: string | null;
}): PromptPart[] {
  const { profile } = input;
  const parts: PromptPart[] = [
    {
      source: "profile",
      title: `Its prompt (agents/${profile.handle}/agent.md)`,
      text: profile.systemPrompt,
    },
  ];
  if (input.team && profile.handle !== ORCHESTRATOR_HANDLE)
    parts.push({
      source: "team",
      title: "Team rules, in project chats",
      text: `\n${teamRules(profile.handle, input.team)}`,
    });
  parts.push(...input.extras);
  if (input.sandbox) parts.push({ source: "sandbox", title: "Shell sandbox", text: sandboxNote() });
  const env = envNote(input.env);
  if (env) parts.push({ source: "environment", title: "Its variables", text: env });
  if (input.memory)
    parts.push({ source: "memory", title: "Notes from memory", text: input.memory });
  const user = userNote(input.ownerName, input.language);
  if (user) parts.push({ source: "user", title: "The user's language", text: user });
  return parts.filter((p) => p.text.trim() !== "");
}

export function joinPrompt(parts: PromptPart[]): string {
  return parts.map((p) => p.text).join("");
}

/** What an agent with a shell is told about its own variables; values are never in the prompt. */
export function envNote(env: { values: Record<string, string>; missing: string[] }): string {
  const names = Object.keys(env.values);
  if (names.length === 0 && env.missing.length === 0) return "";
  return `

## Your environment
${names.length > 0 ? `Your shell commands get these variables: ${names.join(", ")}. Use them by name (for example $${names[0]}); never print their values.` : ""}${env.missing.length > 0 ? ` These variables are configured but have no value: ${env.missing.join(", ")}. If you need them, ask the user to set them under Secrets on the Agents page.` : ""}`;
}
