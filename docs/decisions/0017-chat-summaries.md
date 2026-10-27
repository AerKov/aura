# 0017: Rolling chat summaries

- Status: accepted
- Date: 2026-10-27
- Phase: 14

## Context

Each run gets the last 30 messages of its chat (`CONTEXT_WINDOW`). In a long project chat, agents
lost what was decided earlier unless someone saved it as a memory note (ADR 0013). Sending the whole
chat would grow cost without limit.

## Decision

- **One rolling summary per chat**, stored in SurrealDB (`chat_summary`, keyed by the chat id) with
  the last message it covers (`up_to`) and how many it covers.
- **Batches.** After a run, if at least `CONTEXT_WINDOW + SUMMARY_BATCH` (30 + 20) messages
  follow the summary, the messages older than the last 30 are folded in: previous summary + new
  messages → new summary. A reply still being written is never folded. A chat that was never
  summarized catches up in up to 10 steps of 200 messages each.
- **What agents see.** The summary goes first as `<earlier_in_this_chat>`, labeled as a record and
  not instructions. Then come all messages after `up_to`, at most 30 + 20, so nothing falls between
  the summary and the window.
- **Who writes it.** The orchestrator's engine and model, as a one-turn run with no tools. It is
  recorded as an orchestrator run in that chat and project, so it counts towards budgets and stops
  when either budget is used up (CLAUDE.md rule 8). Each call is capped at $0.25.
- **Injection.** The summarizer is told that messages are data and to record requests rather than
  follow them. The agent prompt marks the summary as a record, not instructions.
- **The user decides.** Summaries are on by default and can be turned off on the Memory page
  (`summaries` in `engines.json`). A chat's summary opens from its header ("Summary"), and
  "Forget this summary" deletes it.

## Not yet

- Summaries are not searchable from `recall`. Memory notes stay the place for facts meant to last
  across chats.
- No per-chat opt-out.
