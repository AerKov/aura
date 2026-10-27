import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { hostAllowed, webDenied } from "./hosts";

/** Input fields that carry file paths in Claude Code's built-in tools. */
const PATH_FIELDS = ["file_path", "path", "notebook_path"] as const;

export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(root, target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Resolves symlinks of the nearest existing ancestor (`/tmp` is `/private/tmp` on macOS). */
function real(path: string): string {
  let existing = resolve(path);
  const rest: string[] = [];
  while (true) {
    try {
      return resolve(realpathSync(existing), ...rest.reverse());
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return resolve(path);
      rest.push(basename(existing));
      existing = parent;
    }
  }
}

/** Like `isInside`, after resolving symlinks on both sides. */
export function isInsideReal(root: string, target: string): boolean {
  return isInside(root, target) || isInside(real(root), real(resolve(root, target)));
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
  /** When set, WebFetch may reach only these hosts (ADR 0022). */
  webHosts?: string[];
}): Decision {
  const { tool, args, granted, appTools, cwd, blockedPath } = input;
  if (appTools.includes(tool)) return { allow: true };
  if (input.allowedPrefixes?.some((prefix) => tool.startsWith(prefix))) return { allow: true };
  if (!granted.includes(tool))
    return { allow: false, reason: `${tool} is not granted to this agent` };
  if (tool === "WebFetch" && input.webHosts) {
    let host = "";
    try {
      host = new URL(String(args.url ?? "")).hostname;
    } catch {
      return { allow: false, reason: "WebFetch needs a valid URL" };
    }
    if (!hostAllowed(host, input.webHosts))
      return { allow: false, reason: webDenied(host, input.webHosts) };
  }
  if (!cwd) return { allow: true };
  // Claude Code names the path that made it ask (with the sandbox on, also paths inside cwd).
  if (blockedPath && !isInsideReal(cwd, blockedPath))
    return { allow: false, reason: `${blockedPath} is outside the project workspace` };
  for (const field of PATH_FIELDS) {
    const value = args[field];
    if (typeof value === "string" && !isInside(cwd, value)) {
      return { allow: false, reason: `${value} is outside the project workspace` };
    }
  }
  return { allow: true };
}
