# Your data

Everything stays on your computer.

## Where things are

`~/.aura` (change it with `AURA_DATA_DIR`) is a git repository:

```
agents/<handle>/agent.md     the Helper's and @builder's profiles
themes/, snippets/           the look
locales/<code>.json          your languages and translation fixes
engines.json                 the AI: default engine and models
projects/<app>/              each app's folder (its own git repository; not in the parent repo)
files/chats/, files/apps/    files attached to chats and kept by apps (not in git)
backups/apps/                backups of uninstalled apps (not in git)
state/                       the database, apps' databases, keys (not in git)
```

- **Config is files, committed.** Every change by a helper or an approval is a git commit with a
  clear message (`git log`, `git revert`).
- **State is the database** (`state/db`): chats, messages, runs, approvals.
- **Secrets** (`state/secrets.json`) are readable only by you: AI keys and apps' secrets.

## Backups

Every app keeps its versions, and an uninstalled app waits in **Settings → History**. For a backup
of everything, copy `~/.aura` while Aura is closed. Do not publish `state/`.

## What leaves your computer

Only what you choose: prompts and context go to the AI you picked (Anthropic, or nowhere for a
local model), web pages a helper fetches, and requests your apps make to the hosts you allowed.
Aura has no telemetry and no account.
