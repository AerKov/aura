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
@redmine a shell and REDMINE_URL"), again on an approval card that shows the exact change, and add
an agent to a project. The orchestrator has this guide built in, so you can ask it how Aura works.

The **Agents** page shows each agent's engine and model, its tools (and the ones its engine does
not provide), the variables its commands get, its tool servers, its chats and its last error,
with a list of what stops it from working. You can change its tools and variables there. The file
is read on every reply, so changes need no restart.

Built-in tools are `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `WebSearch` and `WebFetch`. Tools
from MCP servers are granted on the [Integrations](Integrations) page, not in this list.

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
commit it made, tokens and cost. **Stop** ends a running reply.

## Budgets

- **Project budget**: the ring in the chat header. At 80% agents are warned; at 100% they stop.
- **Agent budget**: optional, across all projects.
- Each run is capped by the smallest budget that is left.

## Language

Agents answer in the language you write in.
