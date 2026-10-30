import { createWriteStream, renameSync, rmSync, statSync } from "node:fs";
import { errorMessage } from "../../../lib/log";

export class DownloadError extends Error {
  override name = "DownloadError";
}

/**
 * Downloads a file to `dest` through a `.part` file: counts the bytes for a progress bar, checks the
 * checksum and the size when they are known, and only then puts the file in place (ADR 0038).
 */
export async function downloadFile(opts: {
  url: string;
  dest: string;
  sha256: string | null;
  size?: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const part = `${opts.dest}.part`;
  const fetchFn = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(opts.url, { redirect: "follow", signal: opts.signal });
  } catch (error) {
    throw new DownloadError(`Download failed (${errorMessage(error)})`);
  }
  if (!res.ok || !res.body) throw new DownloadError(`The server answered HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || opts.size || 0;
  const hasher = new Bun.CryptoHasher("sha256");
  const out = createWriteStream(part);
  let done = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      hasher.update(value);
      if (!out.write(value)) await new Promise((r) => out.once("drain", r));
      done += value.byteLength;
      opts.onProgress?.(done, total);
    }
    await new Promise<void>((resolve, reject) =>
      out.end((e?: Error | null) => (e ? reject(e) : resolve())),
    );
  } catch (error) {
    out.destroy();
    rmSync(part, { force: true });
    throw new DownloadError(`Download failed (${errorMessage(error)})`);
  }
  const actual = hasher.digest("hex");
  if (opts.sha256 && actual !== opts.sha256.toLowerCase()) {
    rmSync(part, { force: true });
    throw new DownloadError(
      "The downloaded file does not match its checksum, so it was thrown away",
    );
  }
  if (total > 0 && statSync(part).size !== total) {
    rmSync(part, { force: true });
    throw new DownloadError("The download ended early");
  }
  renameSync(part, opts.dest);
}
