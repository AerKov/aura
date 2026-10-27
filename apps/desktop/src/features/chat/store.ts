import type { Chat, Message, Participant, Project, Task } from "@aura/shared";
import { useSyncExternalStore } from "react";

export type Connection = "connecting" | "open" | "closed";

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
  provider: { ok: true; detail?: string } | { ok: false; reason: string } | null;
  projects: Record<string, Project>;
  members: Record<string, Participant[]>;
  tasks: Record<string, Task[]>;
  view: "chat" | "skills" | "jobs";
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
  tasks: {},
  view: "chat",
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
