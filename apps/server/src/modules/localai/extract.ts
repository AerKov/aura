import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export class ExtractError extends Error {
  override name = "ExtractError";
}

/** Unpacks a .tar.gz or .zip with the system's `tar` (Windows 10+, macOS and Linux all have one). */
export async function extractArchive(archive: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true });
  const proc = Bun.spawn(["tar", "-xf", archive, "-C", dest], { stderr: "pipe", stdout: "ignore" });
  const code = await proc.exited;
  if (code !== 0)
    throw new ExtractError(
      `Could not unpack the download: ${(await new Response(proc.stderr).text()).trim()}`,
    );
}

/** The `llama-server` program inside an unpacked release (it may sit in a folder). */
export function findServer(root: string, windows = process.platform === "win32"): string | null {
  const name = windows ? "llama-server.exe" : "llama-server";
  const walk = (dir: string, depth: number): string | null => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isFile() && entry === name) return path;
    }
    if (depth === 0) return null;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        const found = walk(path, depth - 1);
        if (found) return found;
      }
    }
    return null;
  };
  if (!existsSync(root)) return null;
  const found = walk(root, 3);
  if (found && !windows) chmodSync(found, 0o755);
  return found;
}
