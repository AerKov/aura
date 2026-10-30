import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";
import { addLibrary } from "./libraries";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const CHART = "window.Chart = function Chart() {}; /* a UMD build */";

function cdn(files: Record<string, string>): { fetchFn: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);
    const body = files[url];
    return body === undefined ? new Response("no", { status: 404 }) : new Response(body);
  }) as typeof fetch;
  return { fetchFn, urls };
}

describe("libraries in apps (ADR 0033)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("a library is fetched once at an exact version into lib/", async () => {
    const { fetchFn, urls } = cdn({
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js": CHART,
    });
    const dir = mkdtempSync(join(tmpdir(), "aura-lib-"));
    const added = await addLibrary(
      dir,
      { package: "chart.js", version: "4.4.1", file: "dist/chart.umd.js" },
      fetchFn,
    );
    expect(added.path).toBe("lib/chart.js@4.4.1/chart.umd.js");
    expect(readFileSync(join(dir, added.path), "utf8")).toBe(CHART);
    expect(urls).toHaveLength(1);

    for (const bad of [
      { package: "chart.js", version: "^4", file: "dist/chart.umd.js" },
      { package: "chart.js", version: "latest", file: "dist/chart.umd.js" },
      { package: "Chart JS", version: "4.4.1", file: "dist/chart.umd.js" },
      { package: "chart.js", version: "4.4.1", file: "../../etc/passwd.js" },
      { package: "chart.js", version: "4.4.1", file: "dist/chart.wasm" },
    ])
      await expect(addLibrary(dir, bad, fetchFn)).rejects.toThrow();
    await expect(
      addLibrary(dir, { package: "nope", version: "1.0.0", file: "x.js" }, fetchFn),
    ).rejects.toThrow("HTTP 404");
  });

  test("listed libraries load in the frame; the change card lists them without their code", async () => {
    t = await createTestApp({ provider: new FakeProvider() });
    const { chat } = await t.apps.create({ name: "Charts" });
    const dir = join(t.dataDir, "projects", "charts");
    const { fetchFn } = cdn({
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js": CHART,
      "https://cdn.jsdelivr.net/npm/tiny-esm@1.0.0/index.mjs": "export const answer = 42;",
    });
    await addLibrary(
      dir,
      { package: "chart.js", version: "4.4.1", file: "dist/chart.umd.js" },
      fetchFn,
    );
    await addLibrary(dir, { package: "tiny-esm", version: "1.0.0", file: "index.mjs" }, fetchFn);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    manifest.libraries = ["lib/chart.js@4.4.1/chart.umd.js", "lib/tiny-esm@1.0.0/index.mjs"];
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

    await t.chat.post({
      chatId: chat.id,
      author: { kind: "user", id: "owner" },
      body: "@builder add a chart",
    });
    await Bun.sleep(30);
    await t.runtime.whenIdle();
    const [card] = await t.approvals.listPending();
    expect(card?.preview).toContain("library: `lib/chart.js@4.4.1/chart.umd.js`");
    expect(card?.preview).toContain("chart.umd.js");
    expect(card?.preview).not.toContain("a UMD build");

    const draft = (await t.extensions.frame("charts", true)) ?? "";
    expect(draft).toContain(CHART);
    expect(draft).toContain('"lib/tiny-esm@1.0.0/index.mjs"');
    expect(draft).toContain("window.__auraFrame");
    // Not live before approval.
    expect(await t.extensions.frame("charts")).not.toContain(CHART);

    manifest.libraries = ["https://cdn.example.com/x.js"];
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    // A manifest that lists a URL is invalid: nothing from it loads.
    expect(await t.extensions.frame("charts", true)).not.toContain("cdn.example.com");
  });
});
