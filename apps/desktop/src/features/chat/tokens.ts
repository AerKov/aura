/** "2M", "500k", "1.5m" or "120000" → a token count; null when it is not a number. */
export function parseTokens(text: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([kKmM]?)\s*$/.exec(text);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(",", "."));
  const scale = m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return Math.round(n * scale);
}
