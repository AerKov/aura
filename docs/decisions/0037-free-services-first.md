# 0037: Free AI services first, agent apps for advanced users

- Status: accepted
- Date: 2026-10-29
- Phase: 37 (follow-up)

## Context

The first thing a newcomer met was a choice between agent apps (Claude Code, Codex, Gemini CLI,
OpenCode): install a program, log in with a paid plan or a Google account, understand what an
engine is. The lowest barrier is not an agent app. Several services give free access to models
through an OpenAI-compatible API with a key made in a minute, and Aura already has its own agent
loop for such APIs (ADR 0011).

## Decision

- **Free services lead.** Google Gemini (AI Studio), Groq, OpenRouter, Cerebras and Mistral are
  engines of Aura's own agent loop, kept in one catalog in `packages/shared` (`FREE_SERVICES`:
  address, where to make a key, what the free plan means for privacy and limits, models to try
  first). Adding a service is a catalog entry. The catalog names no rate numbers: they change, and
  each service's page is the truth; the card says that limits apply and, where it is known, that the
  free plan may use prompts for training.
- **One step to start.** Saving a key lists the service's models, picks the best one on offer when
  none is chosen, and, if the current default engine does not work, makes this one the default.
  A key the service rejects changes nothing. A first-run panel in the Helper's chat ("Connect an AI
  to start") does this without leaving the chat; the Helper programs page leads with "Start free".
- **Local models second** (Ollama, LM Studio and other servers), **agent apps last** under
  "Advanced: your own agent app" (Claude Code, Codex, Gemini CLI, OpenCode), collapsed unless one is
  in use. Their behaviour is unchanged, and nothing existing is migrated: an existing
  `engines.json` keeps its default.
- Keys are stored like OpenRouter's (ADR 0011): `state/secrets.json`, 0600, outside git, sent only to
  their own service, never returned.

## Consequences

- New engine ids: `google`, `groq`, `cerebras`, `mistral`; the order of `ENGINE_IDS` is the order on
  the page.
- Free plans are throttled: a long agent run may stop at "rate limit reached"; the answer is to wait
  or to switch the helper to another service.
- The key link opens in the browser; in the desktop shell it may not, so the page also offers to
  copy it.
- Not verified here: calls to the real services (the build environment cannot reach them); the
  catalog's model names and addresses come from the services' public documentation as known when
  this was written and from the listing endpoint at run time.
