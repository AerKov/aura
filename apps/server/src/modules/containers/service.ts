import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import { errorMessage, log } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { ContainerSettings } from "../sandbox/settings";
import { type CliRunner, detectRuntime, errorLine, type RuntimeStatus } from "./cli";

/** What the service needs to know about a project. */
export interface ContainerProject {
  id: string;
  workspace: string;
}

export type ContainerState = "missing" | "running" | "stopped";

export interface ContainerStatus {
  state: ContainerState;
  name: string;
  image: string | null;
  /** The container was made with other settings and is recreated on the next command. */
  outdated: boolean;
}

export class ContainerError extends Error {
  override name = "ContainerError";
}

const MAX_OUTPUT = 30_000;
const STATUS_TTL_MS = 30_000;
/** First use may download the image. */
const CREATE_TIMEOUT_MS = 15 * 60_000;
const IDLE_MS = 30 * 60_000;
/** Mount point of the project folder in its container. */
export const WORKSPACE = "/workspace";

/**
 * Picks bash when the image has it, and wraps the command in `timeout` so it is stopped inside the
 * container (killing the CLI client would leave it running). $0 is a marker used to stop it early.
 */
const WRAPPER =
  'sh=sh; command -v bash >/dev/null 2>&1 && sh=bash; if command -v timeout >/dev/null 2>&1; then exec timeout -s KILL "$2" "$sh" -c "$1" "$0"; else exec "$sh" -c "$1" "$0"; fi';

/**
 * Stops a command by its marker: every process carrying it (the shell and `timeout`, whichever is
 * the parent: GNU and BusyBox differ) and their process groups, which hold the command's children.
 */
const KILLER =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not JS
  'for p in /proc/[0-9]*; do n=${p#/proc/}; [ "$n" = "$$" ] && continue; c=$(tr "\\000" " " < "$p/cmdline" 2>/dev/null); case "$c" in *"$1"*) kill -KILL -- "-$n" 2>/dev/null; kill -KILL "$n" 2>/dev/null;; esac; done; true';

