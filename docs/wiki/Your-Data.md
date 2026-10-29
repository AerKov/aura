# Your data

Everything stays on your computer.

## Where things are

`~/.aura` (change it with `AURA_DATA_DIR`) is a git repository:

```
agents/<handle>/agent.md     agent profiles
skills/<name>/SKILL.md       skills
themes/, snippets/           looks
extensions/<id>/             panels
mcp/servers.json             MCP servers
engines.json                 default engine and models
projects/<slug>/             project folders (each its own git repository; not in the parent repo)
locales/<code>.json          your languages and translation fixes
backups/apps/                backups of uninstalled apps (not in git)
restore-points/              restore points of the whole Aura (not in git)
state/                       database, keys, tokens (not in git)
```

- **Config is files, committed.** Every change by an agent or an approval is a git commit with a
  clear message, so you can see who changed what and revert it (`git log`, `git revert`).
- **State is the database** (`state/db`): chats, messages, runs, tasks, approvals, agent memory.
- **Secrets** in `state/` are readable only by you: API keys (`secrets.json`), the webhook token,
  Web Push keys. Paired devices are stored only as token hashes.

## Backups

**Backups** (in My apps) takes Aura back or forward without leaving the app; see
[The screen](The-Screen#backups-and-restore-points). For a backup outside Aura, copy `~/.aura` while Aura is
closed. For config alone you can push the git repository to a private
remote. Do not publish `state/`.

## What leaves your computer

Only what you choose: prompts and context go to the engine you picked (Anthropic, Google, OpenAI,
OpenRouter…, or nowhere for local models), web pages that agents fetch, and Web Push notifications
through your browser's push service. Aura has no telemetry and no account.
