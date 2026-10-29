import { z } from "zod";

/**
 * "What will change" on an approval card, in plain words (ADR 0034). The agent writes it in the
 * user's language; the technical preview (a diff, a plan) stays behind "Technical details".
 */
export const PLAIN_CHANGES = {
  changes: z
    .array(z.string())
    .max(8)
    .optional()
    .describe(
      "what will change, in plain words in the user's language, one short line each (e.g. 'A new Email column in the clients table')",
    ),
};

export function plainChanges(input: Record<string, unknown>): string[] {
  const raw = input.changes;
  return Array.isArray(raw)
    ? raw
        .map((c) => String(c).trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

/** The bullet lines of an agent's reply ("- …", "* …", "• …"), as plain changes. */
export function bulletsOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/)?.[1]?.trim() ?? "")
    .filter((line) => line && !line.startsWith("`"))
    .map((line) => line.replace(/\*\*/g, ""))
    .slice(0, 8);
}

/** Warnings shown in plain words; the client translates them. */
export const MORE_PERMISSIONS = "It asks for more permissions.";
export const INVALID_MANIFEST =
  "The app's settings file has an error, so this change cannot go live.";
