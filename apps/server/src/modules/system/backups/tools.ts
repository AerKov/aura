import { z } from "zod";
import { errorMessage } from "../../../lib/log";
import type { AgentTool } from "../../../providers/types";
import { PLAIN_CHANGES, plainChanges } from "../approvals/plain";
import type { ApprovalService } from "../approvals/service";
import type { RestorePointService } from "./restore-points";

const size = (bytes: number) =>
  bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.ceil(bytes / 1000)} KB`;

/**
 * The orchestrator's restore points (ADR 0033): it saves one before a bigger customization, and
 * asks the user before taking Aura back or forward to one.
 */
export function restorePointTools(
  points: RestorePointService,
  approvals: ApprovalService,
  ctx: { handle: string; chatId: string; topicId?: string | null },
): AgentTool[] {
  return [
    {
      name: "list_restore_points",
      description:
        "List restore points of the whole Aura (newest first): configuration, apps with their code and data, and settings. Chats, memory and secrets are not in them.",
      inputSchema: {},
      async handler() {
        const list = points.list();
        if (list.length === 0) return { text: "No restore points yet." };
        return {
          text: list
            .map(
              (p) =>
                `- ${p.id}: “${p.label}” ${p.createdAt.slice(0, 16).replace("T", " ")}${p.auto ? " (automatic)" : ""}, apps: ${p.apps.join(", ") || "none"}, ${size(p.size)}`,
            )
            .join("\n"),
        };
      },
    },
    {
      name: "create_restore_point",
      description:
        "Save the present as a restore point before a bigger change (several apps, the bar, many settings), so the user can go back to it. No approval needed.",
      inputSchema: { label: z.string().describe("what comes next, e.g. Before the new dashboard") },
      async handler(input) {
        try {
          const point = await points.create(String(input.label ?? ""));
          return { text: `Saved the restore point ${point.id} “${point.label}”.` };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
    {
      name: "go_to_restore_point",
      description:
        "Ask the user to approve taking Aura to a restore point (back or forward). The present is saved first as an automatic point; apps made since are uninstalled with a backup.",
      inputSchema: {
        ...PLAIN_CHANGES,
        id: z.string(),
        why: z.string(),
      },
      async handler(input) {
        try {
          const id = String(input.id ?? "");
          const point = points.list().find((p) => p.id === id);
          if (!point) throw new Error(`No restore point "${id}"; call list_restore_points`);
          await approvals.request({
            kind: "restore_point",
            requestedBy: ctx.handle,
            chatId: ctx.chatId,
            topicId: ctx.topicId ?? null,
            title: `Go to the restore point “${point.label}”`,
            why: String(input.why ?? ""),
            changes: plainChanges(input),
            preview: [
              `Saved ${point.createdAt.slice(0, 16).replace("T", " ")}. Apps: ${point.apps.join(", ") || "none"}.`,
              "",
              "Configuration, apps (code, versions, data) and settings go back to that moment. Chats, memory and secrets stay as they are. The present is saved first, so you can come back.",
            ].join("\n"),
            payload: { id },
          });
          return { text: "Approval requested. Aura goes to the point when the user approves." };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
  ];
}
