import { userInfo } from "node:os";
import {
  type Card,
  type Chat,
  type ChatKind,
  type Message,
  type MessageKind,
  type MessageStatus,
  type Participant,
  previewText,
  type Topic,
  type Usage,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { isoOf, keyOf, optionalIso, optionalKey, retryOnConflict } from "../../db/convert";

export const OWNER_ID = "owner";
export const DIRECT_CHAT_ID = "direct";
export const SYSTEM_CHAT_ID = "system";
export const ORCHESTRATOR: Participant = { kind: "agent", id: "orchestrator" };

export class NotFoundError extends Error {
  override name = "NotFoundError";
}

type Row = Record<string, unknown>;

function toChat(row: Row): Chat {
  return {
    id: keyOf(row.id),
    kind: row.kind as ChatKind,
    title: String(row.title),
    projectId: (row.project as string | undefined) ?? null,
    createdAt: isoOf(row.created_at),
    lastMessageAt: optionalIso(row.last_message_at),
    lastMessagePreview: (row.last_message_preview as string | undefined) ?? null,
  };
}

function toMessage(row: Row): Message {
  return {
    id: keyOf(row.id),
    chatId: keyOf(row.chat),
    topicId: typeof row.topic === "string" ? row.topic : null,
    author: row.author as Participant,
    kind: row.kind as MessageKind,
    body: String(row.body),
    card: (row.card as Card | undefined) ?? null,
    replyTo: optionalKey(row.reply_to),
    mentions: (row.mentions as string[] | undefined) ?? [],
    status: row.status as MessageStatus,
    chainDepth: Number(row.chain_depth ?? 0),
    runId: (row.run as string | undefined) ?? null,
    usage: (row.usage as Usage | undefined) ?? null,
    error: (row.error as string | undefined) ?? null,
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  };
}

function toTopic(row: Row): Topic {
  return {
    id: keyOf(row.id),
    chatId: keyOf(row.chat),
    title: String(row.title),
    closed: row.closed === true,
    createdAt: isoOf(row.created_at),
  };
}

export { toChat as rowToChat, toMessage as rowToMessage, toTopic as rowToTopic };

export interface NewMessage {
  chatId: string;
  /** null or absent: the chat's General topic. */
  topicId?: string | null;
  author: Participant;
  kind?: MessageKind;
  body: string;
  card?: Card | null;
  replyTo?: string | null;
  mentions?: string[];
  status?: MessageStatus;
  chainDepth?: number;
  runId?: string | null;
}

export interface MessagePatch {
  body?: string;
  mentions?: string[];
  card?: Card | null;
  status?: MessageStatus;
  usage?: Usage | null;
  error?: string | null;
  runId?: string | null;
}

/** Data access for chats, members and messages. Pure persistence; no guards or side effects. */
export class ChatRepo {
  constructor(private readonly db: Surreal) {}

  private async one(sql: string, vars?: Record<string, unknown>): Promise<Row | undefined> {
    const [result] = await this.db.query<[Row[] | Row | null]>(sql, vars).collect();
    if (Array.isArray(result)) return result[0];
    return result ?? undefined;
  }

  async ensureOwner(): Promise<{ id: string; name: string }> {
    const name = safeUsername();
    await this.db
      .query("UPSERT $id MERGE { name: $name, role: 'owner' }", {
        id: new RecordId("user", OWNER_ID),
        name,
      })
      .collect();
    return { id: OWNER_ID, name };
  }

  async createChat(input: {
    id?: string;
    kind: ChatKind;
    title: string;
    projectId?: string | null;
    members: { participant: Participant; role: "owner" | "member" }[];
  }): Promise<Chat> {
    const id = new RecordId("chat", input.id ?? Bun.randomUUIDv7());
    const row = await this.one(
      "UPSERT $id MERGE { kind: $kind, title: $title, project: $project } RETURN AFTER",
      { id, kind: input.kind, title: input.title, project: input.projectId ?? undefined },
    );
    for (const member of input.members)
      await this.addMember(keyOf(id), member.participant, member.role);
    if (!row) throw new Error("chat upsert returned nothing");
    return toChat(row);
  }

  async addMember(
    chatId: string,
    participant: Participant,
    role: "owner" | "member",
  ): Promise<void> {
    await this.db
      .query(
        `IF !(SELECT VALUE id FROM member WHERE chat = $chat AND participant.kind = $p.kind AND participant.id = $p.id) {
           CREATE member CONTENT { chat: $chat, participant: $p, role: $role };
         }`,
        { chat: new RecordId("chat", chatId), p: participant, role },
      )
      .collect();
  }

  async members(chatId: string): Promise<{ participant: Participant; role: "owner" | "member" }[]> {
    const [rows] = await this.db
      .query<[Row[]]>(
        "SELECT participant, role, joined_at FROM member WHERE chat = $chat ORDER BY joined_at",
        {
          chat: new RecordId("chat", chatId),
        },
      )
      .collect();
    return (rows ?? []).map((row) => ({
      participant: row.participant as Participant,
      role: row.role as "owner" | "member",
    }));
  }

  /** Ids of the chats an agent belongs to. */
  async chatsOfAgent(handle: string): Promise<string[]> {
    const [rows] = await this.db
      .query<[Row[]]>(
        "SELECT chat FROM member WHERE participant.kind = 'agent' AND participant.id = $handle",
        { handle },
      )
      .collect();
    return (rows ?? []).map((row) => keyOf(row.chat));
  }

  async isMember(chatId: string, participant: Participant): Promise<boolean> {
    return (await this.members(chatId)).some(
      (m) => m.participant.kind === participant.kind && m.participant.id === participant.id,
    );
  }

  async listChats(): Promise<Chat[]> {
    const [rows] = await this.db
      .query<[Row[]]>(
        "SELECT *, last_message_at ?? created_at AS sort_at FROM chat ORDER BY sort_at DESC",
      )
      .collect();
    return (rows ?? []).map(toChat);
  }

  async getChat(chatId: string): Promise<Chat> {
    const row = await this.one("SELECT * FROM ONLY $id", {
      id: new RecordId("chat", chatId),
    }).catch(() => undefined);
    if (!row) throw new NotFoundError(`chat ${chatId} not found`);
    return toChat(row);
  }

  async findChat(chatId: string): Promise<Chat | null> {
    return this.getChat(chatId).catch((error: unknown) => {
      if (error instanceof NotFoundError) return null;
      throw error;
    });
  }

  /** Last `limit` messages before `before` (exclusive), oldest first. */
  /**
   * Newest messages of a chat, oldest first. `topic`: a topic id, null for General, or absent for
   * every topic.
   */
  async listMessages(
    chatId: string,
    opts: { before?: string; limit: number; topic?: string | null },
  ): Promise<Message[]> {
    const where = [
      "chat = $chat",
      opts.before ? "id < $before" : "",
      opts.topic === undefined ? "" : opts.topic === null ? "topic IS NONE" : "topic = $topic",
    ]
      .filter(Boolean)
      .join(" AND ");
    const [rows] = await this.db
      .query<[Row[]]>(`SELECT * FROM message WHERE ${where} ORDER BY id DESC LIMIT $limit`, {
        chat: new RecordId("chat", chatId),
        before: opts.before ? new RecordId("message", opts.before) : undefined,
        topic: opts.topic ?? undefined,
        limit: opts.limit,
      })
      .collect();
    return (rows ?? []).map(toMessage).reverse();
  }

  /** Messages after `after` (all when null), oldest first. */
  async listMessagesAfter(
    chatId: string,
    opts: { after: string | null; limit: number; topic?: string | null },
  ): Promise<Message[]> {
    const where = [
      "chat = $chat",
      opts.after ? "id > $after" : "",
      opts.topic === undefined ? "" : opts.topic === null ? "topic IS NONE" : "topic = $topic",
    ]
      .filter(Boolean)
      .join(" AND ");
    const [rows] = await this.db
      .query<[Row[]]>(`SELECT * FROM message WHERE ${where} ORDER BY id ASC LIMIT $limit`, {
        chat: new RecordId("chat", chatId),
        after: opts.after ? new RecordId("message", opts.after) : undefined,
        topic: opts.topic ?? undefined,
        limit: opts.limit,
      })
      .collect();
    return (rows ?? []).map(toMessage);
  }

  // Topics (ADR 0024): threads of a chat; General is the implicit null topic.

  async listTopics(chatId: string): Promise<Topic[]> {
    const [rows] = await this.db
      .query<[Row[]]>("SELECT * FROM topic WHERE chat = $chat ORDER BY created_at ASC", {
        chat: new RecordId("chat", chatId),
      })
      .collect();
    return (rows ?? []).map(toTopic);
  }

  async getTopic(topicId: string): Promise<Topic | null> {
    const row = await this.one("SELECT * FROM ONLY $id", {
      id: new RecordId("topic", topicId),
    }).catch(() => undefined);
    return row ? toTopic(row) : null;
  }

  async createTopic(chatId: string, title: string): Promise<Topic> {
    const row = await this.one("CREATE ONLY $id CONTENT $content RETURN AFTER", {
      id: new RecordId("topic", Bun.randomUUIDv7()),
      content: { chat: new RecordId("chat", chatId), title, closed: false },
    });
    if (!row) throw new Error("topic create returned nothing");
    return toTopic(row);
  }

  async updateTopic(topicId: string, patch: { title?: string; closed?: boolean }): Promise<Topic> {
    const row = await this.one("UPDATE ONLY $id MERGE $patch RETURN AFTER", {
      id: new RecordId("topic", topicId),
      patch,
    });
    if (!row) throw new Error("topic update returned nothing");
    return toTopic(row);
  }

  async moveMessage(messageId: string, topicId: string | null): Promise<Message> {
    const row = await this.one(
      `UPDATE ONLY $id SET topic = ${topicId ? "$topic" : "NONE"}, updated_at = time::now() RETURN AFTER`,
      { id: new RecordId("message", messageId), topic: topicId ?? undefined },
    );
    if (!row) throw new Error("message move returned nothing");
    return toMessage(row);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const row = await this.one("SELECT * FROM ONLY $id", {
      id: new RecordId("message", messageId),
    }).catch(() => undefined);
    return row ? toMessage(row) : null;
  }

  async createMessage(input: NewMessage): Promise<Message> {
    const id = new RecordId("message", Bun.randomUUIDv7());
    const chat = new RecordId("chat", input.chatId);
    const row = await this.one("CREATE ONLY $id CONTENT $content RETURN AFTER", {
      id,
      content: {
        chat,
        topic: input.topicId ?? undefined,
        author: input.author,
        kind: input.kind ?? "text",
        body: input.body,
        card: input.card ?? undefined,
        reply_to: input.replyTo ? new RecordId("message", input.replyTo) : undefined,
        mentions: input.mentions ?? [],
        status: input.status ?? "final",
        chain_depth: input.chainDepth ?? 0,
        run: input.runId ?? undefined,
      },
    });
    if (!row) throw new Error("message create returned nothing");
    const message = toMessage(row);
    await this.touchChat(input.chatId, message);
    return message;
  }

  async updateMessage(messageId: string, patch: MessagePatch): Promise<Message> {
    const data: Row = { updated_at: new Date() };
    if (patch.body !== undefined) data.body = patch.body;
    if (patch.mentions !== undefined) data.mentions = patch.mentions;
    if (patch.card !== undefined) data.card = patch.card ?? undefined;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.usage !== undefined) data.usage = patch.usage ?? undefined;
    if (patch.error !== undefined) data.error = patch.error ?? undefined;
    if (patch.runId !== undefined) data.run = patch.runId ?? undefined;
    const row = await this.one("UPDATE ONLY $id MERGE $data RETURN AFTER", {
      id: new RecordId("message", messageId),
      data,
    });
    if (!row) throw new NotFoundError(`message ${messageId} not found`);
    const message = toMessage(row);
    if (patch.body !== undefined) await this.touchChat(message.chatId, message);
    return message;
  }

  /**
   * Deletes a chat with its messages, topics, members, summary, schedules and waiting approvals
   * (an app being uninstalled, ADR 0033). Runs stay: they are the spend history.
   */
  async removeChat(chatId: string): Promise<void> {
    const chat = new RecordId("chat", chatId);
    await this.db
      .query(
        `DELETE message WHERE chat = $chat;
         DELETE topic WHERE chat = $chat;
         DELETE member WHERE chat = $chat;
         DELETE job WHERE chat = $chat;
         DELETE approval WHERE chat = $chat AND status = 'pending';
         DELETE chat_summary WHERE chat = $chat;
         DELETE $chat;`,
        { chat },
      )
      .collect();
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.db.query("DELETE $id", { id: new RecordId("message", messageId) }).collect();
  }

  private async touchChat(chatId: string, message: Message): Promise<void> {
    const preview = message.body
      ? previewText(message.body)
      : message.card
        ? `[${message.card.type}]`
        : "";
    // Many writers touch the same chat record; retry optimistic-concurrency conflicts.
    await retryOnConflict(() =>
      this.db
        .query("UPDATE $id SET last_message_at = $at, last_message_preview = $preview", {
          id: new RecordId("chat", chatId),
          at: new Date(message.createdAt),
          preview,
        })
        .collect(),
    );
  }
}

function safeUsername(): string {
  try {
    const name = userInfo().username;
    return name && name !== "unknown" && name !== "root" ? name : "You";
  } catch {
    return "You";
  }
}
