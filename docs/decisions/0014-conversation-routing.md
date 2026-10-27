# 0014: Who answers a message

- Status: accepted
- Date: 2026-10-27
- Phase: 11

## Context

In project chats an agent answered only when @mentioned. Messages from the user without a mention
went unanswered. Users expect a messenger to work like one: replying to someone's message addresses
that person, and typing `@` suggests names.

## Decision

- **Agents and bots wake agents only by @mention** (and task or alert cards), never themselves.
  Their replies and names in their text wake nobody. The loop guards (rule 8) are unchanged.
- **A message from the user always has an addressee.** `addresseesOf` in `packages/shared` is used
  by the server to wake agents and by the composer to show who will answer. It checks, in order:
  1. the chat members it @mentions;
  2. otherwise the agent whose message it replies to;
  3. otherwise an agent whose handle starts the message, followed by a comma or colon
     ("coder, …", "Reviewer: …");
  4. otherwise the orchestrator.
     - In a project chat it gets a routing note: hand the message to exactly one teammate with an
       @mention and a one-line restatement, or answer briefly itself. It never answers
       `[no reply]` to the user.
     - In the alerts chat it simply answers.
- In the direct chat the orchestrator answers every message, as before. Mentions of other members
  wake them too.
- **The composer helps address.**
  - `@` anywhere, or `/` at the start, opens suggestions of the chat's agents. Matching is on
    handle, name, then role. Arrow keys, Enter or Tab, and Esc work; picking inserts `@handle `.
  - The line under the box shows the addressee before sending ("→ @reviewer", "→ @orchestrator will
    pass it to the right agent", "you are replying").
  - The agent woken by a reply or a name is told so in its prompt.

## Consequences

- An unaddressed message in a project costs one short orchestrator run before the right agent
  starts. Mentioning or replying skips that hop.
- Routing is a judgement by the model. The composer shows "the orchestrator will pass it on", so the
  user knows to mention someone when it matters.
