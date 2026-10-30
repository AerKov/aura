import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { totalmem } from "node:os";
import { join } from "node:path";
import {
  type LocalAiPhase,
  type LocalAiStatus,
  type LocalPlan,
  recommendedModel,
} from "@aura/shared";
import { errorMessage, log } from "../../lib/log";
import { downloadFile } from "./download";
import { extractArchive, findServer } from "./extract";
import { type ModelFile, resolveModel } from "./huggingface";
import {
  type Build,
  fetchLatestRelease,
  listBuilds,
  pickAsset,
  type Release,
  type ReleaseAsset,
  variantsFor,
} from "./release";

export class LocalAiError extends Error {
  override name = "LocalAiError";
}

/** A running `llama-server`, as far as this service needs to know. */
export interface ServerProcess {
  exited: Promise<number>;
  kill(): void;
  /** The last lines it printed, for the message when it does not start. */
  tail(): string;
}

export type SpawnServer = (cmd: string[], cwd: string) => ServerProcess;

interface Installed {
  tag: string;
  variant: string;
  /** The program, relative to `bin/`. */
  exe: string;
}

const IDLE_STOP_MS = 20 * 60_000;
const START_TIMEOUT_MS = 180_000;

function realSpawn(cmd: string[], cwd: string): ServerProcess {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  let tail = "";
  const keep = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) tail = (tail + new TextDecoder().decode(chunk)).slice(-2000);
  };
  void keep(proc.stdout);
  void keep(proc.stderr);
  return { exited: proc.exited, kill: () => proc.kill(), tail: () => tail };
}

/**
 * The built-in llama.cpp (ADR 0038): finds the right build of the official release, downloads it and
 * a model after the user approves exactly what will come, and runs `llama-server` on 127.0.0.1 with a
 * random key while a helper uses it. Files live in `state/llama/`, outside git.
 */
