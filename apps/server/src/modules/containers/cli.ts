import { errorMessage } from "../../lib/log";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the container CLI (docker or podman) with arguments, never through a shell. */
export type CliRunner = (
  args: string[],
  opts?: { timeoutMs?: number; signal?: AbortSignal; env?: Record<string, string> },
) => Promise<CliResult>;

export type ContainerEngine = "docker" | "podman";

export interface DetectedRuntime {
  status: RuntimeStatus;
  run: CliRunner | null;
  /** Path of the CLI, for processes that others spawn (MCP servers). */
  binary?: string;
}

/** What the container CLI needs from the server's environment, and nothing else. */
export const CLI_ENV_KEYS = ["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "XDG_RUNTIME_DIR"];

export type RuntimeStatus =
  | { ok: true; engine: ContainerEngine; version: string }
  | { ok: false; reason: string };

/** A runner for one CLI binary. The child gets a minimal environment, not the server's. */
export function spawnRunner(binary: string): CliRunner {
  return async (args, opts = {}) => {
    const env: Record<string, string> = {};
    for (const key of CLI_ENV_KEYS) {
      const value = process.env[key];
      if (value) env[key] = value;
    }
    // Values for `--env NAME` flags travel here, never in the argument list.
    Object.assign(env, opts.env ?? {});
    const proc = Bun.spawn([binary, ...args], {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const kill = () => proc.kill();
    const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : undefined;
    opts.signal?.addEventListener("abort", kill, { once: true });
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { code, stdout, stderr };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", kill);
    }
  };
}

/**
 * Finds a working container engine: `AURA_CONTAINER_CLI` if set, else docker, else podman. "Working"
 * means the daemon (or podman's runtime) answers, not only that the binary exists.
 */
export async function detectRuntime(
  runnerFor: (binary: string) => CliRunner = spawnRunner,
): Promise<DetectedRuntime> {
  const forced = process.env.AURA_CONTAINER_CLI;
  const candidates: ContainerEngine[] =
    forced === "docker" || forced === "podman" ? [forced] : ["docker", "podman"];
  const problems: string[] = [];
  for (const engine of candidates) {
    const binary = Bun.which(engine);
    if (!binary) continue;
    const run = runnerFor(binary);
    try {
      // Docker needs its daemon; Podman runs containers itself.
      const field = engine === "docker" ? "{{.Server.Version}}" : "{{.Client.Version}}";
      const res = await run(["version", "--format", field], { timeoutMs: 10_000 });
      const version = res.stdout.trim();
      if (res.code === 0 && version) return { status: { ok: true, engine, version }, run, binary };
      problems.push(`${engine} is installed but not running (${firstLine(res.stderr)})`);
    } catch (error) {
      problems.push(`${engine}: ${errorMessage(error)}`);
    }
  }
  return {
    status: {
      ok: false,
      reason:
        problems.length > 0
          ? `${problems.join("; ")}.`
          : "Neither Docker nor Podman is installed. Install Docker Desktop, or Podman, to run projects in containers.",
    },
    run: null,
  };
}

export function firstLine(text: string): string {
  return text.trim().split("\n")[0]?.slice(0, 300) ?? "";
}

/** The line of CLI output that explains a failure (Docker prints progress and hints around it). */
export function errorLine(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("Unable to find image") && !l.startsWith("Run '"));
  const line = lines.find((l) => /error/i.test(l)) ?? lines.at(-1) ?? "";
  return line.replace(/^(docker|podman|Error): /, "").slice(0, 400);
}
