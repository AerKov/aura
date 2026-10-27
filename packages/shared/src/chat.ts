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

/** Structured message payloads. More card types arrive with later phases. */
export type Card = {
  type: "run";
  agent: string;
  status: "running" | "done" | "error" | "stopped";
  tools: { name: string; summary: string; isError: boolean }[];
  usage: Usage | null;
  error: string | null;
};

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
