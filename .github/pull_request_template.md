## What and why

<!-- One topic per pull request. Link the issue or ADR if there is one. -->

## How it was checked

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun test`
- [ ] Screenshots for UI changes

## Architecture rules

- [ ] No new way for agents to act without approval, leave their workspace, or follow instructions
  from external content
- [ ] No agent app credentials read, stored or forwarded
- [ ] New dependencies are pinned and explained
