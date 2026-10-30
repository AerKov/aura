import { RecordId, type Surreal } from "surrealdb";

export type RunStatus = "running" | "done" | "error" | "stopped";

export interface RecentRun {
  id: string;
  chatId: string;
  chatTitle: string | null;
  status: RunStatus;
  error: string | null;
  at: string;
  tokens: number;
  costUsd: number;
  /** How many tool calls it made. */
  tools: number;
  /** Notes from memory it was given. */
  memory: { id: string; text: string }[];
}

/** Audit log of agent runs (docs/SPEC.md section 10) and the source of spend totals for budgets. */
export class RunRepo {
  constructor(private readonly db: Surreal) {}

  async start(input: {
    agent: string;
    chatId: string;
    projectId: string | null;
    triggerMessageId: string | null;
    provider: string;
    model: string | null;
  }): Promise<string> {
    const id = Bun.randomUUIDv7();
    await this.db
      .query("CREATE $id CONTENT $content", {
        id: new RecordId("run", id),
        content: {
          agent: input.agent,
          chat: new RecordId("chat", input.chatId),
          project: input.projectId ?? undefined,
          trigger_message: input.triggerMessageId
            ? new RecordId("message", input.triggerMessageId)
            : undefined,
          provider: input.provider,
          model: input.model ?? undefined,
          status: "running",
        },
      })
      .collect();
    return id;
  }

  async attachReply(runId: string, messageId: string): Promise<void> {
    await this.db
      .query("UPDATE $id SET reply_message = $m", {
        id: new RecordId("run", runId),
        m: new RecordId("message", messageId),
      })
      .collect();
  }

  async finish(
    runId: string,
    result: {
      status: Exclude<RunStatus, "running">;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      toolCalls: { name: string; summary: string; isError: boolean }[];
      error: string | null;
    },
  ): Promise<void> {
    await this.db
      .query(
        `UPDATE $id SET status = $status, tokens_in = $tin, tokens_out = $tout, cost_usd = $cost,
           tool_calls = $tools, error = $error, ended_at = time::now()`,
        {
          id: new RecordId("run", runId),
          status: result.status,
          tin: result.tokensIn,
          tout: result.tokensOut,
          cost: result.costUsd,
          tools: result.toolCalls,
          error: result.error ?? undefined,
        },
      )
      .collect();
  }

  /** Notes from agent memory that were put into the run's prompt (ADR 0032). */
  async recordMemory(runId: string, notes: { id: string; text: string }[]): Promise<void> {
    await this.db
      .query("UPDATE $id SET memory = $notes", { id: new RecordId("run", runId), notes })
      .collect();
  }

  /** The agent's recent runs, newest first, for the Agents page. */
  async recent(agent: string, limit = 20): Promise<RecentRun[]> {
    const [rows] = await this.db
      .query<[Record<string, unknown>[]]>(
        `SELECT id, chat, chat.title AS chat_title, status, error, started_at, tokens_in, tokens_out,
           cost_usd, tool_calls, memory FROM run WHERE agent = $agent ORDER BY started_at DESC LIMIT $limit`,
        { agent, limit },
      )
      .collect();
    return (rows ?? []).map((row) => ({
      id: row.id instanceof RecordId ? String(row.id.id) : String(row.id),
      chatId: row.chat instanceof RecordId ? String(row.chat.id) : String(row.chat),
      chatTitle: typeof row.chat_title === "string" ? row.chat_title : null,
      status: row.status as RunStatus,
      error: typeof row.error === "string" ? row.error : null,
      at: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
      tokens: Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0),
      costUsd: Number(row.cost_usd ?? 0),
      tools: Array.isArray(row.tool_calls) ? row.tool_calls.length : 0,
      memory: Array.isArray(row.memory)
        ? row.memory.flatMap((n: unknown) =>
            n && typeof n === "object" && "id" in n && "text" in n
              ? [{ id: String(n.id), text: String(n.text) }]
              : [],
          )
        : [],
    }));
  }

  /** Marks runs left `running` by a crash as stopped. */
  async recoverInterrupted(): Promise<number> {
    const [rows] = await this.db
      .query<[unknown[]]>(
        "UPDATE run SET status = 'stopped', error = 'Interrupted by a restart', ended_at = time::now() WHERE status = 'running' RETURN id",
      )
      .collect();
    return rows?.length ?? 0;
  }

  /** The agent's most recent run, for its status card. */
  async latest(
    agent: string,
  ): Promise<{ status: RunStatus; error: string | null; at: string } | null> {
    const [rows] = await this.db
      .query<[Record<string, unknown>[]]>(
        "SELECT status, error, started_at FROM run WHERE agent = $agent ORDER BY started_at DESC LIMIT 1",
        { agent },
      )
      .collect();
    const row = rows?.[0];
    if (!row) return null;
    return {
      status: row.status as RunStatus,
      error: typeof row.error === "string" ? row.error : null,
      at: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
    };
  }

  async spentByAgent(agent: string): Promise<{ usd: number; tokens: number }> {
    return this.spent("agent = $value", agent);
  }

  async spentByProject(projectId: string): Promise<{ usd: number; tokens: number }> {
    return this.spent("project = $value", projectId);
  }

  /** What each project spent, from one query (projects without runs are left out). */
  async spentByProjects(): Promise<Map<string, { usd: number; tokens: number }>> {
    const [rows] = await this.db
      .query<[{ project: unknown; usd: number; tokens: number }[]]>(
        "SELECT project, math::sum(cost_usd) AS usd, math::sum(tokens_in + tokens_out) AS tokens FROM run WHERE project != NONE GROUP BY project",
      )
      .collect();
    const out = new Map<string, { usd: number; tokens: number }>();
    for (const row of rows ?? []) {
      if (typeof row.project !== "string") continue;
      out.set(row.project, { usd: Number(row.usd ?? 0), tokens: Number(row.tokens ?? 0) });
    }
    return out;
  }

  private async spent(where: string, value: string): Promise<{ usd: number; tokens: number }> {
    const [rows] = await this.db
      .query<[{ usd: number; tokens: number }[]]>(
        `SELECT math::sum(cost_usd) AS usd, math::sum(tokens_in + tokens_out) AS tokens FROM run WHERE ${where} GROUP ALL`,
        { value },
      )
      .collect();
    const row = rows?.[0];
    return { usd: Number(row?.usd ?? 0), tokens: Number(row?.tokens ?? 0) };
  }
}
