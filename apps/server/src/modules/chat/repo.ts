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

export { toChat as rowToChat, toMessage as rowToMessage };

export interface NewMessage {
  chatId: string;
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
  async listMessages(chatId: string, opts: { before?: string; limit: number }): Promise<Message[]> {
    const where = opts.before ? "chat = $chat AND id < $before" : "chat = $chat";
    const [rows] = await this.db
      .query<[Row[]]>(`SELECT * FROM message WHERE ${where} ORDER BY id DESC LIMIT $limit`, {
        chat: new RecordId("chat", chatId),
        before: opts.before ? new RecordId("message", opts.before) : undefined,
        limit: opts.limit,
      })
      .collect();
    return (rows ?? []).map(toMessage).reverse();
  }

  /** Messages after `after` (all when null), oldest first. */
  async listMessagesAfter(
    chatId: string,
    opts: { after: string | null; limit: number },
  ): Promise<Message[]> {
    const where = opts.after ? "chat = $chat AND id > $after" : "chat = $chat";
    const [rows] = await this.db
      .query<[Row[]]>(`SELECT * FROM message WHERE ${where} ORDER BY id ASC LIMIT $limit`, {
        chat: new RecordId("chat", chatId),
        after: opts.after ? new RecordId("message", opts.after) : undefined,
        limit: opts.limit,
      })
      .collect();
    return (rows ?? []).map(toMessage);
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
