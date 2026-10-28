import { z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { ApprovalService } from "../approvals/service";
import type { ChatService } from "../chat/service";
import type { AppearanceService } from "../customize/appearance";
import { type AppService, BUILDER_HANDLE } from "./service";

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

/**
 * The orchestrator passes a change of Aura's bar to @builder in the bar's chat (ADR 0029). The
 * bar app is created (looking like the built-in bar) and shown the first time; the change itself
 * waits for the user's approval as a diff, like any app's.
 */
export function barTools(
  deps: { apps: AppService; appearance: AppearanceService; chat: ChatService },
  ctx: { handle: string; depth: number },
): AgentTool[] {
  return [
    {
      name: "change_bar",
      description: `Change Aura's bar (the strip with the apps and the status on the edge of the screen) beyond what set_appearance offers: new widgets, another look, other behaviour. Its code is an app; this hands the request to @${BUILDER_HANDLE} in the bar's chat, and the user approves the change as a diff (versions can be restored). Use set_appearance for the bar's edge, its icons' order or turning it off.`,
      inputSchema: {
        request: z.string().describe("what to change, in the user's words plus what you know"),
      },
      async handler(input) {
        try {
          const request = String(input.request ?? "").trim();
          if (!request || request.length > 4000)
            throw new Error("request is required (max 4000 chars)");
          const bar = await deps.apps.ensureBar();
          const { rail } = await deps.appearance.get();
          if (rail.mode !== "app") await deps.appearance.set({ rail: { mode: "app" } });
          await deps.chat.post({
            chatId: bar.chatId,
            author: { kind: "agent", id: ctx.handle },
            body: `@${BUILDER_HANDLE} ${request}`,
            chainDepth: ctx.depth,
          });
          return {
            text: `${bar.created ? "Created the bar app and switched to it. " : ""}Asked @${BUILDER_HANDLE} in the bar's chat; the user approves the change there as a diff.`,
          };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
  ];
}