function clip(text: string): string {
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT / 2)}\n… (${text.length - MAX_OUTPUT} characters cut) …\n${text.slice(-MAX_OUTPUT / 2)}`
    : text;
}

/**
 * Sandbox level 2 (ADR 0018): one long-lived container per project. Only the project folder is
 * mounted, so commands cannot see the user's home, credentials or other projects. Containers are
 * created on the first command, stopped when idle and recreated when their settings change.
 */
export class ContainerService {
  private detected: { at: number; status: RuntimeStatus; run: CliRunner | null } | null = null;
  private readonly creating = new Map<string, Promise<void>>();
  private readonly busy = new Map<string, number>();
  private readonly lastUsed = new Map<string, number>();
  private readonly dataKey: string;

  constructor(
    private readonly deps: {
      dataDir: string;
      settings: () => ContainerSettings;
      /** Replaced in tests. */
      detect?: () => Promise<{ status: RuntimeStatus; run: CliRunner | null }>;
      /** User and group the commands run as, so files keep the user's ownership. */
      user?: string | null;
    },
  ) {
    // Two data folders (e.g. dev and the installed app) never share containers.
    this.dataKey = createHash("sha256").update(deps.dataDir).digest("hex").slice(0, 8);
  }

  private async runtime(): Promise<{ status: RuntimeStatus; run: CliRunner | null }> {
    if (this.detected && Date.now() - this.detected.at < STATUS_TTL_MS) return this.detected;
    const found = await (this.deps.detect ?? (() => detectRuntime()))();
    this.detected = { at: Date.now(), ...found };
    return found;
  }

  async runtimeStatus(): Promise<RuntimeStatus> {
    this.detected = null;
    return (await this.runtime()).status;
  }

  private async cli(): Promise<CliRunner> {
    const { status, run } = await this.runtime();
    if (!status.ok || !run)
      throw new ContainerError(status.ok ? "No container runtime" : status.reason);
    return run;
  }

  nameOf(projectId: string): string {
    return `aura-${this.dataKey}-${projectId}`;
  }

  /** Settings that require a new container when they change. */
  private configKey(project: ContainerProject, s: ContainerSettings): string {
    return createHash("sha256")
      .update(
        JSON.stringify([s.image, s.network, s.memoryMb, s.cpus, project.workspace, this.user()]),
      )
      .digest("hex")
      .slice(0, 16);
  }

  private user(): string | null {
    if (this.deps.user !== undefined) return this.deps.user;
    return typeof process.getuid === "function" && typeof process.getgid === "function"
      ? `${process.getuid()}:${process.getgid()}`
      : null;
  }

  private async inspect(
    run: CliRunner,
    name: string,
  ): Promise<{ running: boolean; config: string; image: string } | null> {
    const res = await run(
      [
        "inspect",
        "--type",
        "container",
        "--format",
        '{{.State.Running}}|{{index .Config.Labels "aura.config"}}|{{.Config.Image}}',
        name,
      ],
      { timeoutMs: 15_000 },
    );
    if (res.code !== 0) return null;
    const [running = "", config = "", image = ""] = res.stdout.trim().split("|");
    return { running: running === "true", config, image };
  }

  async status(project: ContainerProject): Promise<ContainerStatus> {
    const name = this.nameOf(project.id);
    const run = await this.cli();
    const found = await this.inspect(run, name);
    if (!found) return { state: "missing", name, image: null, outdated: false };
    return {
      state: found.running ? "running" : "stopped",
      name,
      image: found.image,
      outdated: found.config !== this.configKey(project, this.deps.settings()),
    };
  }

  /** The project's container, running and up to date with the settings. */
  async ensure(project: ContainerProject): Promise<string> {
    const pending = this.creating.get(project.id);
    if (pending) await pending;
    const work = this.prepare(project);
    this.creating.set(project.id, work);
    try {
      await work;
    } finally {
      if (this.creating.get(project.id) === work) this.creating.delete(project.id);
    }
    return this.nameOf(project.id);
  }

  private async prepare(project: ContainerProject): Promise<void> {
    const run = await this.cli();
    const name = this.nameOf(project.id);
    const settings = this.deps.settings();
    const config = this.configKey(project, settings);
    const found = await this.inspect(run, name);
    if (found && found.config !== config) {
      log.info("recreating project container", { project: project.id, name });
      await run(["rm", "-f", name], { timeoutMs: 60_000 });
    } else if (found?.running) {
      return;
    } else if (found) {
      const res = await run(["start", name], { timeoutMs: 60_000 });
      if (res.code === 0) return;
      log.warn("project container did not start; recreating", {
        name,
        error: errorLine(res.stderr),
      });
      await run(["rm", "-f", name], { timeoutMs: 60_000 });
    }
    mkdirSync(project.workspace, { recursive: true });
    const res = await run(
      createArgs({ name, project, settings, config, user: this.user(), dataKey: this.dataKey }),
      {
        timeoutMs: CREATE_TIMEOUT_MS,
      },
    );
    if (res.code !== 0) {
      throw new ContainerError(
        `Could not start the project container: ${errorLine(res.stderr) || `exit ${res.code}`}`,
      );
    }
    log.info("project container started", { project: project.id, name, image: settings.image });
  }

  /** Runs a shell command in the project's container, in the project folder. */
  async exec(
    project: ContainerProject,
    command: string,
    opts: { timeoutSeconds: number; signal: AbortSignal; author: string },
  ): Promise<{ text: string; isError: boolean }> {
    let name: string;
    try {
      name = await this.ensure(project);
    } catch (error) {
      return { text: errorMessage(error), isError: true };
    }
    const run = await this.cli();
    const marker = `aura-cmd-${Bun.randomUUIDv7()}`;
    this.busy.set(name, (this.busy.get(name) ?? 0) + 1);
    this.lastUsed.set(name, Date.now());
    const onAbort = () => {
      void run(["exec", name, "sh", "-c", KILLER, "aura-kill", marker], {
        timeoutMs: 10_000,
      }).catch(() => {});
    };
    opts.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await run(
        [
          "exec",
          "-w",
          WORKSPACE,
          ...gitEnv(opts.author),
          name,
          "sh",
          "-c",
          WRAPPER,
          marker,
          command,
          String(opts.timeoutSeconds),
        ],
        // A margin over the in-container timeout, in case the CLI itself hangs.
        { timeoutMs: (opts.timeoutSeconds + 30) * 1000 },
      );
      const output = clip([res.stdout.trimEnd(), res.stderr.trimEnd()].filter(Boolean).join("\n"));
      if (opts.signal.aborted) return { text: `${output}\n(stopped)`, isError: true };
      if (res.code === 137) {
        // BusyBox `timeout` kills only the shell; clear what it started too.
        onAbort();
        return {
          text: `${output}\n(killed: timed out after ${opts.timeoutSeconds}s, or out of memory)`,
          isError: true,
        };
      }
      return { text: `${output || "(no output)"}\nexit code ${res.code}`, isError: res.code !== 0 };
    } finally {
      opts.signal.removeEventListener("abort", onAbort);
      this.busy.set(name, (this.busy.get(name) ?? 1) - 1);
      this.lastUsed.set(name, Date.now());
    }
  }

  /** Removes the project's container; the project folder stays. */
  async remove(projectId: string): Promise<void> {
    const run = await this.cli();
    const name = this.nameOf(projectId);
    await run(["rm", "-f", name], { timeoutMs: 60_000 });
    this.lastUsed.delete(name);
  }

  /** Stops containers that ran no command for a while. */
  async stopIdle(now = Date.now()): Promise<string[]> {
    const stopped: string[] = [];
    for (const [name, at] of this.lastUsed) {
      if (now - at < IDLE_MS || (this.busy.get(name) ?? 0) > 0) continue;
      this.lastUsed.delete(name);
      try {
        const run = await this.cli();
        await run(["stop", "-t", "5", name], { timeoutMs: 60_000 });
        stopped.push(name);
      } catch (error) {
        log.warn("could not stop an idle container", { name, error: errorMessage(error) });
      }
    }
    return stopped;
  }

  startIdleReaper(): () => void {
    const timer = setInterval(() => void this.stopIdle(), 60_000);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  /** The `Bash` tool an agent gets instead of the host shell in a container project. */
  bashTool(project: ContainerProject, author: string, signal: AbortSignal): AgentTool {
    const s = this.deps.settings();
    return {
      name: "Bash",
      description: `Run a shell command in this project's Linux container (image ${s.image}; network ${s.network ? "on" : "off"}). The project folder is ${WORKSPACE} and the working directory; use paths relative to it. Use it for builds, tests and git. Keep commands non-interactive.`,
      inputSchema: {
        command: z.string().describe("the command, run with bash -c (sh when bash is missing)"),
        timeout_seconds: z.number().int().min(1).max(1800).optional(),
      },
      handler: async (input) => {
        const command = typeof input.command === "string" ? input.command : "";
        if (!command.trim()) return { text: "command is required", isError: true };
        const timeout = typeof input.timeout_seconds === "number" ? input.timeout_seconds : 300;
        return this.exec(project, command, {
          timeoutSeconds: Math.min(1800, Math.max(1, Math.round(timeout))),
          signal,
          author,
        });
      },
    };
  }
}

