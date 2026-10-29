import { type FileRef, MAX_ATTACHMENTS } from "@aura/shared";
import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { FileStore } from "../files/store";
import type { ChatService } from "./service";

export interface ChatDeps {
  chat: ChatService;
  sessions: LocalSessions;
  /** Whether an agent exists (its profile is valid). */
  agentExists: (handle: string) => Promise<boolean>;
  files: FileStore;
}

const HANDLE = t.String({ pattern: "^[a-z][a-z0-9_-]{1,31}$" });

export const chatModule = ({ chat, sessions, agentExists, files }: ChatDeps) =>
  new Elysia({ name: "chat" })
    .use(authGuard(sessions))
    .get("/me", ({ user }) => user, { auth: true })
    .get("/chats", () => chat.repo.listChats(), { auth: true })
    .get(
      "/chats/:chatId/members",
      async ({ params, status }) => {
        if (!(await chat.repo.findChat(params.chatId)))
          return status(404, { error: "Chat not found" });
        return chat.repo.members(params.chatId);
      },
      { auth: true },
    )
    // The user adds or removes a helper in a project's or an app's chat (ADR 0034).
    .put(
      "/chats/:chatId/agents/:handle",
      async ({ params, status }) => {
        const found = await chat.repo.findChat(params.chatId);
        if (found?.kind !== "group")
          return status(404, { error: "Helpers can be added to project and app chats only" });
        if (!(await agentExists(params.handle)))
          return status(404, { error: `No helper @${params.handle}` });
        const participant = { kind: "agent" as const, id: params.handle };
        if (!(await chat.repo.isMember(params.chatId, participant))) {
          await chat.repo.addMember(params.chatId, participant, "member");
          await chat.repo.createMessage({
            chatId: params.chatId,
            author: { kind: "bot", id: "system" },
            kind: "system",
            body: `@${params.handle} joined the chat.`,
          });
        }
        return chat.repo.members(params.chatId);
      },
      { auth: true, params: t.Object({ chatId: t.String(), handle: HANDLE }) },
    )
    .delete(
      "/chats/:chatId/agents/:handle",
      async ({ params, status }) => {
        const found = await chat.repo.findChat(params.chatId);
        if (found?.kind !== "group")
          return status(404, { error: "Helpers can be removed from project and app chats only" });
        if (params.handle === "orchestrator")
          return status(400, { error: "The orchestrator stays in every chat" });
        const participant = { kind: "agent" as const, id: params.handle };
        if (await chat.repo.isMember(params.chatId, participant)) {
          await chat.repo.removeMember(params.chatId, participant);
          await chat.repo.createMessage({
            chatId: params.chatId,
            author: { kind: "bot", id: "system" },
            kind: "system",
            body: `@${params.handle} left the chat.`,
          });
        }
        return chat.repo.members(params.chatId);
      },
      { auth: true, params: t.Object({ chatId: t.String(), handle: HANDLE }) },
    )
    .get(
      "/chats/:chatId/messages",
      async ({ params, query, status }) => {
        if (!(await chat.repo.findChat(params.chatId)))
          return status(404, { error: "Chat not found" });
        return chat.repo.listMessages(params.chatId, {
          before: query.before,
          limit: query.limit ?? 50,
          // "general" is the chat's General topic; absent means every topic.
          ...(query.topic ? { topic: query.topic === "general" ? null : query.topic } : {}),
        });
      },
      {
        auth: true,
        query: t.Object({
          before: t.Optional(t.String({ maxLength: 64 })),
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
          topic: t.Optional(t.String({ maxLength: 64 })),
        }),
      },
    )
    .post(
      "/chats/:chatId/messages",
      ({ params, body, user, status }) => {
        // Files were uploaded to this chat first; the message names them by id (ADR 0036).
        const attachments: FileRef[] = [];
        for (const id of new Set(body.attachments ?? [])) {
          const found = files.find({ kind: "chat", id: params.chatId }, id);
          if (!found) return status(400, { error: "An attached file is missing: add it again" });
          attachments.push(found.ref);
        }
        return chat.post({
          chatId: params.chatId,
          author: { kind: "user", id: user.id },
          body: body.body,
          attachments,
          replyTo: body.replyTo ?? null,
          topicId: body.topicId,
        });
      },
      {
        auth: true,
        body: t.Object({
          body: t.String({ maxLength: 32_000 }),
          attachments: t.Optional(
            t.Array(t.String({ maxLength: 20 }), { maxItems: MAX_ATTACHMENTS }),
          ),
          replyTo: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
          topicId: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
        }),
      },
    )
    .get("/chats/:chatId/topics", ({ params }) => chat.repo.listTopics(params.chatId), {
      auth: true,
    })
    .post(
      "/chats/:chatId/topics",
      ({ params, body }) => chat.createTopic(params.chatId, body.title),
      { auth: true, body: t.Object({ title: t.String({ maxLength: 200 }) }) },
    )
    .patch(
      "/chats/:chatId/topics/:topicId",
      ({ params, body }) => chat.updateTopic(params.chatId, params.topicId, body),
      {
        auth: true,
        body: t.Object({
          title: t.Optional(t.String({ maxLength: 200 })),
          closed: t.Optional(t.Boolean()),
        }),
      },
    )
    .post(
      "/messages/:messageId/topic",
      ({ params, body }) => chat.moveMessage(params.messageId, body.topicId),
      { auth: true, body: t.Object({ topicId: t.Nullable(t.String({ maxLength: 64 })) }) },
    );