export class LocalAiService {
  private readonly root: string;
  private job: LocalAiStatus["job"] = { phase: "idle", label: "", done: 0, total: 0, error: null };
  private readonly plans = new Map<
    string,
    { plan: LocalPlan; model: ModelFile | null; file: string | null; at: number }
  >();
  private release: Release | null = null;
  private server: {
    proc: ServerProcess;
    port: number;
    key: string;
    model: string;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private starting: Promise<void> | null = null;
  private abort: AbortController | null = null;

  constructor(
    private readonly deps: {
      dataDir: string;
      fetch?: typeof fetch;
      spawn?: SpawnServer;
      platform?: string;
      arch?: string;
      ramBytes?: number;
      onChange?: () => void;
      /** An approved install finished; `file` is the model it brought (or found). */
      onInstalled?: (file: string | null) => Promise<void> | void;
    },
  ) {
    this.root = join(deps.dataDir, "state", "llama");
  }

  private get fetchFn(): typeof fetch {
    return this.deps.fetch ?? fetch;
  }
  private get platform(): string {
    return this.deps.platform ?? process.platform;
  }
  private get arch(): string {
    return this.deps.arch ?? process.arch;
  }
  private get binDir(): string {
    return join(this.root, "bin");
  }
  private get modelDir(): string {
    return join(this.root, "models");
  }

  private installed(): Installed | null {
    try {
      const raw: unknown = JSON.parse(readFileSync(join(this.root, "installed.json"), "utf8"));
      const r = raw as Partial<Installed>;
      if (typeof r.tag === "string" && typeof r.variant === "string" && typeof r.exe === "string") {
        return existsSync(join(this.binDir, r.exe)) ? (r as Installed) : null;
      }
    } catch {
      // Not installed.
    }
    return null;
  }

  models(): { file: string; size: number }[] {
    if (!existsSync(this.modelDir)) return [];
    return readdirSync(this.modelDir)
      .filter((f) => f.endsWith(".gguf"))
      .map((file) => ({ file, size: statSync(join(this.modelDir, file)).size }))
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  modelPath(file: string): string | null {
    return this.models().some((m) => m.file === file) ? join(this.modelDir, file) : null;
  }

  status(): LocalAiStatus {
    const have = this.installed();
    const ramGb = Math.round((this.deps.ramBytes ?? totalmem()) / 1024 ** 3);
    return {
      installed: have?.tag ?? null,
      variant: have?.variant ?? null,
      ramGb,
      recommended: recommendedModel(ramGb).id,
      models: this.models(),
      running: this.server?.model ?? null,
      job: this.job,
    };
  }

  private setJob(
    phase: LocalAiPhase,
    label: string,
    done = 0,
    total = 0,
    error: string | null = null,
  ) {
    this.job = { phase, label, done, total, error };
    this.deps.onChange?.();
  }

  private async latest(): Promise<Release> {
    this.release = await fetchLatestRelease(this.fetchFn);
    return this.release;
  }

  /**
   * What would be downloaded, for the user to approve: the llama.cpp build (unless installed), and
   * the model file (unless it is already here). Nothing is fetched except the two small listings.
   */
  async plan(
    model: { repo: string; quant: string } | null,
    /** A build the user chose from `builds()`; by default the one that fits this system. */
    assetName: string | null = null,
  ): Promise<{ id: string; plan: LocalPlan }> {
    if (this.job.phase === "binary" || this.job.phase === "model")
      throw new LocalAiError("An installation is already running");
    let binary: LocalPlan["binary"] = null;
    if (!this.installed() || assetName) {
      const release = await this.latest();
      let chosen: ReleaseAsset | null;
      if (assetName) {
        const build = listBuilds(release.assets).find((b) => b.name === assetName);
        if (!build) throw new LocalAiError(`The release ${release.tag} has no file ${assetName}`);
        if (build.os && build.os !== this.platform)
          throw new LocalAiError(`${assetName} is a build for ${build.os}, not for this computer`);
        chosen = build;
      } else {
        const variant = variantsFor(this.platform, this.arch)[0];
        const asset = variant ? pickAsset(release.assets, this.platform, this.arch, variant) : null;
        chosen = asset ?? pickAsset(release.assets, this.platform, this.arch, "cpu");
      }
      if (!chosen)
        throw new LocalAiError(
          `Aura could not tell which build of llama.cpp ${release.tag} is for ${this.platform}/${this.arch}. Choose one from the list.`,
        );
      if (!chosen.sha256)
        throw new LocalAiError(
          "GitHub states no checksum for this download, so it cannot be verified",
        );
      binary = {
        tag: release.tag,
        asset: chosen.name,
        url: chosen.url,
        size: chosen.size,
        sha256: chosen.sha256,
      };
    }
    let file: ModelFile | null = null;
    let chosen: string | null = null;
    if (model) {
      file = await resolveModel(model.repo, model.quant, this.fetchFn);
      chosen = file.file;
      if (this.modelPath(file.file)) file = null;
    }
    const free = this.freeBytes();
    const plan: LocalPlan = {
      binary,
      model: file && {
        repo: file.repo,
        file: file.file,
        url: file.url,
        size: file.size,
        sha256: file.sha256,
      },
      freeBytes: free,
    };
    const need = (binary?.size ?? 0) * 3 + (file?.size ?? 0);
    if (free !== null && need > free)
      throw new LocalAiError("There is not enough free disk space for this");
    for (const [key, p] of this.plans) if (Date.now() - p.at > 10 * 60_000) this.plans.delete(key);
    const id = Bun.randomUUIDv7();
    this.plans.set(id, { plan, model: file, file: chosen, at: Date.now() });
    return { id, plan };
  }

  private freeBytes(): number | null {
    try {
      mkdirSync(this.root, { recursive: true });
      const s = statfsSync(this.root);
      return Number(s.bavail) * Number(s.bsize);
    } catch {
      return null;
    }
  }

  /** The program archives of the latest release, and the one Aura would pick for this system. */
  async builds(): Promise<{ tag: string; suggested: string | null; builds: Build[] }> {
    const release = await this.latest();
    const variant = variantsFor(this.platform, this.arch)[0];
    const suggested =
      (variant && pickAsset(release.assets, this.platform, this.arch, variant)) ||
      pickAsset(release.assets, this.platform, this.arch, "cpu");
    return {
      tag: release.tag,
      suggested: suggested?.name ?? null,
      builds: listBuilds(release.assets),
    };
  }

  /** Runs an approved plan in the background; progress is in `status().job`. */
  install(planId: string): void {
    const entry = this.plans.get(planId);
    if (!entry) throw new LocalAiError("That plan has expired: look at it again");
    if (this.job.phase === "binary" || this.job.phase === "model")
      throw new LocalAiError("An installation is already running");
    this.plans.delete(planId);
    this.abort = new AbortController();
    void this.run(entry.plan, entry.model, entry.file).catch((error: unknown) => {
      log.warn("local ai install failed", { error: errorMessage(error) });
      this.setJob("error", "", 0, 0, errorMessage(error));
    });
  }

  cancel(): void {
    this.abort?.abort();
  }

  private async run(
    plan: LocalPlan,
    model: ModelFile | null,
    chosen: string | null,
  ): Promise<void> {
    const signal = this.abort?.signal;
    if (plan.binary) await this.installBinary(plan.binary, signal);
    if (plan.model && model) {
      mkdirSync(this.modelDir, { recursive: true });
      this.setJob("model", model.file, 0, model.size);
      await downloadFile({
        url: model.url,
        dest: join(this.modelDir, model.file),
        sha256: model.sha256,
        size: model.size,
        fetch: this.fetchFn,
        signal,
        onProgress: (done, total) => this.setJob("model", model.file, done, total),
      });
    }
    // Finishing waits for the engine to take the model, so "done" means ready to use.
    await this.deps.onInstalled?.(chosen);
    this.setJob("done", "");
  }

  private async installBinary(binary: NonNullable<LocalPlan["binary"]>, signal?: AbortSignal) {
    const release = this.release;
    const tried: string[] = [];
    const candidates: ReleaseAsset[] = [];
    for (const variant of variantsFor(this.platform, this.arch)) {
      const asset = release && pickAsset(release.assets, this.platform, this.arch, variant);
      if (asset) candidates.push(asset);
    }
    // The approved asset is the first; later ones are the same release's CPU fallback.
    const approved = candidates.find((a) => a.url === binary.url);
    const order = approved ? [approved, ...candidates.filter((a) => a !== approved)] : candidates;
    for (const asset of order) {
      if (!asset.sha256) continue;
      const variant = /vulkan/i.test(asset.name)
        ? "vulkan"
        : this.platform === "darwin"
          ? "metal"
          : "cpu";
      mkdirSync(this.root, { recursive: true });
      const archive = join(this.root, asset.name);
      this.setJob("binary", asset.name, 0, asset.size);
      try {
        await downloadFile({
          url: asset.url,
          dest: archive,
          sha256: asset.sha256,
          size: asset.size,
          fetch: this.fetchFn,
          signal,
          onProgress: (done, total) => this.setJob("binary", asset.name, done, total),
        });
        const dir = join(this.binDir, `${binary.tag}-${variant}`);
        rmSync(dir, { recursive: true, force: true });
        await extractArchive(archive, dir);
        const exe = findServer(dir, this.platform === "win32");
        if (!exe) throw new LocalAiError("The download has no llama-server program");
        if (!(await this.runsHere(exe)))
          throw new LocalAiError(`The ${variant} build does not run on this computer`);
        writeFileSync(
          join(this.root, "installed.json"),
          `${JSON.stringify({ tag: binary.tag, variant, exe: exe.slice(this.binDir.length + 1) })}\n`,
        );
        return;
      } catch (error) {
        tried.push(`${variant}: ${errorMessage(error)}`);
        if (signal?.aborted) throw new LocalAiError("Stopped");
      } finally {
        rmSync(archive, { force: true });
      }
    }
    throw new LocalAiError(`llama.cpp could not be installed (${tried.join("; ")})`);
  }

  /** Whether the program starts at all (a GPU build needs its driver); asked once after install. */
  private async runsHere(exe: string): Promise<boolean> {
    if (this.deps.spawn) return true;
    try {
      const proc = Bun.spawn([exe, "--version"], {
        cwd: join(exe, ".."),
        stdout: "ignore",
        stderr: "ignore",
      });
      const timer = setTimeout(() => proc.kill(), 15_000);
      const code = await proc.exited;
      clearTimeout(timer);
      return code === 0;
    } catch {
      return false;
    }
  }

  removeModel(file: string): void {
    if (this.server?.model === file) this.stop();
    const path = this.modelPath(file);
    if (path) rmSync(path, { force: true });
    this.deps.onChange?.();
  }

  uninstall(): void {
    this.stop();
    rmSync(this.root, { recursive: true, force: true });
    this.setJob("idle", "");
  }

  // The server.

  /** Where the running server listens and the key it wants, or null while it is stopped. */
  endpoint(): { baseUrl: string; key: string } | null {
    return this.server
      ? { baseUrl: `http://127.0.0.1:${this.server.port}/v1`, key: this.server.key }
      : null;
  }

  /** Starts `llama-server` on the model if it is not already running on it. */
  async ensureRunning(file: string): Promise<void> {
    if (this.server?.model === file) {
      this.touch();
      return;
    }
    this.starting ??= this.start(file).finally(() => {
      this.starting = null;
    });
    await this.starting;
  }

  private touch(): void {
    if (!this.server) return;
    clearTimeout(this.server.timer);
    this.server.timer = setTimeout(() => this.stop(), IDLE_STOP_MS);
    this.server.timer.unref?.();
  }

  private async start(file: string): Promise<void> {
    const have = this.installed();
    if (!have) throw new LocalAiError("Install llama.cpp first");
    const model = this.modelPath(file);
    if (!model) throw new LocalAiError(`The model ${file} is not downloaded`);
    this.stop();
    const port = await freePort();
    const key = Bun.randomUUIDv7();
    const exe = join(this.binDir, have.exe);
    const cmd = [
      exe,
      "-m",
      model,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--jinja",
      "-c",
      "16384",
      "-ngl",
      "999",
      "--api-key",
      key,
    ];
    this.setJob("starting", file);
    const proc = (this.deps.spawn ?? realSpawn)(cmd, join(exe, ".."));
    const ready = await this.waitReady(port, key, proc);
    if (!ready) {
      proc.kill();
      const why = proc.tail().trim().split("\n").slice(-3).join(" ");
      this.setJob("error", "", 0, 0, `The model did not start. ${why}`.trim());
      throw new LocalAiError(`The model did not start. ${why}`.trim());
    }
    const timer = setTimeout(() => this.stop(), IDLE_STOP_MS);
    timer.unref?.();
    this.server = { proc, port, key, model: file, timer };
    void proc.exited.then(() => {
      if (this.server?.proc === proc) {
        clearTimeout(this.server.timer);
        this.server = null;
        this.deps.onChange?.();
      }
    });
    this.setJob("done", "");
  }

  private async waitReady(port: number, key: string, proc: ServerProcess): Promise<boolean> {
    let exited = false;
    void proc.exited.then(() => {
      exited = true;
    });
    const until = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < until && !exited) {
      try {
        const res = await this.fetchFn(`http://127.0.0.1:${port}/health`, {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return true;
      } catch {
        // Still loading the model.
      }
      await Bun.sleep(this.deps.spawn ? 5 : 700);
    }
    return false;
  }

  stop(): void {
    if (!this.server) return;
    clearTimeout(this.server.timer);
    this.server.proc.kill();
    this.server = null;
    this.deps.onChange?.();
  }
}

async function freePort(): Promise<number> {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = probe.port;
  probe.stop(true);
  return port;
}
