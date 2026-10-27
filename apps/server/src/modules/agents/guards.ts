/**
 * Agent loop guards (CLAUDE.md rule 8, docs/SPEC.md section 8). Pure functions so they are easy to
 * test and reason about.
 */

export const DEFAULT_MAX_CHAIN_DEPTH = 8;
export const BUDGET_WARN_RATIO = 0.8;

/** A reply at `depth` is allowed while it does not exceed the max chain depth. */
export function chainDepthAllowed(replyDepth: number, maxDepth = DEFAULT_MAX_CHAIN_DEPTH): boolean {
  return replyDepth <= maxDepth;
}

export type BudgetLevel = "ok" | "warn" | "stop";

export function budgetLevel(spentUsd: number, budgetUsd: number | null): BudgetLevel {
  if (budgetUsd === null) return "ok";
  if (spentUsd >= budgetUsd) return "stop";
  if (spentUsd >= budgetUsd * BUDGET_WARN_RATIO) return "warn";
  return "ok";
}

/** True when this run's spend moved the total across the warning line. */
export function crossedWarning(before: number, after: number, budgetUsd: number | null): boolean {
  if (budgetUsd === null) return false;
  const line = budgetUsd * BUDGET_WARN_RATIO;
  return before < line && after >= line;
}

/** Hard cap for one run: the smallest remaining budget, or undefined when nothing limits it. */
export function runBudget(
  limits: { spentUsd: number; budgetUsd: number | null }[],
): number | undefined {
  const remaining = limits
    .filter((l) => l.budgetUsd !== null)
    .map((l) => Math.max(0, (l.budgetUsd as number) - l.spentUsd));
  return remaining.length > 0 ? Math.min(...remaining) : undefined;
}
