# Architecture

```
┌──────────────────────────── your computer ─────────────────────────────┐
│  Tauri app: React UI (chats, cards, panels, sandboxed extensions)      │
│          │ HTTP (Eden Treaty) + WebSocket                              │
│  Bun server (sidecar): Elysia                                          │
│   ├─ chat + realtime          ├─ approvals, skills, tasks              │
│   ├─ orchestrator + agents    ├─ alerts (webhooks), scheduler          │
│   ├─ guards (budgets, chains) ├─ customization, devices, push          │
│   └─ engines ─┬ Claude Agent SDK ── Claude Code                         │
│               ├ ACP ── Gemini CLI / Codex / OpenCode                    │
│               └ Aura loop ── OpenRouter / Ollama / OpenAI-compatible    │
│  SurrealDB (embedded)        ~/.aura (git: agents, skills, themes…)     │
└─────────────────────────────────────────────────────────────────────────┘
      ▲ phones connect over your network (paired, thin client)
```

- **Monorepo** (Bun workspaces): `apps/server`, `apps/desktop`, `packages/shared` (the message
  protocol and shared types, the single source of truth).
- **Config in files, state in the database.** Agents, skills, themes, extensions and MCP servers are
  files in a git repository; chats, runs, tasks and approvals live in an embedded SurrealDB with live
  queries feeding the WebSocket.
- **One way to models:** the `LLMProvider` interface ("engines"). Feature code never calls a model
  SDK directly.
- **Agents act through tools**, all checked by the app: the agent's grants, the workspace, approvals
  for side effects.

## Decisions

The reasons behind the design are recorded as ADRs in
[docs/decisions](https://github.com/AerKov/aura/tree/HEAD/docs/decisions):

| ADR  | Topic                                                    |
| ---- | -------------------------------------------------------- |
| 0001 | SurrealDB embedded in the server                         |
| 0002 | Server ↔ desktop wiring (sidecar)                        |
| 0003 | Automatic local session                                  |
| 0004 | Claude Agent SDK under the user's own login              |
| 0005 | Agents as files, projects, scheduling and guards         |
| 0006 | Approvals, skills, tasks                                 |
| 0007 | Alerts and scheduling                                    |
| 0008 | Customization by chat, extensions sandbox, safe mode     |
| 0009 | Phone client, pairing, notifications                     |
| 0010 | Visual identity                                          |
| 0011 | Engines and Aura's own agent loop                        |
| 0012 | Agent apps over the Agent Client Protocol                |
| 0013 | Agent memory: notes, hybrid search                       |
| 0014 | Who answers a message: mentions, replies, names, routing |
| 0015 | OS sandbox for agents' shell commands                    |

The full product and architecture spec, including the roadmap, is
[docs/SPEC.md](https://github.com/AerKov/aura/blob/HEAD/docs/SPEC.md).
