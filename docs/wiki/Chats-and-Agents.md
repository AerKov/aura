# Chats and agents

Aura has only three kinds of chats, so there is little to learn:

- **Orchestrator**: your direct chat. Plan, ask questions, create agents and projects, customize Aura.
- **Projects**: one group chat per project, with its agents. The work happens here.
- **Signals**: alerts from monitoring and other systems.

There are no channels or threads. You can **reply** to any message (hover it and press the reply
arrow), like in a messenger.

## Agents

An agent is a file: `~/.aura/agents/<handle>/agent.md`. It has a name, a role, an
[engine](Engines) and model, the built-in tools it may use (least privilege: a reviewer may only
read and run tests), an optional lifetime budget, its [skills](Skills), and its instructions.

You usually do not write these files. Ask the orchestrator ("I need someone who writes good
documentation"); it proposes the agent and you approve it. It can also change an agent ("give
@coder a shell and the GITLAB_URL variable"), again on an approval card that shows the exact change, and add
an agent to a project. The orchestrator has this guide built in, so you can ask it how Aura works.

The **Agents** page shows each agent's engine and model, its tools (and the ones its engine does
not provide), the variables its commands get, its tool servers, its chats and its last error,
with a list of what stops it from working. You can change its tools and variables there. The file
is read on every reply, so changes need no restart.

Built-in tools are `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `WebSearch` and `WebFetch`. Tools
from MCP servers are granted on the [Agents](Agents) page, under Tool servers, not in this list.

## Who answers when

Every message you write gets an answer, from the agent you address:

1. **Mention** someone: type `@` (or `/` at the start) and pick from the list.
2. **Reply** to an agent's message (hover it, press the reply arrow): that agent answers.
3. **Name** an agent first: "coder, add a test for -0" goes to @coder.
4. **Just write**: in your direct chat the orchestrator answers; in a project, the orchestrator reads
   the request and passes it to the right agent (or answers itself, for questions about status).

The line under the message box shows who will answer before you send.

Agents answer only in chats they belong to. Your direct chat has just the orchestrator; other
agents work in project chats. If you mention an agent that is not in the chat, Aura says so and
tells you where it is. If a model returns an empty answer, the reply shows that as an error instead
of staying blank.

Agents work the same way among themselves, but stricter: they wake each other only with an
@mention, so they do not talk over each other or spend money on chatter. A chain of agent-to-agent
replies stops after 8 steps; reply yourself to let it continue. An agent with nothing useful to add
stays silent instead of saying "OK, thanks".

**Passing a message on.** Ask the orchestrator to write something into another chat it is in (a
project's chat, the alerts chat): _"tell the Site chat that we deploy at 5"_. It posts as itself,
marked as sent at your request from the chat you asked in. It does this only when you ask in your
own message, never on its own.

## Topics

Every chat can be split into **topics**, like forum topics in Telegram: **General** plus the ones
you create with **+ Topic** under the chat's header (for example _Customization_ and _Work_).

- A topic shows only its own messages. Agents woken in a topic see only that topic, answer in it,
  and their cards (approvals, tasks) land there too; each topic has its own summary.
- Wrote something in the wrong place? Hover the message and use the arrows button to **move** it to
  another topic.
- Rename or close a topic from its **⋯** menu (or right-click). A closed topic is read-only until
  you reopen it.

## Projects

A project is a chat, a folder at `~/.aura/projects/<slug>` (a git repository) and a budget.

- The orchestrator proposes it with a brief, a team and a budget; you approve once for the whole plan.
- Only the agent named to start is woken; the rest join when mentioned.
- Agents in one project work one at a time, because they share the folder. After each run the
  changes are committed as that agent, so every step can be inspected and reverted with git.
- **Tasks** (the Tasks button in the header): agents create and update tasks as they plan; you can
  change their status too. A new task wakes the agent it is assigned to.

## Run cards

Each agent reply shows what happened during the run: the tools it used (expand to see them), the
commit it made and the tokens it used (hover for the estimated price at API rates). **Stop** ends a
running reply.

## Budgets

A budget is optional. Without one, a project has no limit; agents still stop after 8 replies to each
other in a row.

- **Project budget**: the button in the chat header shows the tokens used and the limit (∞ for
  none). Click it to set a limit in **tokens**, in **dollars**, or none. At 80% agents are warned;
  at 100% they stop until you raise or remove it.
- **Agent budget**: optional, across all projects, on the agent's card on the **Agents** page.
- **Tokens or dollars?** Under a subscription (Claude Code, Gemini CLI, Codex, OpenCode) nobody bills
  you per run: the dollar amount is only an estimate at API prices, and what runs out is your plan's
  usage, so limit tokens. Use dollars for paid APIs (OpenRouter, an OpenAI-compatible API), where
  they are real money.
- A dollar limit also caps each run; a token limit is checked before each run, so the last run may
  go a little over it.
- The orchestrator can propose a new limit; it applies when you approve the card.

## Language

Agents answer in the language you write in.
