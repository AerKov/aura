# 0032: Everything about an agent on its card: the full prompt, its versions, its memory per run

- Status: accepted
- Date: 2026-10-28
- Phase: 34

## Context

Feedback on 0.31 (WISH-9, WISH-11): the user could not see what an agent is actually told. Aura adds
team rules, skills, the Aura guide, the sandbox note, variable names, memory notes and the user's
language at run time, and none of it was visible. Editing a prompt meant editing `agent.md` by hand
or asking the orchestrator, with no history at hand. Memory showed what is stored, not what a run
was given.

## Decision

- The runtime builds the system prompt from named **parts** (`agents/prompt.ts`: `profile`, `team`,
  `skills`, `guide`, `sandbox`, `environment`, `memory`, `user`). The same function serves runs and
  `GET /agents/:handle/prompt`, so what the page shows is what runs. Memory notes depend on the
  message, so the page shows a placeholder for them; team rules are shown as in a project chat.
- **Its own prompt is editable on the card.** The user edits it, reviews the diff
  (`POST /agents/:handle/prompt/diff`) and saves it with `PUT /agents/:handle/settings`; the save is
  one commit (`agents(@x): update prompt`). This is a user action, so no approval card.
- **Versions** are the git history of `agents/<handle>/agent.md` (`GET /agents/:handle/prompt` lists
  them, `GET /agents/:handle/prompt/:ref` returns that version and its diff). Bringing one back puts
  it into the editor, and saving it is a new commit.
- **Memory per run:** each run records the notes it was given (`run.memory`). The card lists the
  agent's notes and its recent runs (`GET /agents/:handle/runs`) with the notes each one got;
  errors are shown with secret values hidden.

## Consequences

- Variable values and secrets never appear in a prompt part; only names do, as in the prompt itself.
- Parts added in later phases must come through `systemPromptParts`, or the page stops telling the
  truth.
