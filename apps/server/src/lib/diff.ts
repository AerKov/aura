/**
 * Minimal unified line diff for approval previews. Files here are small (skills, agent profiles),
 * so an O(n*m) LCS table is fine.
 */
export function unifiedDiff(before: string, after: string, path: string, context = 3): string {
  const a = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const b = after === "" ? [] : after.replace(/\n$/, "").split("\n");
  const n = a.length;
  const m = b.length;
  // lcs[i * (m + 1) + j]: length of the longest common subsequence of a[i..] and b[j..].
  const lcs = new Int32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => lcs[i * (m + 1) + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  type Op = { kind: " " | "-" | "+"; text: string; ai: number; bi: number };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const left = a[i] ?? "";
    const right = b[j] ?? "";
    if (i < n && j < m && left === right) {
      i++;
      j++;
      ops.push({ kind: " ", text: left, ai: i, bi: j });
    } else if (i < n && (j >= m || at(i + 1, j) >= at(i, j + 1))) {
      // Prefer deletions before additions, like git.
      i++;
      ops.push({ kind: "-", text: left, ai: i, bi: j });
    } else {
      j++;
      ops.push({ kind: "+", text: right, ai: i, bi: j });
    }
  }
  if (!ops.some((op) => op.kind !== " ")) return "";

  // Group changes into hunks with `context` unchanged lines around them.
  const out = [`--- a/${path}`, `+++ b/${path}`];
  let k = 0;
  const changed = (index: number) => ops[index]?.kind !== " ";
  while (k < ops.length) {
    while (k < ops.length && !changed(k)) k++;
    if (k >= ops.length) break;
    const start = Math.max(0, k - context);
    let end = k;
    let lastChange = k;
    // Changes separated by at most 2 * context unchanged lines share a hunk.
    while (end < ops.length && end - lastChange <= context * 2 + 1) {
      if (changed(end)) lastChange = end;
      end++;
    }
    end = Math.min(ops.length, lastChange + context + 1);
    const hunk = ops.slice(start, end);
    const aStart = hunk.find((op) => op.kind !== "+")?.ai ?? 0;
    const bStart = hunk.find((op) => op.kind !== "-")?.bi ?? 0;
    const aLen = hunk.filter((op) => op.kind !== "+").length;
    const bLen = hunk.filter((op) => op.kind !== "-").length;
    out.push(`@@ -${aLen ? aStart : 0},${aLen} +${bLen ? bStart : 0},${bLen} @@`);
    for (const op of hunk) out.push(`${op.kind}${op.text}`);
    k = end;
  }
  return out.join("\n");
}
