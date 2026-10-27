import { api, call } from "@/lib/api";
import { getState, mergeMessages, setState, upsertChat, upsertMessage } from "./store";

export async function loadInitial(): Promise<void> {
  const [me, chats] = await Promise.all([call(() => api.me.get()), call(() => api.chats.get())]);
  setState((s) => ({
    me,
    chats: Object.fromEntries(chats.map((c) => [c.id, c])),
    activeChatId:
      s.activeChatId ?? chats.find((c) => c.kind === "direct")?.id ?? chats[0]?.id ?? null,
  }));
}

export async function loadMessages(chatId: string): Promise<void> {
  const messages = await call(() => api.chats({ chatId }).messages.get({ query: { limit: 100 } }));
  setState((s) => ({
    messages: { ...s.messages, [chatId]: mergeMessages(s.messages[chatId], messages) },
  }));
}

/** After a reconnect: refresh chats and every chat whose messages are loaded. */
export async function resync(): Promise<void> {
  await loadInitial();
  await Promise.all(Object.keys(getState().messages).map((chatId) => loadMessages(chatId)));
}

export async function sendMessage(
  chatId: string,
  body: string,
  replyTo: string | null,
): Promise<void> {
  const message = await call(() => api.chats({ chatId }).messages.post({ body, replyTo }));
  upsertMessage(message);
}

export function openChat(chatId: string): void {
  setState(() => ({ activeChatId: chatId }));
  if (!getState().messages[chatId]) void loadMessages(chatId).catch(reportError);
}

export { upsertChat };

export function reportError(error: unknown): void {
  console.error("crew:", error instanceof Error ? error.message : error);
}
