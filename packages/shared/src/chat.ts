/**
 * Chat domain types shared by server and client (docs/SPEC.md sections 2, 5 and 6).
 * Ids are the record keys without the table prefix.
 */
import type { ModuleStates } from "./modules";
import type { BarEdge, BarMode, WindowStyle } from "./wm";

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
  | "extension_install"
  | "pack_install"
  | "agent_change"
  | "budget_change"
  | "app_create"
  | "app_change"
  | "app_data_delete";
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
  /** The topic it belongs to; null is the chat's "General" (ADR 0024). */
  topicId: string | null;
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

/** A thread of a chat, like a Telegram forum topic. "General" is implicit (topicId null). */
export interface Topic {
  id: string;
  chatId: string;
  title: string;
  /** Closed topics are read-only until reopened. */
  closed: boolean;
  createdAt: string;
}

export const GENERAL_TOPIC_TITLE = "General";
export const MAX_TOPIC_TITLE = 60;

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
  /** Limits; null means none. A run stops the project when either is reached (rule 8). */
  budgetUsd: number | null;
  budgetTokens: number | null;
  /** Estimated at API prices: under a subscription nobody is billed this (ADR 0023). */
  spentUsd: number;
  /** Input and output tokens of all runs, the measure that matters under a subscription. */
  spentTokens: number;
  /** Where agents' shell commands run: the host (with the OS sandbox) or the project's container. */
  isolation: ProjectIsolation;
  /** Extension pinned as the project's app: it opens next to the project chat (ADR 0021). */
  app: string | null;
  /** "app": the workspace is an app's code, changed through its chat with approval (ADR 0024). */
  kind: ProjectKind;
  createdAt: string;
}

export type ProjectIsolation = "host" | "container";

export type ProjectKind = "project" | "app";

/** App ids are extension ids: a letter, then letters, digits and dashes. */
export const APP_ID_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;

/** Engines billed by their API, where a dollar limit is real money (ADR 0023). */
export const PAID_ENGINES = ["openrouter", "openai-compatible"] as const;

/** 1234 → "1.2K", 2500000 → "2.5M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${trimZero((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${trimZero((n / 1_000).toFixed(1))}K`;
  return String(Math.round(n));
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/** A budget in words: "2M tokens", "$5.00", both, or "no limit". */
export function budgetText(budget: { usd: number | null; tokens: number | null }): string {
  const parts = [
    budget.tokens !== null ? `${formatTokens(budget.tokens)} tokens` : "",
    budget.usd !== null ? `$${budget.usd.toFixed(2)}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" and ") : "no limit";
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
  rail: RailLayout;
  /** How tiles look and the shortcuts' Mod key (ADR 0028). */
  wm: WindowStyle;
}

/** Order and visibility of the navigation rail's items, by key ("skills", "ext:<id>", …). */
export interface RailLayout {
  order: string[];
  hidden: string[];
  /** The screen edge the bar sits on (ADR 0028). */
  edge: BarEdge;
  /** Aura's own bar, the user's bar app (its code, ADR 0029), or no bar. */
  mode: BarMode;
}

/** Rail items that cannot be hidden, so the user can always get back to the settings. */
export const RAIL_PINNED = ["chats", "customize"];

export type ExtensionPermission =
  | "chat.read"
  | "chat.write"
  | "ui.panel"
  /** Be Aura's bar (only the app "bar", ADR 0029). */
  | "ui.bar"
  | "alerts.read"
  | "storage"
  | "net"
  | "agents.ask"
  | "files.read"
  | "apps.call";

/** Icons an extension may name in its manifest (lucide names the app ships). */
export const EXTENSION_ICONS = [
  "blocks",
  "bell",
  "book-open",
  "bot",
  "bug",
  "calendar",
  "chart-bar",
  "chart-line",
  "check-square",
  "clipboard-list",
  "clock",
  "cloud",
  "code",
  "database",
  "file-text",
  "folder",
  "gauge",
  "git-branch",
  "globe",
  "heart-pulse",
  "inbox",
  "kanban",
  "layout-dashboard",
  "list-todo",
  "mail",
  "map",
  "megaphone",
  "notebook-pen",
  "package",
  "rocket",
  "search",
  "server",
  "shield",
  "shopping-cart",
  "sticky-note",
  "table",
  "terminal",
  "ticket",
  "users",
  "wallet",
  "wrench",
  "zap",
] as const;

export type ExtensionIcon = (typeof EXTENSION_ICONS)[number];

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  permissions: ExtensionPermission[];
  author: string;
  /** One of EXTENSION_ICONS, or null for the default. */
  icon: ExtensionIcon | null;
  /** Hosts it may reach through the server (`net`), as granted at install. */
  hosts: string[];
  /** Stored secrets the server may put into its requests, by name; values never reach it. */
  secrets: string[];
  /** Set for an app built in Aura (ADR 0024): its chat, live version and unapproved changes. */
  app: { chatId: string; revision: string; draft: boolean } | null;
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
  /** Built-in apps that are on (ADR 0027). */
  modules: ModuleStates;
  extensions: ExtensionInfo[];
  mcpServers: McpServerInfo[];
}
