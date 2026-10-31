import type { Topic } from "@aura/shared";
import { openSettings } from "@/features/settings/open";
import { openAppRef } from "@/features/shell/layout";
import { api, call } from "@/lib/api";
import { getState, mergeMessages, setState, upsertChat, upsertMessage } from "./store";

/** Loads who the user is and, while Chats is on (ADR 0027), the chat list. */
export async function loadInitial(): Promise<void> {
  let customize = getState().customize;
  if (!customize) {
    customize = await call(() => api.customize.get());
    setState(() => ({ customize }));
  }
  const [me, chats] = await Promise.all([call(() => api.me.get()), call(() => api.chats.get())]);
  setState((s) => ({
    me,
    chats: Object.fromEntries(chats.map((c) => [c.id, c])),
    activeChatId:
      s.activeChatId ?? chats.find((c) => c.kind === "direct")?.id ?? chats[0]?.id ?? null,
  }));
}

/** Loads a chat's newest messages; with `topic`, that topic's (null: General). */
export async function loadMessages(chatId: string, topic?: string | null): Promise<void> {
  const query =
    topic === undefined
      ? { limit: 100 }
      : { limit: 100, topic: topic === null ? "general" : topic };
  const messages = await call(() => api.chats({ chatId }).messages.get({ query }));
  setState((s) => ({
    messages: { ...s.messages, [chatId]: mergeMessages(s.messages[chatId], messages) },
  }));
}

/** After a reconnect: refresh chats and every chat whose messages are loaded. */
export async function resync(): Promise<void> {
  await loadInitial();
  void loadProviderStatus().catch(reportError);
  void loadProjects().catch(reportError);
  await Promise.all(Object.keys(getState().messages).map((chatId) => loadMessages(chatId)));
}

export async function sendMessage(
  chatId: string,
  body: string,
  replyTo: string | null,
  topicId: string | null = null,
  attachments: string[] = [],
): Promise<void> {
  const message = await call(() =>
    api.chats({ chatId }).messages.post({ body, replyTo, topicId, attachments }),
  );
  upsertMessage(message);
}

// Topics (ADR 0024)

export async function loadTopics(chatId: string): Promise<void> {
  const topics = await call(() => api.chats({ chatId }).topics.get());
  setState((s) => ({ topics: { ...s.topics, [chatId]: topics } }));
}

export function upsertTopic(topic: Topic): void {
  setState((s) => {
    const list = (s.topics[topic.chatId] ?? []).filter((t) => t.id !== topic.id);
    list.push(topic);
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { topics: { ...s.topics, [topic.chatId]: list } };
  });
}

/** Shows a topic of a chat (null: General) and loads its messages. */
export function openTopic(chatId: string, topicId: string | null): void {
  setState((s) => ({ activeTopic: { ...s.activeTopic, [chatId]: topicId } }));
  void loadMessages(chatId, topicId).catch(reportError);
}

export async function createTopic(chatId: string, title: string): Promise<void> {
  const topic = await call(() => api.chats({ chatId }).topics.post({ title }));
  upsertTopic(topic);
  openTopic(chatId, topic.id);
}

export async function updateTopic(
  chatId: string,
  topicId: string,
  patch: { title?: string; closed?: boolean },
): Promise<void> {
  upsertTopic(await call(() => api.chats({ chatId }).topics({ topicId }).patch(patch)));
}

export async function moveToTopic(messageId: string, topicId: string | null): Promise<void> {
  upsertMessage(await call(() => api.messages({ messageId }).topic.post({ topicId })));
}

/** A click on a helper's mark: its settings, in the Helpers app beside the chat. */
export function openAgentSettings(handle: string): void {
  setState(() => ({ agentFocus: handle }));
  openSettings("helpers", "right");
}

export function openChat(chatId: string): void {
  setState(() => ({ activeChatId: chatId, pane: "main" }));
  openAppRef("messenger");
  if (!getState().messages[chatId]) void loadMessages(chatId).catch(reportError);
}

export async function loadMembers(chatId: string): Promise<void> {
  const members = await call(() => api.chats({ chatId }).members.get());
  setState((s) => ({ members: { ...s.members, [chatId]: members.map((m) => m.participant) } }));
}

export async function loadProjects(): Promise<void> {
  // Agents change together with projects (a project's plan creates them).
  const [projects, agents] = await Promise.all([
    call(() => api.projects.get()),
    call(() => api.agents.get()),
  ]);
  setState(() => ({
    projects: Object.fromEntries(projects.map((p) => [p.id, p])),
    agents: Object.fromEntries(
      agents.map((a) => [a.handle, { handle: a.handle, name: a.name, role: a.role }]),
    ),
  }));
}

let projectsTimer: ReturnType<typeof setTimeout> | undefined;
/** Debounced refresh of project spend after runs finish. */
export function refreshProjectsSoon(): void {
  clearTimeout(projectsTimer);
  projectsTimer = setTimeout(() => void loadProjects().catch(reportError), 500);
}

export { upsertChat };

export function showList(): void {
  setState(() => ({ pane: "list" }));
}

export function reportError(error: unknown): void {
  console.error("aura:", error instanceof Error ? error.message : error);
}

export async function loadProviderStatus(): Promise<void> {
  const { id, status } = await call(() => api.provider.get());
  setState(() => ({ provider: { ...status, engine: id } }));
}

export async function recheckProvider(): Promise<void> {
  setState(() => ({ provider: null }));
  const { id, status } = await call(() => api.provider.check.post());
  setState(() => ({ provider: { ...status, engine: id } }));
}

export async function stopRun(runId: string): Promise<void> {
  await call(() => api.runs({ runId }).stop.post());
}

export async function decideApproval(approvalId: string, approve: boolean): Promise<void> {
  await call(() => api.approvals({ approvalId }).decide.post({ approve }));
}

export async function loadTasks(projectId: string): Promise<void> {
  const tasks = await call(() => api.projects({ projectId }).tasks.get());
  setState((s) => ({ tasks: { ...s.tasks, [projectId]: tasks } }));
}

export function showEngines(): void {
  openSettings("ai");
}
