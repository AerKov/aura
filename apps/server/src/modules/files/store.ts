import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  type FileRef,
  MAX_FILE_BYTES,
  MAX_SCOPE_BYTES,
  mimeOf,
  safeFileName,
  stagedPath,
} from "@aura/shared";

export class FileError extends Error {
  override name = "FileError";
  constructor(
    readonly code: "invalid" | "too-large" | "full" | "not-found",
    message: string,
  ) {
    super(message);
  }
}

/** Whose files they are: one chat's attachments, or one app's own files. */
export type FileScope = { kind: "chat" | "app"; id: string };

const SCOPE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_ID = /^[a-f0-9]{12}$/;

/**
 * Files the user brings into chats and apps, and files agents and apps make (ADR 0036). They live in
 * `<dataDir>/files/{chats,apps}/<id>/`, outside git: a PDF is not a diff. A file is stored as
 * `<id>__<name>`; nothing is ever executed or served as a page from here.
 */
export class FileStore {
  constructor(private readonly dataDir: string) {}

  private dirOf(scope: FileScope): string {
    if (!SCOPE_ID.test(scope.id)) throw new FileError("invalid", "Not a valid chat or app id");
    return join(this.dataDir, "files", scope.kind === "chat" ? "chats" : "apps", scope.id);
  }

  list(scope: FileScope): FileRef[] {
    const dir = this.dirOf(scope);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((entry) => this.refOf(dir, entry))
      .filter((ref): ref is FileRef => ref !== null)
      .sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name));
  }

  private refOf(dir: string, entry: string): FileRef | null {
    const split = entry.indexOf("__");
    if (split !== 12 || !FILE_ID.test(entry.slice(0, 12))) return null;
    const stat = statSync(join(dir, entry));
    if (!stat.isFile()) return null;
    const name = entry.slice(14);
    return {
      id: entry.slice(0, 12),
      name,
      size: stat.size,
      type: mimeOf(name),
      at: stat.mtime.toISOString(),
    };
  }

  /** The file's record and where its bytes are, or null. */
  find(scope: FileScope, id: string): { ref: FileRef; path: string } | null {
    if (!FILE_ID.test(id)) return null;
    const dir = this.dirOf(scope);
    if (!existsSync(dir)) return null;
    const entry = readdirSync(dir).find((e) => e.startsWith(`${id}__`));
    if (!entry) return null;
    const ref = this.refOf(dir, entry);
    return ref ? { ref, path: join(dir, entry) } : null;
  }

  /** Stores bytes under a safe name. Limits: MAX_FILE_BYTES each, MAX_SCOPE_BYTES per chat or app. */
  put(scope: FileScope, rawName: string, bytes: Uint8Array): FileRef {
    if (bytes.byteLength === 0) throw new FileError("invalid", "The file is empty");
    if (bytes.byteLength > MAX_FILE_BYTES)
      throw new FileError("too-large", `A file can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    const dir = this.dirOf(scope);
    const used = this.list(scope).reduce((sum, f) => sum + f.size, 0);
    if (used + bytes.byteLength > MAX_SCOPE_BYTES)
      throw new FileError("full", "There is no room for more files here: delete some first");
    mkdirSync(dir, { recursive: true });
    const id = Bun.randomUUIDv7().replace(/-/g, "").slice(-12);
    const name = safeFileName(rawName);
    writeFileSync(join(dir, `${id}__${name}`), bytes);
    const found = this.find(scope, id);
    if (!found) throw new FileError("invalid", "The file was not saved");
    return found.ref;
  }

  remove(scope: FileScope, id: string): boolean {
    const found = this.find(scope, id);
    if (!found) return false;
    rmSync(found.path, { force: true });
    return true;
  }

  /** A copy of one file in another folder (an agent's working folder), under its own name. */
  copyTo(scope: FileScope, id: string, destDir: string): string {
    const found = this.find(scope, id);
    if (!found) throw new FileError("not-found", "No such file");
    mkdirSync(destDir, { recursive: true });
    let target = join(destDir, found.ref.name);
    for (let n = 2; existsSync(target); n++) {
      const dot = found.ref.name.lastIndexOf(".");
      const stem = dot > 0 ? found.ref.name.slice(0, dot) : found.ref.name;
      target = join(destDir, `${stem} (${n})${dot > 0 ? found.ref.name.slice(dot) : ""}`);
    }
    copyFileSync(found.path, target);
    return target;
  }

  /** Puts a copy of a file in `<root>/attachments/` for an agent, once; returns its relative path. */
  stage(scope: FileScope, id: string, root: string): string | null {
    const found = this.find(scope, id);
    if (!found) return null;
    const rel = stagedPath(found.ref);
    const target = join(root, rel);
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(found.path, target);
    }
    return rel;
  }

  /** Where a scope's files are, for backups; the folder may not exist. */
  folderOf(scope: FileScope): string {
    return this.dirOf(scope);
  }

  removeScope(scope: FileScope): void {
    rmSync(this.dirOf(scope), { recursive: true, force: true });
  }
}
