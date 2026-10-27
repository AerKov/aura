/**
 * Agent memory (ADR 0013): short notes agents save and recall across runs. An agent's own notes go
 * with it everywhere; project notes are shared by the agents of one project.
 */
export type MemoryScope = "agent" | "project";

export interface MemoryNote {
  id: string;
  scope: MemoryScope;
  /** The agent handle (agent scope) or the project id (project scope). */
  owner: string;
  text: string;
  /** Who saved it: an agent handle, or "user". */
  author: string;
  createdAt: string;
  /** Has an embedding for the current semantic search model. */
  semantic: boolean;
}

export const MEMORY_MAX_CHARS = 1000;

/** What agents keep of a chat's older messages (ADR 0017): one rolling summary per chat. */
export interface ChatSummary {
  chatId: string;
  text: string;
  /** The last message the summary covers; newer messages are shown to agents as they are. */
  upTo: string;
  /** How many messages the summary covers. */
  covered: number;
  updatedAt: string;
}
