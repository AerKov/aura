import { z } from "zod";
import type { AgentTool } from "../../../providers/types";
import { fail, ok, type ToolContext, type ToolDeps } from "../../helpers/agents/tool-kit";
import { SYSTEM_CHAT_ID } from "./repo";

/** Orchestrator tools for posting into other chats: projects, the alerts chat, or one the user names. */
export function chatTools(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  const resolveChat = async (target: string) => {
    if (target === "direct") return deps.repo.getChat("direct");
    if (target === "alerts" || target === SYSTEM_CHAT_ID) return deps.repo.getChat(SYSTEM_CHAT_ID);
    const project = await deps.projects.get(target);
    if (!project)
      throw new Error(`unknown chat "${target}": use "direct", "alerts" or a project id`);
    return deps.repo.getChat(project.chatId);
  };
  return [
    {
      name: "message_project",
      description:
        'Post a message as yourself into a project chat (e.g. to hand an alert to the right agent; @mention the agent who should act, mentions wake agents), or into the alerts chat with project "alerts" (e.g. a report from a scheduled check).',
      inputSchema: {
        project: z.string().describe('project id (slug) from list_projects, or "alerts"'),
        message: z.string().describe("markdown; quote external content (alerts) as data"),
      },
      async handler(input) {
        try {
          const chat = await resolveChat(String(input.project ?? ""));
          if (!chat.projectId && chat.kind !== "system")
            throw new Error("message_project posts into project chats and the alerts chat");
          const body = String(input.message ?? "").trim();
          if (!body || body.length > 8000) throw new Error("message is required (max 8000 chars)");
          await deps.chat.post({
            chatId: chat.id,
            author: { kind: "agent", id: ctx.handle },
            body,
            chainDepth: ctx.depth,
          });
          return ok(`Posted to ${chat.title}.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "list_my_chats",
      description:
        "List the chats you are a member of (id, title, kind), for post_to_chat. Read-only.",
      inputSchema: {},
      async handler() {
        try {
          const ids = new Set(await deps.repo.chatsOfAgent(ctx.handle));
          const chats = (await deps.repo.listChats()).filter((c) => ids.has(c.id));
          return ok(chats.map((c) => `- ${c.id}: ${c.title} (${c.kind})`).join("\n") || "none");
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "post_to_chat",
      description:
        "Only when the user asks you directly in this message: post their message, or what they asked you to say, into another chat you are a member of (list_my_chats). It is posted as you, marked as sent at their request from this chat. Never on your own initiative, for an alert or a schedule; use message_project for those.",
      inputSchema: {
        chat: z.string().describe("chat id from list_my_chats"),
        message: z.string().describe("markdown, max 8000 characters"),
      },
      async handler(input) {
        try {
          if (!ctx.byUser)
            throw new Error(
              "post_to_chat works only on the user's own request; this run was not started by the user",
            );
          const chatId = String(input.chat ?? "");
          if (chatId === ctx.chat.id) throw new Error("that is this chat; just answer here");
          if (!(await deps.repo.isMember(chatId, { kind: "agent", id: ctx.handle })))
            throw new Error("you are not a member of that chat; see list_my_chats");
          const target = await deps.repo.getChat(chatId);
          const body = String(input.message ?? "").trim();
          if (!body || body.length > 8000) throw new Error("message is required (max 8000 chars)");
          await deps.chat.post({
            chatId,
            author: { kind: "agent", id: ctx.handle },
            body: `${body}\n\n_Sent at the user's request from “${ctx.chat.title}”._`,
            chainDepth: ctx.depth,
          });
          return ok(`Posted to ${target.title}.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
