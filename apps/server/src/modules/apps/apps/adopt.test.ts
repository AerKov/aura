import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../../../lib/git";
import { createTestApp } from "../../../testing";

setDefaultTimeout(30_000);

let t: Awaited<ReturnType<typeof createTestApp>> | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

test("a panel extension becomes an app with a chat and keeps its id, files and state (ADR 0039)", async () => {
  t = await createTestApp();
  const dir = join(t.dataDir, "extensions", "board");
  mkdirSync(join(dir, "lib"), { recursive: true });
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      id: "board",
      name: "Board",
      version: "1.0.0",
      minAppVersion: "0.1.0",
      author: "me",
      permissions: ["ui.panel", "storage"],
    }),
  );
  writeFileSync(join(dir, "main.js"), "export default () => {}");
  writeFileSync(join(dir, "lib", "helper.js"), "// a library");
  await git(t.dataDir, ["add", "-A"]);
  await git(t.dataDir, ["commit", "-m", "add board"]);
  await t.extensions.setEnabled("board", true);

  expect(t.apps.legacyExtensions()).toEqual(["board"]);
  expect(await t.apps.adoptExtensions()).toEqual(["board"]);

  expect(existsSync(dir)).toBe(false);
  const project = await t.projects.get("board");
  expect(project).toMatchObject({ kind: "app", name: "Board" });
  expect(readFileSync(join(project?.workspace ?? "", "lib", "helper.js"), "utf8")).toBe(
    "// a library",
  );
  const info = await t.extensions.info("board");
  expect(info.enabled).toBe(true);
  expect(info.app?.chatId).toBe(project?.chatId);
  expect(await git(t.dataDir, ["log", "--oneline", "-1"])).toContain(
    "extension board is now an app",
  );
  // Once is enough.
  expect(t.apps.legacyExtensions()).toEqual([]);
  expect(await t.apps.adoptExtensions()).toEqual([]);
});
