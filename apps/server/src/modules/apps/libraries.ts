import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class LibraryError extends Error {
  override name = "LibraryError";
}

/** An npm package name, optionally scoped. */
const PACKAGE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/** A file inside the package: no `..`, ends in .js, .mjs or .css. */
const FILE = /^(?!.*\.\.)[A-Za-z0-9._@/-]+\.(js|mjs|css)$/;
/** A library's path in an app's folder, as listed in its manifest. */
export const LIBRARY_PATH = /^lib\/(?!.*\.\.)[A-Za-z0-9._@/-]+\.(js|mjs|css)$/;
export const MAX_LIBRARY = 2_000_000;
export const MAX_LIBRARIES_TOTAL = 6_000_000;
const CDN = "https://cdn.jsdelivr.net/npm";

/**
 * Puts a library file from npm into an app's folder (ADR 0033): apps are not limited to a fixed
 * set of components. Aura fetches the exact version once; the file is then part of the app's
 * code, shown on the change card and kept in its versions. It runs only inside the app's frame.
 */
export async function addLibrary(
  appDir: string,
  input: { package: string; version: string; file: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ path: string; bytes: number; sha256: string }> {
  const pkg = input.package.trim();
  const version = input.version.trim();
  const file = input.file.trim().replace(/^\/+/, "");
  if (!PACKAGE.test(pkg)) throw new LibraryError(`"${pkg}" is not an npm package name`);
  if (!VERSION.test(version))
    throw new LibraryError("give an exact version, like 4.4.1 (no ranges, no latest)");
  if (!FILE.test(file))
    throw new LibraryError(
      "file must be a .js (a UMD or IIFE build), .mjs (a self-contained ES module) or .css path inside the package, e.g. dist/chart.umd.js",
    );
  const url = `${CDN}/${pkg}@${version}/${file}`;
  const res = await fetchFn(url, { redirect: "follow" });
  if (!res.ok) throw new LibraryError(`${url} answered HTTP ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());
  if (body.byteLength > MAX_LIBRARY)
    throw new LibraryError(`the file is over ${MAX_LIBRARY / 1_000_000} MB; pick a smaller build`);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  if (text.includes("\u0000")) throw new LibraryError("the file is not text");
  const name = pkg.replace(/^@/, "").replace("/", "-");
  const path = `lib/${name}@${version}/${file.split("/").pop()}`;
  const target = join(appDir, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  const sha256 = new Bun.CryptoHasher("sha256").update(text).digest("hex");
  return { path, bytes: body.byteLength, sha256 };
}
