import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileRef } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { git } from "../../../lib/git";
import { createTestApp } from "../../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

async function installApp(t: TestApp, id: string, permissions: string[]) {
  const dir = join(t.dataDir, "extensions", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      id,
      name: id,
      version: "1.0.0",
      minAppVersion: "0.1.0",
      author: "me",
      permissions,
    }),
  );
  writeFileSync(join(dir, "main.js"), "export default () => {}");
  await git(t.dataDir, ["add", "-A"]);
  await git(t.dataDir, ["commit", "-m", `add ${id}`]);
  await t.extensions.setEnabled(id, true);
}

const authed = (t: TestApp, path: string) =>
  t.app.handle(
    new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${t.token}` } }),
  );

describe("files in chats and apps (ADR 0036)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("a file is uploaded to a chat and comes back as it was, never as a page", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const sent = await api.chats({ chatId: "direct" }).files.post({
      file: new File(["%PDF-1.4 hello"], "Bill ü.pdf", { type: "application/pdf" }),
    });
    expect(sent.status).toBe(200);
    expect(sent.data).toMatchObject({ name: "Bill ü.pdf", type: "application/pdf", size: 14 });

    const id = (sent.data as FileRef | null)?.id ?? "";
    const res = await authed(t, `/chats/direct/files/${id}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("%PDF-1.4 hello");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("inline");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    const saved = await authed(t, `/chats/direct/files/${id}?download=1`);
    expect(saved.headers.get("content-disposition")).toContain("attachment");
    expect(saved.headers.get("content-disposition")).toContain("UTF-8''Bill%20%C3%BC.pdf");

    // Another chat cannot reach it, and it needs a session.
    expect((await authed(t, `/chats/system/files/${id}`)).status).toBe(404);
    expect((await authed(t, "/chats/nope/files/abc")).status).toBe(404);
    const anon = await t.app.handle(new Request(`http://localhost/chats/direct/files/${id}`));
    expect(anon.status).toBe(401);
  });

  test("an empty file or an unknown chat is refused", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect(
      (await api.chats({ chatId: "direct" }).files.post({ file: new File([""], "e.txt") })).status,
    ).toBe(400);
    expect(
      (await api.chats({ chatId: "nope" }).files.post({ file: new File(["x"], "a.txt") })).status,
    ).toBe(404);
  });

  test("a message carries attachments; an empty one or a missing file is refused", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const sent = await api.chats({ chatId: "direct" }).files.post({
      file: new File(["%PDF"], "plan.pdf", { type: "application/pdf" }),
    });
    const ref = sent.data as FileRef;

    const chat = api.chats({ chatId: "direct" });
    expect((await chat.messages.post({ body: "" })).status).toBe(400);
    expect((await chat.messages.post({ body: "", attachments: ["abcdefabcdef"] })).status).toBe(
      400,
    );
    // A file of another chat is not found here.
    const other = await api
      .chats({ chatId: "system" })
      .files.post({ file: new File(["x"], "o.txt") });
    expect(
      (await chat.messages.post({ body: "see", attachments: [(other.data as FileRef).id] })).status,
    ).toBe(400);

    const posted = await chat.messages.post({ body: "", attachments: [ref.id, ref.id] });
    expect(posted.status).toBe(200);
    expect((posted.data as { attachments: FileRef[] }).attachments).toEqual([ref]);
    const listed = (await chat.messages.get({ query: {} })).data as { attachments: FileRef[] }[];
    expect(listed.at(-1)?.attachments).toEqual([ref]);
    // The chat list shows the file's name when there are no words.
    expect((await t.repo.findChat("direct"))?.lastMessagePreview).toBe("plan.pdf");
  });

  test("an app's files need the docs permission and stay its own", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    await installApp(t, "plain", ["ui.panel"]);
    await installApp(t, "board", ["ui.panel", "docs"]);
    expect((await api.extensions({ extensionId: "plain" }).docs.get()).status).toBe(403);
    expect(
      (await api.extensions({ extensionId: "plain" }).docs.post({ file: new File(["x"], "a.txt") }))
        .status,
    ).toBe(403);

    const board = api.extensions({ extensionId: "board" });
    const sent = await board.docs.post({ file: new File(["a,b\n1,2"], "data.csv") });
    expect(sent.data).toMatchObject({ name: "data.csv", type: "text/csv" });
    const id = (sent.data as FileRef | null)?.id ?? "";
    expect((await board.docs.get()).data?.map((f) => f.id)).toEqual([id]);
    expect(await (await authed(t, `/extensions/board/docs/${id}`)).text()).toBe("a,b\n1,2");
    expect((await authed(t, `/extensions/plain/docs/${id}`)).status).toBe(403);

    expect((await board.docs({ fileId: id }).delete()).status).toBe(200);
    expect((await board.docs({ fileId: id }).delete()).status).toBe(404);
    expect((await board.docs.get()).data).toEqual([]);
  });
});
