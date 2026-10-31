import type { Chat } from "@aura/shared";
import { errorMessage } from "../../../lib/log";
import type { ChatRepo } from "../../chats/chat/repo";
import type { ChatService } from "../../chats/chat/service";
import type { FileStore } from "../../chats/files/store";
import type { ProjectService } from "../../chats/projects/service";
import type { ApprovalService } from "../../system/approvals/service";
import type { AgentDirectory } from "./directory";

/** What agent tools need, shared by the tools of every domain (ADR 0039). */
export interface ToolDeps {
  agents: AgentDirectory;
  projects: ProjectService;
  approvals: ApprovalService;
  repo: ChatRepo;
  chat: ChatService;
  files: FileStore;
  /** The user data directory (a git repo), for commits of approved agent changes. */
  dataDir?: string;
}

export interface ToolContext {
  handle: string;
  chat: Chat;
  /** Chain depth of the agent's reply; messages it causes are one level deeper. */
  depth: number;
  /** The run answers the user's own message; some actions are only for that (WISH-8). */
  byUser?: boolean;
}

export const ok = (text: string) => ({ text });
export const fail = (error: unknown) => ({ text: `Error: ${errorMessage(error)}`, isError: true });
