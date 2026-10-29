import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileError, FileStore } from "./store";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("file store (ADR 0036)", () => {
  let dir: string;
  let store: FileStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aura-files-"));
    store = new FileStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("a file is stored under a safe name and listed with its type", () => {
    const scope = { kind: "chat" as const, id: "c1" };
    const ref = store.put(scope, "../../etc/Bill 1.pdf", bytes("%PDF-1.4"));
    expect(ref).toMatchObject({ name: "Bill 1.pdf", size: 8, type: "application/pdf" });
    expect(store.list(scope).map((f) => f.id)).toEqual([ref.id]);
    const found = store.find(scope, ref.id);
    expect(found && readFileSync(found.path, "utf8")).toBe("%PDF-1.4");
    // Nothing escaped the scope's folder.
    expect(existsSync(join(dir, "etc"))).toBe(false);
  });

  test("two files with one name stay two files", () => {
    const scope = { kind: "app" as const, id: "clients" };
    const a = store.put(scope, "a.txt", bytes("1"));
    const b = store.put(scope, "a.txt", bytes("2"));
    expect(a.id).not.toBe(b.id);
    expect(store.list(scope)).toHaveLength(2);
  });

  test("chats and apps keep their files apart, and ids are checked", () => {
    const chat = store.put({ kind: "chat", id: "x" }, "a.txt", bytes("1"));
    expect(store.find({ kind: "app", id: "x" }, chat.id)).toBeNull();
    expect(() => store.list({ kind: "chat", id: "../x" })).toThrow(FileError);
    expect(store.find({ kind: "chat", id: "x" }, "../../etc")).toBeNull();
  });

  test("empty and oversized files are refused", () => {
    const scope = { kind: "chat" as const, id: "c1" };
    expect(() => store.put(scope, "a.txt", new Uint8Array())).toThrow("empty");
    expect(() => store.put(scope, "big.bin", new Uint8Array(30 * 1024 * 1024 + 1))).toThrow(
      "at most",
    );
  });

  test("a file can be removed, copied for an agent and a scope dropped", () => {
    const scope = { kind: "chat" as const, id: "c1" };
    const ref = store.put(scope, "notes.txt", bytes("hi"));
    const work = join(dir, "work");
    const first = store.copyTo(scope, ref.id, work);
    const second = store.copyTo(scope, ref.id, work);
    expect(first).toBe(join(work, "notes.txt"));
    expect(second).toBe(join(work, "notes (2).txt"));
    expect(store.remove(scope, ref.id)).toBe(true);
    expect(store.remove(scope, ref.id)).toBe(false);
    store.put(scope, "b.txt", bytes("1"));
    store.removeScope(scope);
    expect(store.list(scope)).toEqual([]);
  });
});
