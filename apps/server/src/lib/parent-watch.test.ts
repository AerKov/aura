import { expect, test } from "bun:test";
import { isParentAlive, isProcessAlive, watchParent } from "./parent-watch";

test("isProcessAlive detects the current and a finished process", async () => {
  expect(isProcessAlive(process.pid)).toBe(true);
  const child = Bun.spawn(["true"]);
  await child.exited;
  expect(isProcessAlive(child.pid)).toBe(false);
});

test("isParentAlive is true only for the actual parent", () => {
  expect(isParentAlive(process.ppid)).toBe(true);
  expect(isParentAlive(process.pid)).toBe(false);
});

test("watchParent fires once the process exits", async () => {
  const child = Bun.spawn(["sleep", "0.1"]);
  await new Promise<void>((resolve) => watchParent(() => isProcessAlive(child.pid), resolve, 20));
  expect(isProcessAlive(child.pid)).toBe(false);
});
