# Memory

Agents keep **notes** between runs, so they do not forget a decision, your preferences, or a fact
they had to dig up.

- **Own notes** belong to one agent and go with it everywhere ("the user wants short answers").
- **Project notes** are shared by the agents of a project ("deploys go to fly.io with flyctl").

Agents save notes themselves while they work. You can also just say it:

> Remember that I prefer Bun over Node for new projects.

## How agents use them

Before every run, the notes that match the message are added to the agent's instructions under
"What you remember". Agents can also search on purpose (`recall`) and delete notes that are wrong
(`forget`). An agent only sees its own notes and the notes of the project it is working in.

Notes are treated as possibly outdated, and what you say now always wins.

## The Memory screen

The brain icon in the left rail shows every note, grouped by agent and project, with who saved it
and when. Search works in any language. Delete anything that is wrong; agents will not see it again.

## Semantic search (optional)

Keyword search always works. With an embedding model, agents also find notes by meaning and across
languages (a question in English finds a note in Ukrainian). It is free and local with Ollama:

1. `ollama pull nomic-embed-text`
2. On the Memory screen, set **Semantic search** to **Ollama**, model `nomic-embed-text`, and save.
   Existing notes are indexed right away.

Any OpenAI-compatible server with an `/embeddings` endpoint works too. Changing the model re-indexes
the notes.

## Limits

A note is at most 1000 characters. An agent saves at most 10 notes per run, and each agent or project
keeps at most 500 notes. Notes live in the local database (`~/.aura/state`). Agents are told never to
save secrets.
