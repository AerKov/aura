# Skills

A **skill** is reusable know-how: "how we write tests here", "our release checklist", "how to use
the CLI of our cloud". It is a Markdown file at `~/.aura/skills/<name>/SKILL.md` with a short
description and instructions. Agents with that skill get it in their instructions on every run.

## Getting skills

Ask the orchestrator: "give @coder a skill for writing Bun tests". It drafts the skill and you
approve it.

## Agents improve their skills

When an agent learns something (a fix that worked, a convention you asked for), it can propose a
change to its own skill. You see the change as a diff and approve or reject it. The orchestrator may
propose skills for other agents.

## History

Every version is a git commit. The **Skills** screen (sparkles icon) shows each skill, its versions
and the agents that use it, and can roll back to an earlier version (as a new commit; history is
never rewritten).
