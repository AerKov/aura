import {
  type Chat,
  MAX_MESSAGE_LENGTH,
  type Message,
  type Participant,
  parseMentions,
} from "@aura/shared";
import { errorMessage, log } from "../../lib/log";
import { type ChatRepo, DIRECT_CHAT_ID, ORCHESTRATOR, SYSTEM_CHAT_ID } from "./repo";
import { WELCOME } from "./welcome";

export type ChatErrorCode = "not_found" | "invalid" | "forbidden";

const STATUS_BY_CODE: Record<ChatErrorCode, number> = {
  not_found: 404,
  invalid: 400,
  forbidden: 403,
};

export class ChatError extends Error {
  override name = "ChatError";
  constructor(
    readonly code: ChatErrorCode,
    message: string,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  /** Used by Elysia to turn a thrown ChatError into an HTTP response. */
  toResponse(): Response {
    return Response.json({ error: this.message, code: this.code }, { status: this.status });
  }
}

export type MessageListener = (message: Message, chat: Chat) => void | Promise<void>;

/** Chat use cases: bootstrap, posting messages with validation, and notifying listeners. */
export class ChatService {
  private readonly listeners = new Set<MessageListener>();

  constructor(readonly repo: ChatRepo) {}

  /** Creates the owner and the always-present chats. Idempotent. */
  async bootstrap(opts: { welcome?: boolean } = {}): Promise<{ id: string; name: string }> {
    const owner = await this.repo.ensureOwner();
    const ownerMember = {
      participant: { kind: "user", id: owner.id } as Participant,
      role: "owner" as const,
    };
    if (!(await this.repo.findChat(DIRECT_CHAT_ID))) {
      await this.repo.createChat({
        id: DIRECT_CHAT_ID,
        kind: "direct",
        title: "Orchestrator",
        members: [ownerMember, { participant: ORCHESTRATOR, role: "member" }],
      });
      // First launch: the orchestrator explains Aura (no run, so it costs nothing).
      if (opts.welcome !== false)
        await this.repo.createMessage({
          chatId: DIRECT_CHAT_ID,
          author: ORCHESTRATOR,
          body: WELCOME,
        });
    }
    if (!(await this.repo.findChat(SYSTEM_CHAT_ID))) {
      await this.repo.createChat({
        id: SYSTEM_CHAT_ID,
        kind: "system",
        title: "Alerts",
        members: [ownerMember, { participant: ORCHESTRATOR, role: "member" }],
      });
    }
    return owner;
  }

  /** Registers a listener for new final messages (used by the agent runtime for triggers). */
  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async post(input: {
    chatId: string;
    author: Participant;
    body: string;
    replyTo?: string | null;
    chainDepth?: number;
  }): Promise<Message> {
    const body = input.body.trim();
    if (!body) throw new ChatError("invalid", "Message is empty");
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ChatError("invalid", `Message is longer than ${MAX_MESSAGE_LENGTH} characters`);
    }

    const chat = await this.repo.findChat(input.chatId);
    if (!chat) throw new ChatError("not_found", `Chat ${input.chatId} not found`);
    if (!(await this.repo.isMember(chat.id, input.author))) {
      throw new ChatError("forbidden", "Author is not a member of this chat");
    }

    if (input.replyTo) {
      const target = await this.repo.getMessage(input.replyTo);
      if (!target || target.chatId !== chat.id) {
        throw new ChatError("invalid", "Reply target is not in this chat");
      }
    }

    const message = await this.repo.createMessage({
      chatId: chat.id,
      author: input.author,
      body,
      replyTo: input.replyTo ?? null,
      mentions: parseMentions(body),
      chainDepth: input.chainDepth ?? 0,
    });
    this.notify(message, chat);
    return message;
  }

  /** Notifies listeners about a message that became final (also used for agent replies). */
  notify(message: Message, chat: Chat): void {
    for (const listener of this.listeners) {
      Promise.resolve(listener(message, chat)).catch((error: unknown) => {
        log.error("message listener failed", { message: message.id, error: errorMessage(error) });
      });
    }
  }
}
