# 0013: Agent memory

- Status: accepted
- Date: 2026-10-27
- Phase: 10

## Context

Agents start every run from their profile, skills and the last chat messages. Decisions, user
preferences and hard-won facts were lost once they scrolled out of the context window. The spec
plans a `memory` table with vector search (SPEC section 5).

## Decision

- **Notes, not transcripts.** A memory is a short note (at most 1000 characters), saved by an agent
  with the `remember` tool. Each note has a scope:
  - `agent`: owned by one agent and goes with it to every chat.
  - `project`: shared by the agents of one project. This is the default in project chats.
- **State in the database** (rule 3). The `memory` table holds scope, owner, text, author, chat,
  and an optional embedding plus the model that produced it.
- **Tools for every agent.**
  - `remember`: at most 10 notes per run, at most 500 per owner. Exact or near duplicates (same
    search keys) are not saved twice.
  - `recall`: searches the agent's own notes and the current project's notes.
  - `forget`: deletes only those.
  - An agent never sees another agent's own notes.
- **Automatic context.** Before each run, up to 6 notes that match the trigger message are added to
  the system prompt under "What you remember". They are labelled as possibly outdated notes, not
  commands, and the user's current words win. Notes can come from external content, so this
  matters (rule 7).
- **Hybrid search.**
  - Keyword search always works and needs no model. It uses SurrealDB full-text search (BM25) on
    the text with English stemming, plus a second index on "search keys": every word cut to its
    first 5 letters. This crude prefix stemmer lets inflected forms meet in languages the analyzer
    cannot stem (Ukrainian "коротко" finds "короткі").
  - Semantic search is optional. It uses an embedding model from an OpenAI-compatible
    `/embeddings` endpoint, for example Ollama's `nomic-embed-text` (free, local) or an
    OpenAI-compatible server. It is configured in `engines.json` (`memory.engine`,
    `memory.model`). Cosine similarity is computed in SurrealDB. Vectors are compared only within
    one model.
  - The two rankings are merged with reciprocal rank fusion. A vector match needs a similarity of
    at least 0.5 to count on its own.
  - Claude has no embeddings API, so Claude-only users get keyword search.
- **The user stays in control.** The Memory screen lists, searches and deletes notes, turns on
  semantic search, and indexes existing notes for a new model (`POST /memory/reindex`). If the
  embedding server fails, notes are saved without vectors and search falls back to keywords.

## Not now

- No HNSW index: its dimension is fixed per index while models differ, and brute-force cosine is
  fine for hundreds of notes per owner.
- No automatic summarization of chats into memory. Agents decide what is worth remembering.
- No expiry. Notes stay until an agent or the user deletes them.