/** `run` arguments for a project container: only the project mounted, no added privileges. */
export function createArgs(input: {
  name: string;
  project: ContainerProject;
  settings: ContainerSettings;
  config: string;
  user: string | null;
  dataKey: string;
}): string[] {
  const { name, project, settings, config, user, dataKey } = input;
  return [
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    `aura.project=${project.id}`,
    "--label",
    `aura.data=${dataKey}`,
    "--label",
    `aura.config=${config}`,
    "--init",
    ...(user ? ["--user", user] : []),
    "--env",
    "HOME=/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "1024",
    "--memory",
    `${settings.memoryMb}m`,
    "--cpus",
    String(settings.cpus),
    ...(settings.network ? [] : ["--network", "none"]),
    "--volume",
    `${project.workspace}:${WORKSPACE}`,
    "--workdir",
    WORKSPACE,
    "--entrypoint",
    "tail",
    settings.image,
    "-f",
    "/dev/null",
  ];
}

/** Commits made inside the container carry the agent's name; the mounted repo is trusted. */
function gitEnv(author: string): string[] {
  const handle = author.replace(/[^a-z0-9_-]/gi, "") || "agent";
  return [
    "--env",
    `GIT_AUTHOR_NAME=${handle}`,
    "--env",
    `GIT_AUTHOR_EMAIL=${handle}@aura.local`,
    "--env",
    `GIT_COMMITTER_NAME=${handle}`,
    "--env",
    `GIT_COMMITTER_EMAIL=${handle}@aura.local`,
    "--env",
    "GIT_CONFIG_COUNT=1",
    "--env",
    "GIT_CONFIG_KEY_0=safe.directory",
    "--env",
    `GIT_CONFIG_VALUE_0=${WORKSPACE}`,
  ];
}

/** What an agent in a container project is told about its shell. */
export function containerNote(settings: ContainerSettings): string {
  return `

## Project container
Your Bash commands run in this project's own Linux container (${settings.image}). Only the project folder is there, at ${WORKSPACE}; nothing else from the user's computer is visible.${settings.network ? "" : " The container has no network, so installs from the internet fail; tell the user if you need it."} You cannot install system packages (no root). If a command is blocked, do not try to get around it; tell the user what you need.`;
}
