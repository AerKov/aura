# Catalog

The **Catalog** page (the box icon in the rail) installs ready-made **packs**: [apps](Apps) (CRM,
Tasks, Notes and apps others publish), agents with their
prompts, skills, themes, CSS snippets and panel extensions.

## Built-in packs

| Pack         | What you get                                             |
| ------------ | -------------------------------------------------------- |
| Dev team     | `@coder` and `@reviewer`, skill `test-first`             |
| Writing team | `@writer` and `@editor`, skill `plain-language`          |
| Research     | `@researcher` with web search, skill `cite-sources`      |
| On-call      | `@oncall` for monitoring alerts, skill `incident-triage` |
| Themes       | themes Paper, Midnight and Forest, snippet `compact`     |
| Alerts panel | a panel with today's alerts (reads alerts only)          |

## Installing

1. Click **Install**. Nothing is written yet. You see every file the pack adds, as one of:
   - **new**;
   - **replaced**, with a diff against your current file;
   - **unchanged**.

   Warnings are listed too: an agent that gets a shell, an extension that can post, a file that will
   be replaced.
2. Click **Install these files**. Aura writes them into your data folder as one git commit,
   `pack(<id>): install <version>`. You can revert it like any other change
   (see [Your data](Your-Data)).
3. New agents appear right away. Add them to a project, or mention them. Themes appear under
   Customize. Panel extensions are enabled with the permissions you saw.

You can also ask the orchestrator in your direct chat, for example: _"set me up with a dev team"_.
It finds the matching pack and asks for approval with the same preview.

## From a link

Paste a GitHub repository, a folder (`https://github.com/owner/repo/tree/main/packs/qa`), or a direct
https link to a `pack.json`. Aura downloads it, checks every file, and shows the same preview with an
extra warning that the pack is not from the built-in catalog. **Read what it adds before you
install it.** Its prompts become your agents' instructions.

If the pack changes between the preview and the install, Aura refuses to install. It compares a
sha256 hash of the content you saw.

## Making a pack

A pack is a folder with `pack.json` and the files it lists:

```json
{
  "id": "qa-team",
  "name": "QA team",
  "version": "1.0.0",
  "description": "A tester who writes end-to-end tests.",
  "author": "you",
  "tags": ["team"],
  "files": ["agents/tester/agent.md", "skills/e2e/SKILL.md"]
}
```

Allowed files:

- `agents/<handle>/agent.md`
- `skills/<name>/SKILL.md`
- `themes/<name>/theme.css`
- `snippets/<name>.css`
- `extensions/<id>/manifest.json`, `main.js` and `styles.css`

Limits: 60 files, 200 KB per file and 1 MB in total. MCP servers cannot be part of a pack, because
they run programs on your computer. Add those yourself under Customize.

Push the folder to GitHub and share the link.
