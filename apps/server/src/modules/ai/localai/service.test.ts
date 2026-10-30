import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { createTestApp } from "../../../testing";
import { downloadFile } from "./download";
import type { ServerProcess } from "./service";

setDefaultTimeout(30_000);

const TAG = "b9999";
const MODEL_BYTES = new TextEncoder().encode("GGUF fake model bytes".repeat(50));

const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

/** A real .tar.gz with a fake `llama-server` inside, made with the system's tar. */
async function fakeArchive(dir: string, name: string): Promise<Uint8Array> {
  const src = join(dir, "pack", "llama-b9999");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "llama-server"), "#!/bin/sh\nexit 0\n");
  const archive = join(dir, name);
  const proc = Bun.spawn(["tar", "-czf", archive, "-C", join(dir, "pack"), "llama-b9999"]);
  await proc.exited;
  return new Uint8Array(readFileSync(archive));
}

/** GitHub, Hugging Face and the llama-server health endpoint, recording what was asked. */
function fakeWorld(archive: Uint8Array, opts: { badSha?: boolean } = {}) {
  const calls: string[] = [];
  const name = "llama-b9999-bin-ubuntu-x64.tar.gz";
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const release = {
      tag_name: TAG,
      published_at: "2026-10-01T00:00:00Z",
      assets: [
        {
          name,
          size: archive.byteLength,
          browser_download_url: `https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${name}`,
          digest: `sha256:${opts.badSha ? "0".repeat(64) : sha256(archive)}`,
        },
      ],
    };
    const api = "https://api.github.com/repos/ggml-org/llama.cpp/releases";
    if (url === `${api}/latest` || url === `${api}/tags/${TAG}`) return Response.json(release);
    if (url === `${api}?per_page=20`)
      return Response.json([
        release,
        { tag_name: "draft", draft: true, assets: [] },
        { tag_name: "v0.8.0", published_at: null, assets: [] },
      ]);
    if (url.endsWith(`/releases/download/${TAG}/${name}`)) return new Response(archive);
    if (url.startsWith("https://huggingface.co/api/models/unsloth/Qwen3-4B-GGUF"))
      return Response.json({
        siblings: [
          {
            rfilename: "Qwen3-4B-Q4_K_M.gguf",
            size: MODEL_BYTES.byteLength,
            lfs: { sha256: sha256(MODEL_BYTES), size: MODEL_BYTES.byteLength },
          },
        ],
      });
    if (url.startsWith("https://huggingface.co/api/models/"))
      return new Response("no", { status: 404 });
    if (url.endsWith("/resolve/main/Qwen3-4B-Q4_K_M.gguf")) return new Response(MODEL_BYTES);
    if (url.startsWith("http://127.0.0.1:") && url.endsWith("/health")) return new Response("ok");
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const fakeSpawn =
  (started: string[][]) =>
  (cmd: string[]): ServerProcess => {
    started.push(cmd);
    return { exited: new Promise<number>(() => {}), kill() {}, tail: () => "" };
  };

describe("built-in llama.cpp (ADR 0038)", () => {
  let dir: string;
  let t: Awaited<ReturnType<typeof createTestApp>> | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aura-llama-"));
  });
  afterEach(async () => {
    await t?.close();
    t = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  async function setup(opts: { badSha?: boolean } = {}) {
    const archive = await fakeArchive(dir, "src.tar.gz");
    const world = fakeWorld(archive, opts);
    const started: string[][] = [];
    t = await createTestApp({
      fetch: world.fetchFn,
      llamaSpawn: fakeSpawn(started),
      llamaSystem: { platform: "linux", arch: "x64", ramBytes: 16 * 1024 ** 3 },
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    return { world, started, api };
  }

  async function waitDone(api: Awaited<ReturnType<typeof setup>>["api"]) {
    for (let i = 0; i < 200; i++) {
      const status = (await api["local-ai"].get()).data;
      if (status && (status.job.phase === "done" || status.job.phase === "error")) return status;
      await Bun.sleep(20);
    }
    throw new Error("the install did not finish");
  }

  test("a plan names what will be downloaded and downloads nothing", async () => {
    const { world, api } = await setup();
    const plan = (await api["local-ai"].plan.post({ model: "qwen3-4b" })).data;
    expect(plan).toMatchObject({
      plan: {
        binary: { tag: TAG, asset: "llama-b9999-bin-ubuntu-x64.tar.gz" },
        model: { repo: "unsloth/Qwen3-4B-GGUF", file: "Qwen3-4B-Q4_K_M.gguf" },
      },
    });
    expect(world.calls.some((u) => u.endsWith(".tar.gz") || u.endsWith(".gguf"))).toBe(false);
    expect((await api["local-ai"].get()).data).toMatchObject({ installed: null, models: [] });
  });

  test("an approved plan installs the program and the model, and the engine is ready", async () => {
    const { api } = await setup();
    // Nothing else works here, so the local AI becomes the default.
    (t?.provider as unknown as { status: unknown }).status = { ok: false, reason: "no login" };
    const planned = (await api["local-ai"].plan.post({ model: "qwen3-4b" })).data as { id: string };
    await api["local-ai"].install.post({ planId: planned.id });
    const status = await waitDone(api);
    expect(status).toMatchObject({ installed: TAG, job: { phase: "done" } });
    expect(status.models.map((m) => m.file)).toEqual(["Qwen3-4B-Q4_K_M.gguf"]);

    // useLocalModel runs after the job finishes.
    for (let i = 0; i < 100 && (await t?.engines.store.get().default) !== "llama-cpp"; i++)
      await Bun.sleep(20);
    expect(t?.engines.store.get()).toMatchObject({
      default: "llama-cpp",
      models: { "llama-cpp": "Qwen3-4B-Q4_K_M.gguf" },
    });
    const engine = (await api.engines.get()).data?.engines.find((e) => e.id === "llama-cpp");
    expect(engine).toMatchObject({ status: { ok: true }, model: "Qwen3-4B-Q4_K_M.gguf" });
    expect(
      (await api.engines({ engine: "llama-cpp" }).models.get()).data?.map((m) => m.id),
    ).toEqual(["Qwen3-4B-Q4_K_M.gguf"]);
  });

  test("a plan is used once, and a made-up plan is refused", async () => {
    const { api } = await setup();
    const planned = (await api["local-ai"].plan.post({ model: null })).data as { id: string };
    expect((await api["local-ai"].install.post({ planId: "nope" })).status).toBe(400);
    expect((await api["local-ai"].install.post({ planId: planned.id })).status).toBe(200);
    await waitDone(api);
    expect((await api["local-ai"].install.post({ planId: planned.id })).status).toBe(400);
  });

  test("a download that does not match its checksum is thrown away", async () => {
    const { api } = await setup({ badSha: true });
    const planned = (await api["local-ai"].plan.post({ model: null })).data as { id: string };
    await api["local-ai"].install.post({ planId: planned.id });
    const status = await waitDone(api);
    expect(status.job.phase).toBe("error");
    expect(status.job.error).toContain("checksum");
    expect(status.installed).toBeNull();
  });

  test("the server starts on the model with a key, on this computer only", async () => {
    const { api, started } = await setup();
    const planned = (await api["local-ai"].plan.post({ model: "qwen3-4b" })).data as { id: string };
    await api["local-ai"].install.post({ planId: planned.id });
    await waitDone(api);

    await t?.engines.localAi.ensureRunning("Qwen3-4B-Q4_K_M.gguf");
    await t?.engines.localAi.ensureRunning("Qwen3-4B-Q4_K_M.gguf");
    expect(started).toHaveLength(1);
    const cmd = started[0] ?? [];
    expect(cmd[cmd.indexOf("--host") + 1]).toBe("127.0.0.1");
    expect(cmd).toContain("--jinja");
    expect(cmd[cmd.indexOf("--api-key") + 1]).toBeTruthy();
    expect(t?.engines.localAi.endpoint()?.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    expect((await api["local-ai"].get()).data?.running).toBe("Qwen3-4B-Q4_K_M.gguf");

    // A model that is not downloaded cannot be started.
    await expect(t?.engines.localAi.ensureRunning("other.gguf")).rejects.toThrow("not downloaded");
  });

  test("models and the program can be removed", async () => {
    const { api } = await setup();
    const planned = (await api["local-ai"].plan.post({ model: "qwen3-4b" })).data as { id: string };
    await api["local-ai"].install.post({ planId: planned.id });
    await waitDone(api);
    expect(
      (await api["local-ai"].models({ file: "Qwen3-4B-Q4_K_M.gguf" }).delete()).data?.models,
    ).toEqual([]);
    expect((await api["local-ai"].delete()).data).toMatchObject({ installed: null });
  });

  test("the user can choose the build; one for another system is refused", async () => {
    const { api } = await setup();
    const builds = (await api["local-ai"].builds.get()).data;
    expect(builds).toMatchObject({ tag: TAG, suggested: "llama-b9999-bin-ubuntu-x64.tar.gz" });
    const chosen = await api["local-ai"].plan.post({
      model: null,
      asset: "llama-b9999-bin-ubuntu-x64.tar.gz",
    });
    expect(chosen.status).toBe(200);
    expect((await api["local-ai"].plan.post({ model: null, asset: "nope.zip" })).status).toBe(400);
  });

  test("the user can choose the release", async () => {
    const { api } = await setup();
    const releases = (await api["local-ai"].releases.get()).data;
    expect(releases).toEqual([
      { tag: TAG, published: Date.parse("2026-10-01T00:00:00Z"), builds: 1, fits: true },
      { tag: "v0.8.0", published: null, builds: 0, fits: false },
    ]);
    expect((await api["local-ai"].builds.get({ query: { tag: TAG } })).data?.tag).toBe(TAG);
    const plan = await api["local-ai"].plan.post({ model: null, tag: TAG });
    expect(plan.data?.plan.binary?.tag).toBe(TAG);
    expect((await api["local-ai"].plan.post({ model: null, tag: "v9.9.9" })).status).toBe(400);
    expect((await api["local-ai"].plan.post({ model: null, tag: "../x" })).status).toBe(400);
  });

  test("an unknown repository is said plainly", async () => {
    const { api } = await setup();
    const res = await api["local-ai"].plan.post({ model: "nobody/nothing" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.error?.value)).toContain("No repository nobody/nothing");
    expect((await api["local-ai"].plan.post({ model: "not a repo" })).status).toBe(400);
  });
});

describe("downloads", () => {
  test("a file is put in place only when it is whole and matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aura-dl-"));
    const bytes = new TextEncoder().encode("hello");
    const fetchFn = (async () => new Response(bytes)) as unknown as typeof fetch;
    const seen: number[] = [];
    await downloadFile({
      url: "https://x/a",
      dest: join(dir, "a"),
      sha256: sha256(bytes),
      fetch: fetchFn,
      onProgress: (done) => seen.push(done),
    });
    expect(readFileSync(join(dir, "a"), "utf8")).toBe("hello");
    expect(seen.at(-1)).toBe(5);
    await expect(
      downloadFile({
        url: "https://x/a",
        dest: join(dir, "b"),
        sha256: "0".repeat(64),
        fetch: fetchFn,
      }),
    ).rejects.toThrow("checksum");
    expect(existsSync(join(dir, "b"))).toBe(false);
    expect(existsSync(join(dir, "b.part"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
