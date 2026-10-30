import { z } from "zod";
import type { AgentTool } from "../../../providers/types";
import { ORCHESTRATOR_HANDLE } from "../agents/profiles";
import { fail, ok, type ToolContext, type ToolDeps } from "../agents/tool-kit";

export function skillTool(deps: ToolDeps, ctx: ToolContext): AgentTool {
  const isOrchestrator = ctx.handle === ORCHESTRATOR_HANDLE;
  return {
    name: "propose_skill_change",
    description: isOrchestrator
      ? "Propose a new skill or a change to a skill (skills/<name>/SKILL.md), optionally attaching it to agents. The user approves a diff."
      : "Propose an improvement to one of your skills, or a new skill for yourself, when you learned something reusable. The user approves a diff.",
    inputSchema: {
      name: z.string().describe("skill name: lowercase letters, digits, dashes"),
      content: z
        .string()
        .describe("full SKILL.md: frontmatter with `description`, then instructions"),
      reason: z.string().describe("why this change helps"),
      attach_to: z
        .array(z.string())
        .optional()
        .describe(isOrchestrator ? "agent handles to attach the skill to" : "omit"),
    },
    async handler(input) {
      try {
        const attachTo = isOrchestrator
          ? (Array.isArray(input.attach_to) ? input.attach_to : []).map((h) =>
              String(h).replace(/^@/, ""),
            )
          : [ctx.handle];
        await deps.skills.propose(
          {
            name: String(input.name ?? ""),
            content: String(input.content ?? ""),
            reason: String(input.reason ?? ""),
            attachTo,
          },
          { requestedBy: ctx.handle, chatId: ctx.chat.id, topicId: ctx.topicId },
        );
        return ok("Approval requested for the skill change.");
      } catch (error) {
        return fail(error);
      }
    },
  };
}
