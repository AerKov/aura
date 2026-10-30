import { createHash } from "node:crypto";
import { isPackFilePath, type PackContents, type PackManifest } from "@aura/shared";
import { parseAgentFile } from "../../helpers/agents/profiles";
import { parseSkill } from "../../helpers/skills/service";
import { validateManifest } from "../customize/extensions";

export class PackError extends Error {
  override name = "PackError";
}

export interface Pack {
  manifest: PackManifest;
  /** Path (relative to the user data directory) to content. */
  files: Record<string, string>;
}

const ID = /^[a-z][a-z0-9-]{1,47}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
export const MAX_FILE = 200_000;
export const MAX_TOTAL = 1_000_000;
export const MAX_FILES = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates an untrusted `pack.json`. */
export function validatePackManifest(raw: unknown): PackManifest {
  if (!isRecord(raw)) throw new PackError("pack.json must be an object");
  const { id, name, version, description, author, tags, files } = raw;
  if (typeof id !== "string" || !ID.test(id))
    throw new PackError("id must be 2-48 chars: lowercase letters, digits, dashes");
  if (typeof name !== "string" || !name.trim() || name.length > 60)
    throw new PackError("name is required (max 60 chars)");
  if (typeof version !== "string" || !SEMVER.test(version))
    throw new PackError("version must be x.y.z");
  if (typeof description !== "string" || !description.trim() || description.length > 500)
    throw new PackError("description is required (max 500 chars)");
  if (typeof author !== "string" || !author.trim() || author.length > 80)
    throw new PackError("author is required (max 80 chars)");
  const tagList = tags ?? [];
  if (
    !Array.isArray(tagList) ||
    tagList.length > 10 ||
    !tagList.every((t) => typeof t === "string" && /^[a-z0-9-]{1,24}$/.test(t))
  ) {
    throw new PackError("tags must be up to 10 short lowercase words");
  }
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES)
    throw new PackError(`files must list 1-${MAX_FILES} paths`);
  for (const path of files) {
    if (typeof path !== "string" || !isPackFilePath(path)) {
      throw new PackError(
        `"${String(path)}" is not allowed: packs install agents/, skills/, themes/, snippets/, extensions/ and apps/ files only`,
      );
    }
  }
  if (new Set(files).size !== files.length) throw new PackError("files must not repeat");
  return {
    id,
    name: name.trim(),
    version,
    description: description.trim(),
    author: author.trim(),
    tags: tagList as string[],
    files: files as string[],
  };
}

/**
 * Checks every file the way the app would read it, so a pack cannot install something broken or
 * something the rest of the app would reject (profiles, skills, extension manifests).
 */
export function validatePack(manifest: unknown, files: Record<string, string>): Pack {
  const m = validatePackManifest(manifest);
  let total = 0;
  for (const path of m.files) {
    const content = files[path];
    if (typeof content !== "string") throw new PackError(`${path} is listed but missing`);
    if (content.length > MAX_FILE) throw new PackError(`${path} is too large (max 200 KB)`);
    total += content.length;
    if (total > MAX_TOTAL) throw new PackError("the pack is too large (max 1 MB)");
    const parts = path.split("/");
    try {
      if (parts[0] === "agents") parseAgentFile(parts[1] ?? "", content);
      if (parts[0] === "skills") parseSkill(parts[1] ?? "", content);
      if ((parts[0] === "extensions" || parts[0] === "apps") && parts[2] === "manifest.json") {
        validateManifest(JSON.parse(content), parts[1]);
      }
    } catch (error) {
      throw new PackError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const contents = contentsOf(m.files);
  for (const [folder, ids] of [
    ["extensions", contents.extensions],
    ["apps", contents.apps],
  ] as const) {
    for (const id of ids)
      for (const required of ["manifest.json", "main.js"])
        if (!m.files.includes(`${folder}/${id}/${required}`))
          throw new PackError(`${folder === "apps" ? "app" : "extension"} ${id} needs ${required}`);
  }
  const extra = Object.keys(files).filter((p) => !m.files.includes(p));
  if (extra.length > 0) throw new PackError(`files not listed in pack.json: ${extra.join(", ")}`);
  return { manifest: m, files: Object.fromEntries(m.files.map((p) => [p, files[p] ?? ""])) };
}

export function contentsOf(paths: readonly string[]): PackContents {
  const names = (folder: string) => [
    ...new Set(
      paths
        .filter((p) => p.startsWith(`${folder}/`))
        .map(
          (p) =>
            p
              .slice(folder.length + 1)
              .split("/")[0]
              ?.replace(/\.css$/, "") ?? "",
        ),
    ),
  ];
  return {
    agents: names("agents"),
    skills: names("skills"),
    themes: names("themes"),
    snippets: names("snippets"),
    extensions: names("extensions"),
    apps: names("apps"),
  };
}

/** A stable hash of exactly what would be installed. */
export function packHash(pack: Pack): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(pack.manifest));
  for (const path of [...pack.manifest.files].sort()) {
    hash.update(`\0${path}\0`);
    hash.update(pack.files[path] ?? "");
  }
  return hash.digest("hex");
}
