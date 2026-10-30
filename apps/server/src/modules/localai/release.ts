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

/** Words in release file names, as llama.cpp has spelled them over time. */
const OS_WORDS: Record<string, string[]> = {
  darwin: ["macos", "mac", "osx", "darwin", "apple"],
  linux: ["ubuntu", "linux"],
  win32: ["win", "windows"],
};
const ARCH_WORDS: Record<string, string[]> = {
  x64: ["x64", "x86_64", "amd64", "x86-64"],
  arm64: ["arm64", "aarch64"],
};
const GPU_WORDS = [
  "vulkan",
  "cuda",
  "rocm",
  "hip",
  "sycl",
  "opencl",
  "openvino",
  "kompute",
  "musa",
];

/** What a release file is for, read from its name; null when it is not a program archive. */
export interface Build extends ReleaseAsset {
  os: string | null;
  arch: string | null;
  /** "cpu", "metal", or the GPU backend in its name. */
  variant: string;
}

export function describeAsset(asset: ReleaseAsset): Build | null {
  const name = asset.name.toLowerCase();
  if (!/\.(tar\.gz|tgz|zip)$/.test(name) || !name.startsWith("llama")) return null;
  if (/(cudart|xcframework|source|src\b)/.test(name)) return null;
  const words = name.replace(/\.(tar\.gz|tgz|zip)$/, "").split(/[-_.]+/);
  const joined = `-${words.join("-")}-`;
  const has = (w: string) => joined.includes(`-${w}-`) || (w.includes("_") && name.includes(w));
  const os = Object.keys(OS_WORDS).find((k) => (OS_WORDS[k] ?? []).some(has)) ?? null;
  const arch = Object.keys(ARCH_WORDS).find((k) => (ARCH_WORDS[k] ?? []).some(has)) ?? null;
  const gpu = GPU_WORDS.find((w) => words.some((x) => x.startsWith(w)));
  return { ...asset, os, arch, variant: gpu ?? (os === "darwin" ? "metal" : "cpu") };
}

/** Every program archive of a release, for the user to choose from when the guess fails. */
export function listBuilds(assets: ReleaseAsset[]): Build[] {
  return assets.map(describeAsset).filter((b): b is Build => b !== null);
}

/** The archive of a build for this system, or null when the release has none. */
export function pickAsset(
  assets: ReleaseAsset[],
  platform: string,
  arch: string,
  variant: Variant,
): ReleaseAsset | null {
  const cpuArch = arch === "arm64" ? "arm64" : "x64";
  const found = listBuilds(assets).filter((b) => {
    if (b.os !== platform || b.arch !== cpuArch) return false;
    if (variant === "vulkan") return b.variant === "vulkan";
    return b.variant === "cpu" || b.variant === "metal";
  });
  // The plainest name wins: "ubuntu-x64" over "ubuntu-x64-noavx" and the like.
  const best = found.sort((a, b) => a.name.length - b.name.length)[0];
  return best ? { name: best.name, size: best.size, url: best.url, sha256: best.sha256 } : null;
}
