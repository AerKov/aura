import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestApp } from "../../../testing";
import { validateManifest } from "../customize/extensions";

setDefaultTimeout(30_000);

let t: Awaited<ReturnType<typeof createTestApp>> | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

const base = {
  id: "my-chats",
  name: "My chats",
  version: "1.0.0",
  minAppVersion: "0.1.0",
  author: "me",
  permissions: ["ui.panel"],
};

test("a manifest may replace a built-in app, only a known one and only with a panel", () => {
  expect(validateManifest({ ...base, replaces: "chats" }).replaces).toBe("chats");
  expect(() => validateManifest({ ...base, replaces: "terminal" })).toThrow(/replaces must be/);
  expect(() => validateManifest({ ...base, permissions: [], replaces: "settings" })).toThrow(
    /needs ui.panel/,
  );
  expect(validateManifest(base).replaces).toBeUndefined();
});

test("an app made to replace a built-in one says so in its manifest and its brief (ADR 0041)", async () => {
  t = await createTestApp();
  const { project } = await t.apps.create({
    name: "My chats",
    description: "A messenger with my own layout.",
    replaces: "chats",
  });
  const manifest = JSON.parse(readFileSync(join(project.workspace, "manifest.json"), "utf8"));
  expect(manifest.replaces).toBe("chats");
  expect((await t.extensions.info(project.id)).replaces).toBe("chats");
  const brief = readFileSync(join(project.workspace, "BRIEF.md"), "utf8");
  expect(brief).toContain("takes the place of Aura's built-in Chats");
  expect(brief).toContain("chat.read, chat.write");
});
