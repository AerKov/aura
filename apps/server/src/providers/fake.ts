import type { AgentEvent, AgentRunInput, LLMProvider, ProviderStatus } from "./types";

export type Script = (input: AgentRunInput) => AgentEvent[] | Promise<AgentEvent[]>;

/** Deterministic provider for tests: replays scripted events and records every run input. */
export class FakeProvider implements LLMProvider {
  readonly id = "fake";
  readonly calls: AgentRunInput[] = [];
  status: ProviderStatus = { ok: true };

  constructor(
    private readonly script: Script = () => [
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " there" },
      { type: "usage", inputTokens: 10, outputTokens: 2, costUsd: 0.001 },
      { type: "done" },
    ],
    private readonly delayMs = 0,
  ) {}

  async isAvailable(): Promise<ProviderStatus> {
    return this.status;
  }

  async *run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    this.calls.push(input);
    for (const event of await this.script(input)) {
      if (this.delayMs) await Bun.sleep(this.delayMs);
      if (signal.aborted) {
        yield { type: "error", message: "Stopped", code: "aborted" };
        return;
      }
      yield event;
    }
  }
}
