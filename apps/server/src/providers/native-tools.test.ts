import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPrivateHost, type NativeTool, nativeTools, resolveInside } from "./native-tools";

describe("native built-in tools", () => {
  let root: string;
  let cwd: string;
  const signal = new AbortController().signal;
  const tool = (name: string): NativeTool => {
    const found = nativeTools([name], cwd)[0];
    if (!found) throw new Error(`no tool ${name}`);
    return found;
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aura-tools-"));
    cwd = join(root, "workspace");
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src/a.ts"), "const a = 1;\nconst b = 2;\nconst a2 = 1;\n");
    writeFileSync(join(root, "secret.txt"), "top secret");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("only granted tools are offered", () => {
    expect(nativeTools(["Read", "WebSearch"], cwd).map((t) => t.name)).toEqual(["Read"]);
  });

  test("paths stay inside the workspace, including through symlinks", () => {
    expect(() => resolveInside(cwd, "../secret.txt")).toThrow(/outside/);
    expect(() => resolveInside(cwd, "/etc/passwd")).toThrow(/outside/);
    symlinkSync(root, join(cwd, "escape"));
    expect(() => resolveInside(cwd, "escape/secret.txt")).toThrow(/outside/);
    expect(() => resolveInside(cwd, "escape/new-file.txt")).toThrow(/outside/);
    expect(resolveInside(cwd, "src/new/b.ts")).toEndWith(join("src", "new", "b.ts"));
  });

  test("Read numbers lines; Edit needs a unique match", async () => {
    expect((await tool("Read").run({ file_path: "src/a.ts", limit: 1 }, signal)).text).toBe(
      "1\tconst a = 1;\n… 3 more lines",
    );
    const edit = tool("Edit");
    expect(
      await edit.run({ file_path: "src/a.ts", old_string: "= 1;", new_string: "= 9;" }, signal),
    ).toMatchObject({ isError: true });
    await edit.run(
      { file_path: "src/a.ts", old_string: "const b = 2;", new_string: "const b = 3;" },
      signal,
    );
    expect(await Bun.file(join(cwd, "src/a.ts")).text()).toContain("const b = 3;");
    await edit.run(
      { file_path: "src/a.ts", old_string: "= 1;", new_string: "= 0;", replace_all: true },
      signal,
    );
    expect(await Bun.file(join(cwd, "src/a.ts")).text()).not.toContain("= 1;");
  });

  test("Glob and Grep search the workspace", async () => {
    expect((await tool("Glob").run({ pattern: "**/*.ts" }, signal)).text).toBe("src/a.ts");
    expect((await tool("Grep").run({ pattern: "const b" }, signal)).text).toBe(
      "src/a.ts:2: const b = 2;",
    );
    expect(await tool("Grep").run({ pattern: "(" }, signal)).toMatchObject({ isError: true });
  });

  test("Bash runs in the workspace without the server's environment", async () => {
    process.env.AURA_TEST_SECRET = "should-not-leak";
    try {
      const out = await tool("Bash").run({ command: 'pwd; echo "[$AURA_TEST_SECRET]"' }, signal);
      expect(out.text).toContain("workspace");
      expect(out.text).toContain("[]");
      expect(out.text).toContain("exit code 0");
      expect(await tool("Bash").run({ command: "exit 3" }, signal)).toMatchObject({
        isError: true,
      });
    } finally {
      delete process.env.AURA_TEST_SECRET;
    }
  });

  test("WebFetch refuses local and private addresses", async () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.5",
      "172.20.0.1",
      "[::1]",
      "printer.local",
    ]) {
      expect(isPrivateHost(host)).toBe(true);
    }
    expect(isPrivateHost("example.com")).toBe(false);
    expect(
      await tool("WebFetch").run({ url: "http://127.0.0.1:4517/health" }, signal),
    ).toMatchObject({
      isError: true,
    });
    expect(await tool("WebFetch").run({ url: "file:///etc/passwd" }, signal)).toMatchObject({
      isError: true,
    });
  });
});
