# 0006: Approvals, skills and tasks

- Status: accepted
- Date: 2026-10-27
- Phase: 4

## Approvals

- `ApprovalService` stores a request (`approval` table) and posts an approval card into the chat. The
  side effect is an **executor registered per kind** and runs only after the user approves, exactly once
  (decisions are serialized per id; a decided request answers 409). A failing effect is recorded as
  `failed` with the error on the card.
- Gated now: `create_project` (one card for the whole plan: project + new agents), `create_agent`,
  `skill_change`. Executors re-validate at execution time.
- v1: only the user decides (the spec allows the orchestrator to approve skill changes; that would be an
  opt-in setting later). Approval cards are data in the chat, so they survive restarts and sync to
  every window.

## Skills

- `skills/<name>/SKILL.md` in the user data repo: frontmatter `description` + instructions. Agent
  profiles list them in `skills:`; the runtime appends attached skills to the agent's system prompt.
- Agents propose changes with `propose_skill_change` (a regular agent only for itself; the orchestrator
  may attach to others). The approval preview is a unified diff (`lib/diff.ts`).
- Versions are git commits touching the file; `skill_index` records the active ref. Rollback restores the
  file from a chosen commit as a new commit (history is never rewritten).

## Tasks

- `task` table per project; tools `create_task`, `update_task`, `list_tasks` in project chats; the user
  can change statuses in the tasks panel. Creating a task posts a task card that wakes the assignee,
  like a mention (chain depth +1, same guards).
