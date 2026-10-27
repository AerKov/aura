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
