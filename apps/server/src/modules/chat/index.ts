import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { ChatService } from "./service";

export interface ChatDeps {
  chat: ChatService;
  sessions: LocalSessions;
}

export const chatModule = ({ chat, sessions }: ChatDeps) =>
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
      ({ params, body, user }) =>
        chat.post({
          chatId: params.chatId,
          author: { kind: "user", id: user.id },
          body: body.body,
          replyTo: body.replyTo ?? null,
          topicId: body.topicId,
        }),
      {
        auth: true,
        body: t.Object({
          body: t.String({ minLength: 1, maxLength: 32_000 }),
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
