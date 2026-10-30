import { errorMessage } from "../../lib/log";

/** The llama.cpp release API and the one place its downloads may come from (ADR 0038). */
const RELEASE_API = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
const DOWNLOAD_PREFIX = "https://github.com/ggml-org/llama.cpp/releases/download/";

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
  /** The checksum GitHub states for the file, lowercase hex; null when it states none. */
  sha256: string | null;
}

export interface Release {
  tag: string;
  assets: ReleaseAsset[];
}

export type Variant = "metal" | "vulkan" | "cpu";

export class ReleaseError extends Error {
  override name = "ReleaseError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the release JSON; assets with an address outside ggml-org/llama.cpp are dropped. */
export function parseRelease(raw: unknown): Release {
  if (!isRecord(raw) || typeof raw.tag_name !== "string" || !Array.isArray(raw.assets))
    throw new ReleaseError("GitHub's answer is not a llama.cpp release");
  const assets: ReleaseAsset[] = [];
  for (const a of raw.assets) {
    if (!isRecord(a) || typeof a.name !== "string") continue;
    const url = typeof a.browser_download_url === "string" ? a.browser_download_url : "";
    if (!url.startsWith(DOWNLOAD_PREFIX)) continue;
    const digest = typeof a.digest === "string" ? /^sha256:([a-f0-9]{64})$/i.exec(a.digest) : null;
    assets.push({
      name: a.name,
      size: typeof a.size === "number" ? a.size : 0,
      url,
      sha256: digest ? (digest[1] as string).toLowerCase() : null,
    });
  }
  return { tag: raw.tag_name, assets };
}

export async function fetchLatestRelease(fetchFn: typeof fetch = fetch): Promise<Release> {
  try {
    const res = await fetchFn(RELEASE_API, {
      headers: { accept: "application/vnd.github+json", "user-agent": "aura" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new ReleaseError(`GitHub answered HTTP ${res.status}`);
    return parseRelease(await res.json());
  } catch (error) {
    if (error instanceof ReleaseError) throw error;
    throw new ReleaseError(`Could not reach GitHub to find llama.cpp (${errorMessage(error)})`);
  }
}

/** Builds in the order to try for a system: a GPU build that runs anywhere, then the CPU one. */
export function variantsFor(platform: string, arch: string): Variant[] {
  if (platform === "darwin") return ["metal"];
  return arch === "x64" ? ["vulkan", "cpu"] : ["cpu"];
}

const OS_TOKEN: Record<string, string> = { darwin: "macos", linux: "ubuntu", win32: "win" };
const OTHER_BACKENDS = /(vulkan|cuda|rocm|hip|sycl|opencl|openvino|kompute|cudart)/i;

/** The archive of a build for this system, or null when the release has none. */
export function pickAsset(
  assets: ReleaseAsset[],
  platform: string,
  arch: string,
  variant: Variant,
): ReleaseAsset | null {
  const os = OS_TOKEN[platform];
  if (!os) return null;
  const cpuArch = arch === "arm64" ? "arm64" : "x64";
  const found = assets.filter((a) => {
    if (!/^llama-.*-bin-.*\.(tar\.gz|zip)$/.test(a.name)) return false;
    if (!a.name.includes(`-bin-${os}-`)) return false;
    if (!new RegExp(`-${cpuArch}\\.(tar\\.gz|zip)$`).test(a.name)) return false;
    return variant === "vulkan" ? /vulkan/i.test(a.name) : !OTHER_BACKENDS.test(a.name);
  });
  return found.sort((a, b) => a.name.length - b.name.length)[0] ?? null;
}
