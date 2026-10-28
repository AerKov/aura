import { z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { ApprovalService } from "../approvals/service";
import { BUILDER_HANDLE } from "./service";

/** The orchestrator turns an idea into an app (with the user's approval). */
export function appTools(
  approvals: ApprovalService,
  ctx: { handle: string; chatId: string; topicId?: string | null },
): AgentTool[] {
  return [
    {
      name: "create_app",
      description: `Ask the user to approve a new app: a tool they run on their screen (a CRM, a board, a tracker…) with its own chat, where @${BUILDER_HANDLE} builds it from your description and later changes it on request; every change is shown to the user as a diff first. Prefer this over propose_extension when the user wants something they will keep using and changing.`,
      inputSchema: {
        name: z.string().describe("short name, e.g. Clients"),
        id: z.string().optional().describe("lowercase-with-dashes; derived from the name"),
        description: z
          .string()
          .describe("what the app should do, its data and views, for the builder"),
        why: z.string(),
      },
      async handler(input) {
        try {
          const name = String(input.name ?? "").trim();
          if (!name) throw new Error("name is required");
          await approvals.request({
            kind: "app_create",
            requestedBy: ctx.handle,
            chatId: ctx.chatId,
            topicId: ctx.topicId ?? null,
            title: `Create the app "${name}"`,
            why: String(input.why ?? ""),
            preview: [
              `It gets its own chat, where @${BUILDER_HANDLE} builds it; each change waits for your approval.`,
              "",
              "**What it should do**",
              "",
              String(input.description ?? "")
                .split("\n")
                .map((l) => `> ${l}`)
                .join("\n"),
            ].join("\n"),
            payload: {
              name,
              id: typeof input.id === "string" ? input.id : undefined,
              description: String(input.description ?? ""),
            },
          });
          return { text: "Approval requested. The app is created when the user approves." };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
  ];
}
