# Changelog

Versions follow the roadmap phases in [docs/SPEC.md](docs/SPEC.md). The format is based on
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- Conversation flow: typing `@` (or `/` at the start) suggests the chat's agents; replying to an
  agent's message wakes that agent; a message that starts with an agent's name goes to it; anything
  else in a project goes to the orchestrator, which passes it to the right agent. The composer shows
  who will answer before you send. Messages in the alerts chat are answered by the orchestrator.

- Agent memory: agents remember notes across runs (their own, and shared per project) and get the
  relevant ones in every run; keyword search in any language, optional semantic search with a local
  embedding model; Memory screen to review and delete notes.
- Fix: skills attached to an agent now reach its instructions (they were never added since 0.4).

- Project page: README, wiki (published from `docs/wiki`), license, contributing and security
  guides, issue and pull request templates.
- CI (typecheck, lint, tests, sidecar smoke test) and release builds for macOS, Windows and Linux.
- App icon and bundle metadata.

## [0.9.0] - 2026-10-27: Agent engines

- Engines page: choose what runs your agents, for all agents or per agent.
- Gemini CLI, Codex and OpenCode as engines over the Agent Client Protocol, under their own logins;
  Aura decides their permission requests and serves file access inside the project.
- Aura's own agent loop on OpenRouter (free models), Ollama and any OpenAI-compatible server, with
  built-in file, search, shell and web fetch tools and the agent's MCP servers.
- App tools reach external agents through a per-run MCP endpoint.
- Local model handling: hidden `<think>` reasoning, capped tool output, context-length hint.
- New look: cool surface, one blue accent, rounded shapes.

## [0.8.0]: Visual identity

- Aura's own design instead of a messenger clone: navigation rail, agent marks, run cards.

## [0.7.0]: Phone

- The web app served to phones, pairing with a one-time code, device tokens, Web Push notifications.

## [0.6.0]: Customization by chat

- Themes and CSS snippets with Try it, MCP servers per agent, sandboxed panel extensions, safe mode.

## [0.5.0]: Alerts and schedules

- Webhook alerts with deduplication and orchestrator triage; recurring jobs.

## [0.4.0]: Approvals, skills, tasks

- Approval cards for side effects, versioned skills with rollback, project tasks.

## [0.3.0]: Agents and projects

- Agents as files, projects as chat + git workspace + budget, guards (chain depth, budgets).

## [0.2.0]: Orchestrator

- The orchestrator on the Claude Agent SDK under the user's own Claude Code login.

## [0.1.0]: Chat core

- Chats, realtime over WebSocket, markdown, automatic local session.
