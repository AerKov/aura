/**
 * Files in chats and apps (ADR 0036): what a stored file looks like to everyone, and the limits.
 * The bytes live outside git, in `files/` of the user data folder.
 */

export interface FileRef {
  /** Unique within its chat or app. */
  id: string;
  /** The name the user sees, without any path. */
  name: string;
  size: number;
  /** A media type guessed from the name; the file is never run or trusted for it. */
  type: string;
  at: string;
}

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_SCOPE_BYTES = 500 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const MAX_FILE_NAME = 120;

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  xml: "application/xml",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** A media type from the file's extension; unknown ones are plain bytes. */
export function mimeOf(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return TYPES[ext] ?? "application/octet-stream";
}

/** What the viewer can show: a PDF, an image, text; everything else is only downloaded. */
export type PreviewKind = "pdf" | "image" | "text" | "none";

export function previewKind(type: string): PreviewKind {
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/") || type === "application/json") return "text";
  return "none";
}

/** Where an agent finds a chat file in its working folder (the runtime puts it there). */
export function stagedPath(file: Pick<FileRef, "id" | "name">): string {
  return `attachments/${file.id}__${file.name}`;
}

/** 1536 → "1.5 KB". */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${n} B`;
}

const BAD_NAME_CHARS = new Set(['"', "<", ">", ":", "|", "?", "*"]);

/** A file name without any path, control characters or leading dots, at most MAX_FILE_NAME long. */
export function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = [...base]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f && !BAD_NAME_CHARS.has(ch);
    })
    .join("");
  let name = clean.trim().replace(/^\.+/, "");
  if (name.length > MAX_FILE_NAME) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : "";
    name = name.slice(0, MAX_FILE_NAME - ext.length) + ext;
  }
  return name || "file";
}
