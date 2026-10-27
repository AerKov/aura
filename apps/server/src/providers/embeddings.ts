import { errorMessage } from "../lib/log";

/** Turns text into vectors for semantic memory search (ADR 0013). */
export interface Embedder {
  /** Identifies the vector space: vectors from different models are never compared. */
  readonly model: string;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  override name = "EmbeddingError";
}

/**
 * Embeddings from an OpenAI-compatible `/embeddings` endpoint: Ollama (`<url>/v1`), LM Studio,
 * vLLM, or a cloud API.
 */
export class OpenAICompatEmbedder implements Embedder {
  readonly model: string;

  constructor(
    private readonly opts: {
      engine: string;
      baseUrl: string;
      model: string;
      apiKey?: string | null;
      fetch?: typeof fetch;
    },
  ) {
    this.model = `${opts.engine}:${opts.model}`;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];
    let res: Response;
    try {
      res = await (this.opts.fetch ?? fetch)(`${this.opts.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.opts.model, input: texts }),
        signal: signal ?? AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new EmbeddingError(`embedding server not reachable: ${errorMessage(error)}`);
    }
    if (!res.ok) {
      throw new EmbeddingError(
        `embedding server answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const body: unknown = await res.json();
    const data =
      body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: unknown[] }).data
        : [];
    const vectors = data.map((item) => {
      const vector =
        item && typeof item === "object" ? (item as { embedding?: unknown }).embedding : null;
      if (!Array.isArray(vector) || !vector.every((x) => typeof x === "number")) {
        throw new EmbeddingError("embedding server returned no vectors");
      }
      return vector as number[];
    });
    if (vectors.length !== texts.length)
      throw new EmbeddingError("embedding count does not match input");
    return vectors;
  }
}
