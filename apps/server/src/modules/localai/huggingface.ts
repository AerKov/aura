import { errorMessage } from "../../lib/log";

/** Finds the GGUF file of a Hugging Face repository to download (ADR 0038). */
export interface ModelFile {
  repo: string;
  /** The file name as stored here: no folders. */
  file: string;
  /** The path inside the repository, which may have folders. */
  path: string;
  url: string;
  size: number;
  /** The checksum Hugging Face stores for large files; null when it states none. */
  sha256: string | null;
}

export class ModelError extends Error {
  override name = "ModelError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A file of one piece: shards and vision projectors are not what a chat model needs. */
function isWhole(name: string): boolean {
  return /\.gguf$/i.test(name) && !/mmproj/i.test(name) && !/-\d{5}-of-\d{5}\.gguf$/i.test(name);
}

/** Picks the file of `quant` from a repository's file list, or says what is there. */
export function chooseFile(repo: string, siblings: unknown, quant: string): ModelFile {
  const files = (Array.isArray(siblings) ? siblings : [])
    .filter(isRecord)
    .filter((s) => typeof s.rfilename === "string" && isWhole(s.rfilename));
  const wanted = quant.toLowerCase();
  const match = files
    .filter((s) => String(s.rfilename).toLowerCase().includes(wanted))
    .sort((a, b) => String(a.rfilename).length - String(b.rfilename).length)[0];
  if (!match) {
    const have = files.map((s) => String(s.rfilename).split("/").pop()).slice(0, 12);
    throw new ModelError(
      files.length === 0
        ? `${repo} has no single-file GGUF models`
        : `${repo} has no "${quant}" file. It has: ${have.join(", ")}`,
    );
  }
  const path = String(match.rfilename);
  const lfs = isRecord(match.lfs) ? match.lfs : {};
  const sha =
    typeof lfs.sha256 === "string" && /^[a-f0-9]{64}$/i.test(lfs.sha256) ? lfs.sha256 : null;
  const size =
    typeof match.size === "number" ? match.size : typeof lfs.size === "number" ? lfs.size : 0;
  return {
    repo,
    file: path.split("/").pop() ?? path,
    path,
    url: `https://huggingface.co/${repo}/resolve/main/${path.split("/").map(encodeURIComponent).join("/")}`,
    size,
    sha256: sha ? sha.toLowerCase() : null,
  };
}

export async function resolveModel(
  repo: string,
  quant: string,
  fetchFn: typeof fetch = fetch,
): Promise<ModelFile> {
  let body: unknown;
  try {
    const res = await fetchFn(`https://huggingface.co/api/models/${repo}?blobs=true`, {
      headers: { "user-agent": "aura" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) throw new ModelError(`No repository ${repo} on Hugging Face`);
    if (!res.ok) throw new ModelError(`Hugging Face answered HTTP ${res.status}`);
    body = await res.json();
  } catch (error) {
    if (error instanceof ModelError) throw error;
    throw new ModelError(`Could not reach Hugging Face (${errorMessage(error)})`);
  }
  return chooseFile(repo, isRecord(body) ? body.siblings : [], quant);
}
