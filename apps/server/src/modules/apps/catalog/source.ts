import { errorMessage } from "../../../lib/log";
import { isPrivateHost } from "../../../providers/native-tools";
import {
  MAX_FILE,
  MAX_TOTAL,
  type Pack,
  PackError,
  validatePack,
  validatePackManifest,
} from "./pack";

/**
 * Where `pack.json` lives for a URL the user gives:
 * - `https://github.com/<owner>/<repo>` (optionally `/tree/<ref>/<path>`) → raw.githubusercontent.com
 * - any other `https://…/pack.json` → that URL.
 * Files are fetched next to `pack.json`.
 */
export function packJsonUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new PackError("Not a URL");
  }
  if (url.protocol !== "https:") throw new PackError("Only https URLs are supported");
  if (url.username || url.password) throw new PackError("URLs with credentials are not supported");
  if (isPrivateHost(url.hostname))
    throw new PackError("Local and private addresses are not allowed");
  if (url.hostname === "github.com") {
    const [owner, repo, kind, ref, ...rest] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) throw new PackError("A GitHub URL needs an owner and a repository");
    if (kind && kind !== "tree" && kind !== "blob")
      throw new PackError("Use a repository, folder (tree) or pack.json (blob) URL");
    const path = rest.filter((p) => p !== "pack.json").join("/");
    return new URL(
      `https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, "")}/${ref ?? "HEAD"}/${path ? `${path}/` : ""}pack.json`,
    );
  }
  if (!url.pathname.endsWith("/pack.json"))
    throw new PackError("The URL must point to a pack.json");
  return url;
}

async function getText(url: URL, fetchFn: typeof fetch, max: number): Promise<string> {
  let res: Response;
  try {
    res = await fetchFn(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new PackError(`Could not fetch ${url.href}: ${errorMessage(error)}`);
  }
  if (isPrivateHost(new URL(res.url || url.href).hostname))
    throw new PackError("The pack redirected to a private address");
  if (!res.ok) throw new PackError(`${url.href} answered HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > max) throw new PackError(`${url.pathname} is too large`);
  return text;
}

/** Downloads and validates a pack. Its content is data: nothing in it runs during download. */
export async function fetchPack(input: string, fetchFn: typeof fetch = fetch): Promise<Pack> {
  const manifestUrl = packJsonUrl(input);
  let raw: unknown;
  try {
    raw = JSON.parse(await getText(manifestUrl, fetchFn, 50_000));
  } catch (error) {
    if (error instanceof PackError) throw error;
    throw new PackError("pack.json is not valid JSON");
  }
  const manifest = validatePackManifest(raw);
  const files: Record<string, string> = {};
  let total = 0;
  for (const path of manifest.files) {
    const text = await getText(new URL(path, manifestUrl), fetchFn, MAX_FILE);
    total += text.length;
    if (total > MAX_TOTAL) throw new PackError("the pack is too large (max 1 MB)");
    files[path] = text;
  }
  return validatePack(manifest, files);
}
