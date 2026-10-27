import type { AgentInfo } from "./store";

/** The `@name` (anywhere) or `/name` (at the start) being typed right before the caret. */
export function activeToken(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const mention = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(before);
  if (mention)
    return { start: before.length - (mention[2]?.length ?? 0) - 1, query: mention[2] ?? "" };
  const command = /^\s*\/([\p{L}\p{N}_-]*)$/u.exec(before);
  if (command) return { start: before.indexOf("/"), query: command[1] ?? "" };
  return null;
}

/** Agents matching what was typed: handle or name prefix first, then anywhere in the name or role. */
export function matchAgents(agents: AgentInfo[], query: string): AgentInfo[] {
  const q = query.toLowerCase();
  const score = (a: AgentInfo) => {
    if (!q) return 1;
    if (a.handle.startsWith(q) || a.name.toLowerCase().startsWith(q)) return 3;
    if (a.handle.includes(q) || a.name.toLowerCase().includes(q)) return 2;
    return a.role.toLowerCase().includes(q) ? 1 : 0;
  };
  return agents
    .map((a) => ({ a, s: score(a) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.a.handle.localeCompare(y.a.handle))
    .map((x) => x.a);
}
