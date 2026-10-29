import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Bytes a file or a folder takes, with everything inside it. */
export function sizeOf(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0);
}

/** A sortable time for folder names: `20261029T013000`. */
export function timeStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").slice(0, 15);
}
