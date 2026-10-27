# 0005: Agents as files, projects as chat + workspace, run scheduling and guards

- Status: accepted
- Date: 2026-10-27
- Phase: 3

## Decisions

**User data directory.** `~/.aura` is a git repo from the first start (`state/` and `projects/` are
ignored). Agent profiles live in `agents/<handle>/agent.md`: YAML frontmatter (`name`, `role`, `model`,
`tools`, `budget_usd`) + system prompt. Values are validated on read and on creation; a broken file is
skipped and reported. Every profile change is a commit (CLAUDE.md rule 10).

**Orchestrator tools** (in-process MCP via the provider): `list_agents`, `create_agent`, `list_projects`,
`create_project`. Inputs are validated server-side (handle/slug patterns, tool allow-list, budget limits),
because models can send anything. Phase 4 puts approvals in front of these side effects.

**Projects.** A project is a group chat, a git workspace at `~/.aura/projects/<slug>` (seeded with
`BRIEF.md`) and a USD budget. The orchestrator's brief is the first message; it wakes only `start_with`
(other agents in the brief are context), so a brief that names the whole team does not start everyone.

**Running agents.**
- Context: profile prompt + app "team rules" (hand-off, mention discipline, `[no reply]`) + the user's
  language in the system prompt; recent chat window + trigger in the prompt.
- Sandbox level 0: `cwd` is the workspace and every non-app tool call goes through `canUseTool`, which
  allows only granted tools and only paths inside the workspace (and denies Claude Code's `blockedPath`).
  Bash is allowed when granted; a container sandbox is "Later".
- The orchestrator gets read-only tools in project chats and never commits.
- Scheduling lanes: one run per agent per chat, and **one run at a time per project**, since agents share
  the workspace and its commits. Pending triggers queue per lane (latest per agent wins). Git worktrees
  for parallel coding are deferred.
- After each run of an agent that can write, the app commits all changes as that agent; if the agent
  committed itself, the new HEAD is shown on the run card.
- A reply of exactly `[no reply]` removes the placeholder message (`message.deleted` event): agents stop
  acknowledging each other, which was the main budget leak in the first real run.

**Guards** (`modules/agents/guards.ts`, unit-tested): chain depth max 8 (one notice per chain), budgets
per agent and per project (warning at 80%, refusal at 100%), and each run capped by the smallest
remaining budget through the SDK's `maxBudgetUsd`.

## Result

Acceptance ("build a small CLI tool"): the orchestrator created `@coder` and `@reviewer`, the coder built
a `wc` clone with 12 passing tests, the reviewer verified it against GNU `wc`, the orchestrator posted a
summary. 4 agent messages, $0.13 of a $3 budget.
