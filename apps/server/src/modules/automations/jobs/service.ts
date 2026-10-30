import type { Job, JobStatus } from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { keyOf, optionalIso } from "../../../db/convert";
import { errorMessage, log } from "../../../lib/log";
import type { ChatRepo } from "../../chats/chat/repo";
import type { ChatService } from "../../chats/chat/service";

export class JobError extends Error {
  override name = "JobError";
}

export interface JobInput {
  name: string;
  schedule: string;
  chatId: string;
  agent: string;
  prompt: string;
}

type Row = Record<string, unknown>;

export const MIN_INTERVAL_MS = 10 * 60_000;

/** Next fire time after `from`, or a JobError for an invalid expression. */
export function nextRun(schedule: string, from: Date): Date {
  let next: Date | null;
  try {
    next = Bun.cron.parse(schedule, from);
  } catch (error) {
    throw new JobError(`invalid schedule "${schedule}": ${errorMessage(error)}`);
  }
  if (!next) throw new JobError(`schedule "${schedule}" never fires`);
  return next;
}

/** Rejects schedules that fire more often than every 10 minutes (each run costs money). */
export function assertReasonableSchedule(schedule: string, from = new Date()): void {
  const first = nextRun(schedule, from);
  const second = nextRun(schedule, first);
  if (second.getTime() - first.getTime() < MIN_INTERVAL_MS) {
    throw new JobError("jobs may run at most every 10 minutes");
  }
}

/**
 * Scheduled jobs (docs/SPEC.md section 5, `job`): on schedule, a scheduler bot posts the job's prompt
 * into its chat, @mentioning the agent, which wakes it like any mention (budgets and guards apply).
 */
export class JobService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly deps: {
      db: Surreal;
      repo: ChatRepo;
      chat: ChatService;
      now?: () => Date;
      /** False while the Schedule app is off (ADR 0027): nothing runs. */
      enabled?: () => boolean;
    },
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async validate(input: JobInput): Promise<JobInput> {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new JobError("name is required (max 80 chars)");
    assertReasonableSchedule(input.schedule.trim(), this.now());
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 4000) throw new JobError("prompt is required (max 4000 chars)");
    const chat = await this.deps.repo.findChat(input.chatId);
    if (!chat) throw new JobError(`chat ${input.chatId} not found`);
    const agent = input.agent.replace(/^@/, "");
    if (!(await this.deps.repo.isMember(chat.id, { kind: "agent", id: agent }))) {
      throw new JobError(`@${agent} is not a member of "${chat.title}"`);
    }
    return { name, schedule: input.schedule.trim(), chatId: chat.id, agent, prompt };
  }

  async create(input: JobInput): Promise<Job> {
    const valid = await this.validate(input);
    const id = Bun.randomUUIDv7();
    await this.deps.db
      .query("CREATE $id CONTENT $content", {
        id: new RecordId("job", id),
        content: {
          name: valid.name,
          schedule: valid.schedule,
          chat: new RecordId("chat", valid.chatId),
          agent: valid.agent,
          prompt: valid.prompt,
          status: "active",
          next_run_at: nextRun(valid.schedule, this.now()),
        },
      })
      .collect();
    return this.mustGet(id);
  }

  async list(): Promise<Job[]> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM job ORDER BY created_at")
      .collect();
    return (rows ?? []).map(toJob);
  }

  async setStatus(id: string, status: JobStatus): Promise<Job> {
    const job = await this.mustGet(id);
    await this.deps.db
      .query("UPDATE $id SET status = $status, next_run_at = $next", {
        id: new RecordId("job", id),
        status,
        next: status === "active" ? nextRun(job.schedule, this.now()) : undefined,
      })
      .collect();
    return this.mustGet(id);
  }

  async remove(id: string): Promise<void> {
    await this.mustGet(id);
    await this.deps.db.query("DELETE $id", { id: new RecordId("job", id) }).collect();
  }

  /** Runs every due job once and schedules its next run. Safe to call often. */
  async tick(): Promise<number> {
    if (this.ticking || this.deps.enabled?.() === false) return 0;
    this.ticking = true;
    try {
      const [rows] = await this.deps.db
        .query<[Row[]]>("SELECT * FROM job WHERE status = 'active' AND next_run_at <= $now", {
          now: this.now(),
        })
        .collect();
      for (const row of rows ?? []) await this.fire(toJob(row));
      return rows?.length ?? 0;
    } finally {
      this.ticking = false;
    }
  }

  start(intervalMs = 15_000): () => void {
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) =>
        log.error("scheduler tick failed", { error: errorMessage(error) }),
      );
    }, intervalMs);
    return () => {
      if (this.timer) clearInterval(this.timer);
    };
  }

  private async fire(job: Job): Promise<void> {
    let error: string | null = null;
    try {
      const chat = await this.deps.repo.getChat(job.chatId);
      const message = await this.deps.repo.createMessage({
        chatId: job.chatId,
        author: { kind: "bot", id: "scheduler" },
        body: `@${job.agent} ⏰ **${job.name}**\n\n${job.prompt}`,
        mentions: [job.agent],
      });
      this.deps.chat.notify(message, chat);
    } catch (e) {
      error = errorMessage(e);
      log.error("scheduled job failed", { job: job.id, error });
    }
    await this.deps.db
      .query("UPDATE $id SET last_run_at = $now, next_run_at = $next, last_error = $error", {
        id: new RecordId("job", job.id),
        now: this.now(),
        next: nextRun(job.schedule, this.now()),
        error: error ?? undefined,
      })
      .collect();
  }

  private async mustGet(id: string): Promise<Job> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM job WHERE id = $id", { id: new RecordId("job", id) })
      .collect();
    const row = rows?.[0];
    if (!row) throw new JobError("job not found");
    return toJob(row);
  }
}

function toJob(row: Row): Job {
  return {
    id: keyOf(row.id),
    name: String(row.name),
    schedule: String(row.schedule),
    chatId: keyOf(row.chat),
    agent: String(row.agent),
    prompt: String(row.prompt),
    status: row.status as JobStatus,
    nextRunAt: optionalIso(row.next_run_at),
    lastRunAt: optionalIso(row.last_run_at),
    lastError: (row.last_error as string | undefined) ?? null,
  };
}
