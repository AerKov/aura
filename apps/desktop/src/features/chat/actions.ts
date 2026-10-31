import { openSettings } from "@/features/shell/view";
import { api, call } from "@/lib/api";
import { getState, mergeMessages, setState, upsertChat, upsertMessage } from "./store";

/** Loads who the user is and the chats: the Helper's and one per app. */
export async function loadInitial(): Promise<void> {
  let customize = getState().customize;
  if (!customize) {
    customize = await call(() => api.customize.get());
    setState(() => ({ customize }));
  }
  const [me, chats] = await Promise.all([call(() => api.me.get()), call(() => api.chats.get())]);
  setState(() => ({ me, chats: Object.fromEntries(chats.map((c) => [c.id, c])) }));
}

/** Loads a chat's newest messages. */
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
  attachments: string[] = [],
): Promise<void> {
  const message = await call(() =>
    api.chats({ chatId }).messages.post({ body, replyTo, attachments }),
  );
  upsertMessage(message);
}

/** A click on a helper's mark: Settings → AI, where its engine and model are chosen. */
export function openAgentSettings(): void {
  openSettings("ai");
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

export function showEngines(): void {
  openSettings("ai");
}
