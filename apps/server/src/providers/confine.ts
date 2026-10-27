import { isAbsolute, relative, resolve } from "node:path";

/** Input fields that carry file paths in Claude Code's built-in tools. */
const PATH_FIELDS = ["file_path", "path", "notebook_path"] as const;

export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(root, target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export type Decision = { allow: true } | { allow: false; reason: string };

/**
 * Sandbox level 0 (docs/SPEC.md section 7): an agent may use only the tools it was granted, and
 * file tools only inside its workspace. Bash is allowed when granted, but Claude Code still blocks
 * paths outside the working directory (`blockedPath`).
 */
export function decideToolUse(input: {
  tool: string;
  args: Record<string, unknown>;
  granted: string[];
  appTools: string[];
  /** Tool name prefixes allowed as a whole, e.g. `mcp__github__` for a granted MCP server. */
  allowedPrefixes?: string[];
  cwd: string | undefined;
  blockedPath?: string;
}): Decision {
  const { tool, args, granted, appTools, cwd, blockedPath } = input;
  if (appTools.includes(tool)) return { allow: true };
  if (input.allowedPrefixes?.some((prefix) => tool.startsWith(prefix))) return { allow: true };
  if (!granted.includes(tool))
    return { allow: false, reason: `${tool} is not granted to this agent` };
  if (!cwd) return { allow: true };
  if (blockedPath)
    return { allow: false, reason: `${blockedPath} is outside the project workspace` };
  for (const field of PATH_FIELDS) {
    const value = args[field];
    if (typeof value === "string" && !isInside(cwd, value)) {
      return { allow: false, reason: `${value} is outside the project workspace` };
    }
  }
  return { allow: true };
}
