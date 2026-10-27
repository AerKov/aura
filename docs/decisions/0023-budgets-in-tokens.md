# 0023: Optional budgets, in tokens or dollars

- Status: accepted
- Date: 2026-10-27
- Phase: 20

## Context

Projects had a required dollar budget, set only when the project was created. Under a subscription
(Claude Code, Gemini CLI, Codex, OpenCode) the dollars are an estimate at API prices that nobody
pays, so the ring in the chat header showed numbers that meant little, and a used-up budget could
not be raised.

## Decision

- A project and an agent each have two optional limits: `budgetUsd` and `budgetTokens`. None means
  no limit. A run is not started when either limit is reached; 80% of either posts a warning.
- Tokens are input plus output tokens of every run, cache included, as the engine reports them. A
  dollar limit also caps each run (`maxBudgetUsd`); engines cannot cap a run by tokens, so a token
  limit is checked between runs.
- New projects have no limit unless the user or the plan sets one. The chain-depth guard (8 replies
  in a row) still stops runaway loops, so rule 8 holds without a budget.
- The user sets, changes or removes a limit from the project chat header and the agent's card. The
  orchestrator proposes one with `propose_budget` (approval kind `budget_change`); `create_project`
  takes an optional limit in tokens or dollars and is told which fits which engine.
- Replies show tokens; the dollar estimate is in the tooltip, labelled as API prices.

## Consequences

- Existing projects keep their dollar budget and can switch to tokens.
- An agent's token limit is a file field (`budget_tokens` in `agent.md`), like `budget_usd`.
