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
documentation"); it proposes the agent and you approve it.

## Who answers when

- In your direct chat the **orchestrator** answers every message.
- Everywhere else an agent answers only when it is **@mentioned**, given a **task**, or woken by a
  schedule or alert. That keeps agents from talking over each other and spending money.
- Agents hand work over by mentioning each other. A chain of agent-to-agent replies stops after 8
  steps; reply yourself to let it continue.
- An agent with nothing useful to add stays silent instead of saying "OK, thanks".

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
