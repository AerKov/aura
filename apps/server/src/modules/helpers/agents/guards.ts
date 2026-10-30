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

/** Spend against both limits of a project or an agent (ADR 0023). */
export interface Spend {
  spentUsd: number;
  spentTokens: number;
  budgetUsd: number | null;
  budgetTokens: number | null;
}

const LEVELS: BudgetLevel[] = ["ok", "warn", "stop"];

/** The worse of the two levels: a limit in tokens or in dollars, whichever comes first. */
export function spendLevel(s: Spend): BudgetLevel {
  const a = LEVELS.indexOf(budgetLevel(s.spentUsd, s.budgetUsd));
  const b = LEVELS.indexOf(budgetLevel(s.spentTokens, s.budgetTokens));
  return LEVELS[Math.max(a, b)] ?? "ok";
}

/** True when a run moved either measure across its warning line. */
export function crossedSpendWarning(before: Spend, usd: number, tokens: number): boolean {
  return (
    crossedWarning(before.spentUsd, before.spentUsd + usd, before.budgetUsd) ||
    crossedWarning(before.spentTokens, before.spentTokens + tokens, before.budgetTokens)
  );
}
