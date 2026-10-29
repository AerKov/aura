import {
  type Appearance,
  type AppRef,
  type Chat,
  type CustomizeState,
  defaultLayout,
  type Layout,
  type Message,
  type Participant,
  type Project,
  type Task,
  type Topic,
} from "@aura/shared";
import { useSyncExternalStore } from "react";

export type Connection = "connecting" | "open" | "closed";

/** An agent as the composer shows it in @mention suggestions. */
export interface AgentInfo {
  handle: string;
  name: string;
  role: string;
}

export interface ChatState {
  me: { id: string; name: string } | null;
  chats: Record<string, Chat>;
  /** Messages per chat, sorted by id (ids are time-ordered UUIDv7). */
  messages: Record<string, Message[]>;
  /** Live text of messages that are still streaming, by message id. */
  streaming: Record<string, string>;
  connection: Connection;
  serverVersion: string | null;
  activeChatId: string | null;
  /** Status of the default agent engine (ADR 0011). */
  provider:
    | (({ ok: true; detail?: string } | { ok: false; reason: string }) & { engine: string })
    | null;
  projects: Record<string, Project>;
  members: Record<string, Participant[]>;
  agents: Record<string, AgentInfo>;
  tasks: Record<string, Task[]>;
  /** Topics per chat (ADR 0024); General is implicit. */
  topics: Record<string, Topic[]>;
  /** The open topic per chat; absent or null: General. */
  activeTopic: Record<string, string | null>;
  /** The shell: which apps are open as tiles (ADR 0024). */
  layout: Layout;
  /** On a phone: the one app on screen (not saved; the tiles stay as the desktop left them). */
  phoneApp: AppRef | null;
  /** Apps showing their changes that wait for approval instead of the live version. */
  previewDraft: Record<string, boolean>;
  /** Apps whose chat is open as a panel inside their tile (ADR 0027). */
  appChat: Record<string, boolean>;
  /** Why the bar app is not shown (it failed), so the built-in bar stands in (ADR 0029). */
  barFailed: string | null;
  /** The "My apps" menu next to the bar, and the "New app" sheet (ADR 0034). */
  menuOpen: boolean;
  addOpen: boolean;
  /** On narrow screens the messenger shows one pane: the chat list or a chat. */
  pane: "list" | "main";
  needsPairing: boolean;
  appearance: Appearance | null;
  customize: CustomizeState | null;
}

let state: ChatState = {
  me: null,
  chats: {},
  messages: {},
  streaming: {},
  connection: "connecting",
  serverVersion: null,
  activeChatId: null,
  provider: null,
  projects: {},
  members: {},
  agents: {},
  tasks: {},
  topics: {},
  activeTopic: {},
  layout: defaultLayout(),
  phoneApp: null,
  previewDraft: {},
  appChat: {},
  barFailed: null,
  menuOpen: false,
  addOpen: false,
  appearance: null,
  customize: null,
  pane: "list",
  needsPairing: false,
};

const listeners = new Set<() => void>();

export function getState(): ChatState {
  return state;
}

export function setState(update: (prev: ChatState) => Partial<ChatState>): void {
  state = { ...state, ...update(state) };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribes a component to a slice of the store. The selector must return stable references. */
export function useChatStore<T>(selector: (s: ChatState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** Inserts or replaces messages, keeping the list sorted by id. */
export function mergeMessages(existing: Message[] | undefined, incoming: Message[]): Message[] {
  const byId = new Map((existing ?? []).map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function upsertMessage(message: Message): void {
  setState((s) => {
    const streaming = { ...s.streaming };
    if (message.status !== "streaming") delete streaming[message.id];
    return {
      messages: {
        ...s.messages,
        [message.chatId]: mergeMessages(s.messages[message.chatId], [message]),
      },
      streaming,
    };
  });
}

/** A chat deleted with its app (ADR 0033): gone from the list and, if open, closed. */
export function removeChat(chatId: string): void {
  setState((s) => {
    const { [chatId]: _chat, ...chats } = s.chats;
    const { [chatId]: _messages, ...messages } = s.messages;
    return {
      chats,
      messages,
      activeChatId: s.activeChatId === chatId ? null : s.activeChatId,
      pane: s.activeChatId === chatId ? "list" : s.pane,
    };
  });
}

export function upsertChat(chat: Chat): void {
  setState((s) => ({ chats: { ...s.chats, [chat.id]: chat } }));
}

export function appendDelta(messageId: string, text: string): void {
  setState((s) => ({
    streaming: { ...s.streaming, [messageId]: (s.streaming[messageId] ?? "") + text },
  }));
}

export function removeMessage(chatId: string, messageId: string): void {
  setState((s) => {
    const streaming = { ...s.streaming };
    delete streaming[messageId];
    return {
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).filter((m) => m.id !== messageId),
      },
      streaming,
    };
  });
}
