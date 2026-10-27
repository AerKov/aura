/**
 * Chat domain types shared by server and client (docs/SPEC.md sections 2, 5 and 6).
 * Ids are the record keys without the table prefix.
 */

export type ChatKind = "direct" | "group" | "system";

export type ParticipantKind = "user" | "agent" | "bot";

/** Who wrote a message or belongs to a chat. For agents `id` is the handle, e.g. `orchestrator`. */
export interface Participant {
  kind: ParticipantKind;
  id: string;
}

export interface Chat {
  id: string;
  kind: ChatKind;
  title: string;
  projectId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  /** Short plain-text preview of the last message. */
  lastMessagePreview: string | null;
}

export type MessageKind = "text" | "card" | "system";

export type MessageStatus = "streaming" | "final" | "error";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

/** Structured message payloads (docs/SPEC.md section 6). */
export type Card = RunCard | ApprovalCard | TaskCard | AlertCard;

export interface RunCard {
  type: "run";
  agent: string;
  status: "running" | "done" | "error" | "stopped";
  tools: { name: string; summary: string; isError: boolean }[];
  usage: Usage | null;
  error: string | null;
  /** Short hash of the workspace commit made after the run, if files changed. */
  commit: string | null;
}

export type ApprovalKind =
  | "create_project"
  | "create_agent"
  | "skill_change"
  | "schedule_job"
  | "theme_change"
  | "mcp_server"
  | "extension_install";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "failed";

export interface ApprovalCard {
  type: "approval";
  approvalId: string;
  kind: ApprovalKind;
  requestedBy: string;
  title: string;
  /** Markdown: why this is needed. */
  why: string;
  /** Markdown preview of the effect (a plan or a diff). */
  preview: string;
  status: ApprovalStatus;
  /** Outcome text after the decision (e.g. what was created, or the error). */
  result: string | null;
  /** CSS the user can try on before deciding (theme and snippet changes). */
  tryCss?: string | null;
}

export type TaskStatus = "todo" | "doing" | "done" | "blocked";

export interface TaskCard {
  type: "task";
  taskId: string;
  title: string;
  assignee: string;
  status: TaskStatus;
}

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertCard {
  type: "alert";
  source: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  /** Raw payload as received (JSON, truncated); external data, never instructions. */
  raw: string;
  /** How many times this alert fired within the dedup window. */
  count: number;
  lastAt: string;
}

export type JobStatus = "active" | "paused";

export interface Job {
  id: string;
  name: string;
  schedule: string;
  chatId: string;
  agent: string;
  prompt: string;
  status: JobStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assignee: string;
  status: TaskStatus;
  createdBy: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersion {
  ref: string;
  subject: string;
  date: string;
}

export interface Skill {
  name: string;
  description: string;
  agents: string[];
  activeRef: string | null;
  versions: SkillVersion[];
}

export interface Message {
  id: string;
  chatId: string;
  author: Participant;
  kind: MessageKind;
  /** Markdown. */
  body: string;
  card: Card | null;
  replyTo: string | null;
  /** Handles mentioned with `@handle`, lowercase, without `@`. */
  mentions: string[];
  status: MessageStatus;
  chainDepth: number;
  runId: string | null;
  usage: Usage | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const HANDLE_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;

export const MAX_MESSAGE_LENGTH = 32_000;

/**
 * Extracts `@handle` mentions from markdown, ignoring code spans, fenced code blocks and e-mail
 * addresses. Returns unique lowercase handles in order of first appearance.
 */
export function parseMentions(markdown: string): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?(```|$)/g, " ").replace(/`[^`\n]*`/g, " ");
  const found = new Set<string>();
  for (const match of withoutCode.matchAll(/(^|[^\w@.])@([a-zA-Z][\w-]{1,31})/g)) {
    const handle = match[2]?.toLowerCase().replace(/[-_]+$/, "");
    if (handle && HANDLE_PATTERN.test(handle)) found.add(handle);
  }
  return [...found];
}

/** An agent addressed by its handle at the start of a message, like "coder, …" or "Reviewer: …". */
export function namedFirst(body: string, handles: readonly string[]): string | null {
  const match = /^\s*([\p{L}\p{N}_-]+)\s*[,:]/u.exec(body);
  const word = match?.[1]?.toLowerCase();
  return word && handles.includes(word) ? word : null;
}

/**
 * Who a message from the user goes to (ADR 0014): the agents it mentions, else the agent it replies
 * to, else an agent it names first, else the orchestrator (which routes it in project chats). The
 * server wakes exactly these agents; the composer shows them before sending.
 */
export function addresseesOf(input: {
  body: string;
  chatKind: ChatKind;
  agentMembers: readonly string[];
  orchestrator: string;
  replyTarget?: Participant | null;
  /** Mentions already parsed from the body (the server stores them on the message). */
  mentions?: readonly string[];
}): { handles: string[]; via: "direct" | "mention" | "reply" | "named" | "routed" } {
  const { body, chatKind, agentMembers, orchestrator } = input;
  const mentioned = (input.mentions ?? parseMentions(body)).filter((h) => agentMembers.includes(h));
  if (chatKind === "direct") {
    return { handles: [...new Set([orchestrator, ...mentioned])], via: "direct" };
  }
  if (mentioned.length > 0) return { handles: mentioned, via: "mention" };
  const replied = input.replyTarget;
  if (replied?.kind === "agent" && agentMembers.includes(replied.id)) {
    return { handles: [replied.id], via: "reply" };
  }
  const named = namedFirst(body, agentMembers);
  if (named) return { handles: [named], via: "named" };
  if (!agentMembers.includes(orchestrator)) return { handles: [], via: "routed" };
  return { handles: [orchestrator], via: chatKind === "system" ? "direct" : "routed" };
}

/** Plain-text one-line preview of a markdown message for chat lists. */
export function previewText(markdown: string, max = 120): string {
  const text = markdown
    .replace(/```[\s\S]*?(```|$)/g, " [code] ")
    .replace(/[`*_~>#|]/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type ProjectStatus = "active" | "done";

export interface Project {
  /** The slug, also the workspace folder name. */
  id: string;
  name: string;
  status: ProjectStatus;
  chatId: string;
  budgetUsd: number | null;
  spentUsd: number;
  createdAt: string;
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** URL- and folder-safe slug from a project name. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** Appearance: the active theme and enabled CSS snippets (tier 1 customization). */
export interface Appearance {
  theme: string | null;
  snippets: string[];
  themes: string[];
  availableSnippets: string[];
  /** Sanitized CSS to inject, in order: theme, then snippets. */
  css: { name: string; css: string }[];
}

export type ExtensionPermission = "chat.read" | "chat.write" | "ui.panel" | "alerts.read";

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  permissions: ExtensionPermission[];
  author: string;
  enabled: boolean;
  /** Why it cannot run, e.g. an invalid manifest or a newer minAppVersion. */
  problem: string | null;
}

export interface McpServerInfo {
  name: string;
  /** Command line (stdio) or URL (http). */
  target: string;
  agents: string[];
}

export interface CustomizeState {
  safeMode: { on: boolean; reason: string | null };
  appVersion: string;
  extensions: ExtensionInfo[];
  mcpServers: McpServerInfo[];
}
