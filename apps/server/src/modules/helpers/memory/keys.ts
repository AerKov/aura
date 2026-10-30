/**
 * Language-neutral search keys for memory notes: every word cut to its first 5 letters. A crude
 * prefix stemmer that makes inflected forms meet ("короткі" and "коротко", "deploy" and
 * "deployed") in languages the full-text analyzer cannot stem (ADR 0013).
 */
export function searchKeys(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.map((w) => [...w].slice(0, 5).join("")))].join(" ");
}

/** Reciprocal rank fusion of ranked id lists (k = 60, the usual constant). */
export function fuseRanks(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const [rank, id] of list.entries()) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return scores;
}
