import { RecordId, type Surreal } from "surrealdb";

export type RunStatus = "running" | "done" | "error" | "stopped";

export interface RunRecord {
  id: string;
  agent: string;
  chatId: string;
  projectId: string | null;
  status: RunStatus;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
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
