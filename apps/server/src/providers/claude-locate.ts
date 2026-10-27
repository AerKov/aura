import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** True inside a `bun build --compile` executable, where node_modules are not on disk. */
export function isCompiled(): boolean {
  return import.meta.path.startsWith("/$bunfs") || import.meta.path.includes("~BUN");
}

/**
 * Finds the user's own Claude Code installation (ADR 0004). Order: `CREW_CLAUDE_EXECUTABLE`,
 * `PATH`, then the usual install locations (GUI apps often start with a minimal PATH).
 */
export function locateClaude(env: Record<string, string | undefined> = process.env): string | null {
  if (env.CREW_CLAUDE_EXECUTABLE) return env.CREW_CLAUDE_EXECUTABLE;
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const fromPath = Bun.which("claude");
  if (fromPath) return fromPath;
  const home = homedir();
  const candidates = [
    join(home, ".local", "bin", exe),
    join(home, ".claude", "local", exe),
    join(home, ".npm-global", "bin", exe),
    join(home, ".bun", "bin", exe),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    join(env.APPDATA ?? "", "npm", "claude.cmd"),
  ];
  return candidates.find((path) => path && existsSync(path)) ?? null;
}
