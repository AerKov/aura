import { describe, expect, test } from "bun:test";
import {
  budgetLevel,
  chainDepthAllowed,
  crossedWarning,
  DEFAULT_MAX_CHAIN_DEPTH,
  runBudget,
} from "./guards";

describe("chain depth", () => {
  test("allows up to the max and stops after", () => {
    expect(chainDepthAllowed(1)).toBe(true);
    expect(chainDepthAllowed(DEFAULT_MAX_CHAIN_DEPTH)).toBe(true);
    expect(chainDepthAllowed(DEFAULT_MAX_CHAIN_DEPTH + 1)).toBe(false);
    expect(chainDepthAllowed(3, 2)).toBe(false);
  });
});

describe("budgets", () => {
  test("levels: ok below 80%, warn from 80%, stop at 100%", () => {
    expect(budgetLevel(5, null)).toBe("ok");
    expect(budgetLevel(0.79, 1)).toBe("ok");
    expect(budgetLevel(0.8, 1)).toBe("warn");
    expect(budgetLevel(1, 1)).toBe("stop");
    expect(budgetLevel(1.5, 1)).toBe("stop");
  });

  test("warning fires once when crossing the line", () => {
    expect(crossedWarning(0.5, 0.85, 1)).toBe(true);
    expect(crossedWarning(0.85, 0.9, 1)).toBe(false);
    expect(crossedWarning(0.1, 0.2, 1)).toBe(false);
    expect(crossedWarning(0, 100, null)).toBe(false);
  });

  test("run budget is the smallest remaining limit", () => {
    expect(runBudget([])).toBeUndefined();
    expect(runBudget([{ spentUsd: 1, budgetUsd: null }])).toBeUndefined();
    expect(
      runBudget([
        { spentUsd: 1, budgetUsd: 5 },
        { spentUsd: 0.5, budgetUsd: 2 },
      ]),
    ).toBe(1.5);
    expect(runBudget([{ spentUsd: 3, budgetUsd: 2 }])).toBe(0);
  });
});
