import type {
  Appearance,
  Chat,
  CustomizeState,
  Message,
  Participant,
  Project,
  SettingsTab,
} from "@aura/shared";
import { useSyncExternalStore } from "react";
import type { FileRequest } from "@/features/files/picker";

export type Connection = "connecting" | "open" | "closed";

/** An agent as the composer shows it in @mention suggestions. */
export interface AgentInfo {
  handle: string;
  name: string;
  role: string;
}

/** What fills the screen beside the sidebar (ADR 0042). */
export type View =
  | { kind: "helper" }
  | { kind: "app"; id: string }
  | { kind: "settings"; tab: SettingsTab };

/** What the viewer shows: a name, a type, and how to get the bytes. */
export interface FileView {
  name: string;
  type: string;
  load: () => Promise<Blob>;
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
  /** Status of the default agent engine (ADR 0011). */
  provider:
    | (({ ok: true; detail?: string } | { ok: false; reason: string }) & { engine: string })
    | null;
  projects: Record<string, Project>;
  members: Record<string, Participant[]>;
  agents: Record<string, AgentInfo>;
  /** What is on screen: the Helper's chat, an app with its chat, or Settings. */
  view: View;
  /** Apps showing their changes that wait for approval instead of the live version. */
  previewDraft: Record<string, boolean>;
  /** Apps whose chat beside them is hidden (it shows by default). */
  appChatHidden: Record<string, boolean>;
  /** The "New app" dialog. */
  addOpen: boolean;
  /** The file shown in the viewer window (ADR 0036). */
  viewer: FileView | null;
  /** An app is asking the user for files (ADR 0036). */
  filePicker: FileRequest | null;
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
  provider: null,
  projects: {},
  members: {},
  agents: {},
  view: { kind: "helper" },
  previewDraft: {},
  appChatHidden: {},
  addOpen: false,
  viewer: null,
  filePicker: null,
  appearance: null,
  customize: null,
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
