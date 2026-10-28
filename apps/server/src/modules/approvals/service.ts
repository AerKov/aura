import type { ApprovalCard, ApprovalKind, ApprovalStatus } from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { keyOf, optionalKey } from "../../db/convert";
import { errorMessage, log } from "../../lib/log";
import type { ChatRepo } from "../chat/repo";

export class ApprovalError extends Error {
  override name = "ApprovalError";
  constructor(
    readonly code: "not_found" | "decided",
    message: string,
  ) {
    super(message);
  }

  get status(): number {
    return this.code === "not_found" ? 404 : 409;
  }

  toResponse(): Response {
    return Response.json({ error: this.message, code: this.code }, { status: this.status });
  }
}

/** Runs the side effect once a request is approved. Returns a short outcome for the card. */
export type ApprovalExecutor = (
  payload: Record<string, unknown>,
  ctx: { chatId: string; requestedBy: string },
) => Promise<string>;

export interface ApprovalRecord {
  id: string;
  kind: ApprovalKind;
  requestedBy: string;
  chatId: string;
  messageId: string | null;
  title: string;
  why: string;
  preview: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  result: string | null;
  tryCss: string | null;
}

type Row = Record<string, unknown>;

/**
 * Human approval for side effects (CLAUDE.md rule 6, docs/SPEC.md section 10). A request posts an
 * approval card into the chat; the side effect runs only after the user approves it, exactly once.
 */
export class ApprovalService {
  private readonly executors = new Map<ApprovalKind, ApprovalExecutor>();
  /** Approvals being decided right now, so concurrent clicks cannot run an effect twice. */
  private readonly deciding = new Set<string>();

  constructor(
    private readonly db: Surreal,
    private readonly repo: ChatRepo,
  ) {}

  register(kind: ApprovalKind, executor: ApprovalExecutor): void {
    this.executors.set(kind, executor);
  }

  async request(input: {
    kind: ApprovalKind;
    requestedBy: string;
    chatId: string;
    /** The topic the request came from; its card goes there (ADR 0024). */
    topicId?: string | null;
    title: string;
    why: string;
    preview: string;
    payload: Record<string, unknown>;
    tryCss?: string;
  }): Promise<ApprovalRecord> {
    if (!this.executors.has(input.kind))
      throw new Error(`no executor registered for ${input.kind}`);
    const id = Bun.randomUUIDv7();
    await this.db
      .query("CREATE $id CONTENT $content", {
        id: new RecordId("approval", id),
        content: {
          kind: input.kind,
          requested_by: input.requestedBy,
          chat: new RecordId("chat", input.chatId),
          title: input.title,
          why: input.why,
          preview: input.preview,
          payload: input.payload,
          try_css: input.tryCss,
          status: "pending",
        },
      })
      .collect();
    const record = await this.mustGet(id);
    const message = await this.repo.createMessage({
      chatId: input.chatId,
      topicId: input.topicId ?? null,
      author: { kind: "agent", id: input.requestedBy },
      kind: "card",
      body: "",
      card: toCard(record),
    });
    await this.db
      .query("UPDATE $id SET message = $m", {
        id: new RecordId("approval", id),
        m: new RecordId("message", message.id),
      })
      .collect();
    return { ...record, messageId: message.id };
  }

  async get(id: string): Promise<ApprovalRecord | null> {
    const [rows] = await this.db
      .query<[Row[]]>("SELECT * FROM approval WHERE id = $id", { id: new RecordId("approval", id) })
      .collect();
    const row = rows?.[0];
    return row ? toRecord(row) : null;
  }

  async listPending(): Promise<ApprovalRecord[]> {
    const [rows] = await this.db
      .query<[Row[]]>("SELECT * FROM approval WHERE status = 'pending' ORDER BY created_at")
      .collect();
    return (rows ?? []).map(toRecord);
  }

  /** Applies the user's decision. Throws if the request is unknown or already decided. */
  async decide(id: string, approve: boolean, decidedBy: string): Promise<ApprovalRecord> {
    if (this.deciding.has(id)) throw new ApprovalError("decided", "This request is being decided");
    this.deciding.add(id);
    try {
      const record = await this.mustGet(id);
      if (record.status !== "pending")
        throw new ApprovalError("decided", `Already ${record.status}`);

      let status: ApprovalStatus = approve ? "approved" : "rejected";
      let result: string | null = null;
      if (approve) {
        const executor = this.executors.get(record.kind);
        try {
          if (!executor) throw new Error(`no executor for ${record.kind}`);
          result = await executor(record.payload, {
            chatId: record.chatId,
            requestedBy: record.requestedBy,
          });
        } catch (error) {
          status = "failed";
          result = errorMessage(error);
          log.error("approved action failed", { approval: id, kind: record.kind, error: result });
        }
      }

      await this.db
        .query(
          "UPDATE $id SET status = $status, result = $result, decided_by = $by, decided_at = time::now()",
          { id: new RecordId("approval", id), status, result: result ?? undefined, by: decidedBy },
        )
        .collect();
      const updated = await this.mustGet(id);
      if (updated.messageId)
        await this.repo.updateMessage(updated.messageId, { card: toCard(updated) });
      return updated;
    } finally {
      this.deciding.delete(id);
    }
  }

  private async mustGet(id: string): Promise<ApprovalRecord> {
    const record = await this.get(id);
    if (!record) throw new ApprovalError("not_found", "Approval request not found");
    return record;
  }
}

function toRecord(row: Row): ApprovalRecord {
  return {
    id: keyOf(row.id),
    kind: row.kind as ApprovalKind,
    requestedBy: String(row.requested_by),
    chatId: keyOf(row.chat),
    messageId: optionalKey(row.message),
    title: String(row.title),
    why: String(row.why),
    preview: String(row.preview),
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as ApprovalStatus,
    result: (row.result as string | undefined) ?? null,
    tryCss: (row.try_css as string | undefined) ?? null,
  };
}

export function toCard(record: ApprovalRecord): ApprovalCard {
  return {
    type: "approval",
    approvalId: record.id,
    kind: record.kind,
    requestedBy: record.requestedBy,
    title: record.title,
    why: record.why,
    preview: record.preview,
    status: record.status,
    result: record.result,
    tryCss: record.tryCss,
  };
}
