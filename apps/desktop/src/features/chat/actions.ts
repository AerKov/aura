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
  void loadProviderStatus().catch(reportError);
  void loadProjects().catch(reportError);
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
  setState(() => ({ activeChatId: chatId, view: "chat" }));
  if (!getState().messages[chatId]) void loadMessages(chatId).catch(reportError);
}

export async function loadMembers(chatId: string): Promise<void> {
  const members = await call(() => api.chats({ chatId }).members.get());
  setState((s) => ({ members: { ...s.members, [chatId]: members.map((m) => m.participant) } }));
}

export async function loadProjects(): Promise<void> {
  const projects = await call(() => api.projects.get());
  setState(() => ({ projects: Object.fromEntries(projects.map((p) => [p.id, p])) }));
}

let projectsTimer: ReturnType<typeof setTimeout> | undefined;
/** Debounced refresh of project spend after runs finish. */
export function refreshProjectsSoon(): void {
  clearTimeout(projectsTimer);
  projectsTimer = setTimeout(() => void loadProjects().catch(reportError), 500);
}

export { upsertChat };

export function reportError(error: unknown): void {
  console.error("aura:", error instanceof Error ? error.message : error);
}

export async function loadProviderStatus(): Promise<void> {
  const { status } = await call(() => api.provider.get());
  setState(() => ({ provider: status }));
}

export async function recheckProvider(): Promise<void> {
  setState(() => ({ provider: null }));
  const { status } = await call(() => api.provider.check.post());
  setState(() => ({ provider: status }));
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

export async function setTaskStatus(
  taskId: string,
  status: "todo" | "doing" | "done" | "blocked",
): Promise<void> {
  await call(() => api.tasks({ taskId }).patch({ status }));
}

export function showSkills(): void {
  setState(() => ({ view: "skills" }));
}

export function showJobs(): void {
  setState(() => ({ view: "jobs" }));
}

export function showCustomize(): void {
  setState(() => ({ view: "customize" }));
}

export function showExtension(id: string): void {
  setState(() => ({ view: `ext:${id}` }));
}
