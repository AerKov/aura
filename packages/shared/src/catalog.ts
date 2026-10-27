/**
 * Packs (ADR 0016): ready-made agents, skills, themes, snippets and extensions that install into the
 * user data directory in one approved step, from the built-in catalog or from a URL.
 */

/** Folders a pack may write to: user customization only, never `mcp/` or the app (rule 9). */
export const PACK_FILE_PATTERNS: readonly RegExp[] = [
  /^agents\/[a-z][a-z0-9_-]{1,31}\/agent\.md$/,
  /^skills\/[a-z][a-z0-9-]{1,47}\/SKILL\.md$/,
  /^themes\/[a-z][a-z0-9-]{1,47}\/theme\.css$/,
  /^snippets\/[a-z][a-z0-9-]{1,47}\.css$/,
  /^extensions\/[a-z][a-z0-9-]{1,47}\/(manifest\.json|main\.js|styles\.css)$/,
];

export function isPackFilePath(path: string): boolean {
  return PACK_FILE_PATTERNS.some((re) => re.test(path));
}

export interface PackManifest {
  /** Lowercase id, e.g. `dev-team`. */
  id: string;
  name: string;
  /** x.y.z */
  version: string;
  description: string;
  author: string;
  tags: string[];
  /** Every file the pack installs, relative to the user data directory. */
  files: string[];
}

export interface PackContents {
  agents: string[];
  skills: string[];
  themes: string[];
  snippets: string[];
  extensions: string[];
}

export interface PackSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  source: "builtin" | "url";
  /** Where a URL pack came from. */
  url: string | null;
  contents: PackContents;
  /** The installed version, if any. */
  installed: { version: string; sha256: string } | null;
}

export interface PackPreview extends PackSummary {
  /** Hash of the exact content shown; installing requires the same hash. */
  sha256: string;
  /** Markdown: what will be created or replaced, with diffs. */
  preview: string;
  /** Things to look at before installing (shell access, overwrites, extension permissions). */
  warnings: string[];
}
