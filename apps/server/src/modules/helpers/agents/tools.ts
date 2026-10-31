import type { AgentTool } from "../../../providers/types";
import { fileTools } from "../../chats/files/tools";
import type { ToolContext, ToolDeps } from "./tool-kit";

export type { ToolContext, ToolDeps } from "./tool-kit";

/**
 * Tools every agent gets from its chat (ADR 0042): in an app's chat, handing the user a finished
 * file from the app's folder. The Helper's own tools (apps, the look, language, help) and an app's
 * actions are added by the runtime's wiring.
 */
export function toolsFor(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  return ctx.chat.projectId ? fileTools(deps, ctx) : [];
}
