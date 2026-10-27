/// <reference path="./vendor-files.d.ts" />
import { chmodSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import seccompArm64 from "@anthropic-ai/sandbox-runtime/vendor/seccomp/arm64/apply-seccomp" with {
  type: "file",
};
import seccompX64 from "@anthropic-ai/sandbox-runtime/vendor/seccomp/x64/apply-seccomp" with {
  type: "file",
};
import type { SandboxPolicy } from "./types";

export class SandboxUnavailableError extends Error {
  override name = "SandboxUnavailableError";
}

/** Whether this machine can run the OS sandbox (macOS, or Linux with bubblewrap and socat). */
export function sandboxSupport(): { ok: true } | { ok: false; reason: string } {
  if (process.platform === "win32") {
    return { ok: false, reason: "The command sandbox is not available on Windows yet." };
  }
  if (!SandboxManager.isSupportedPlatform()) {
    return { ok: false, reason: "This system does not support the command sandbox." };
  }
  const deps = SandboxManager.checkDependencies();
  if (deps.errors.length > 0) {
    return {
      ok: false,
      reason: `Missing: ${deps.errors.join(", ")}. On Linux install bubblewrap and socat (e.g. \`sudo apt install bubblewrap socat\`).`,
    };
  }
  return { ok: true };
}

/**
 * Linux: the `apply-seccomp` helper that stops sandboxed commands from creating namespaces or
 * unrestricted Unix sockets. Inside the compiled sidecar it is embedded in the executable, so it is
 * written out once to the temp folder; in development the package's own file is used.
 */
async function seccompHelper(): Promise<string | undefined> {
  if (process.platform !== "linux") return undefined;
  const embedded =
    process.arch === "arm64" ? seccompArm64 : process.arch === "x64" ? seccompX64 : null;
  if (!embedded) return undefined;
  if (!embedded.startsWith("/$bunfs") && !embedded.includes("~BUN")) return embedded;
  const file = Bun.file(embedded);
  const out = join(tmpdir(), `aura-apply-seccomp-${process.arch}-${file.size}`);
  if (!existsSync(out) || statSync(out).size !== file.size) {
    await Bun.write(out, file);
    chmodSync(out, 0o755);
  }
  return out;
}

let started: { key: string; ready: Promise<void> } | null = null;

/** The sandbox runtime is process-wide; it is (re)started when the network allowlist changes. */
async function ensureStarted(policy: SandboxPolicy): Promise<void> {
  const key = JSON.stringify(policy.allowedDomains);
  if (started?.key === key) return started.ready;
  const previous = started;
  const ready = (async () => {
    if (previous) {
      await previous.ready.catch(() => {});
      await SandboxManager.reset();
    }
    const applyPath = await seccompHelper();
    await SandboxManager.initialize({
      network: { allowedDomains: policy.allowedDomains, deniedDomains: [] },
      filesystem: { denyRead: policy.denyRead, allowWrite: [], denyWrite: [] },
      ...(applyPath ? { seccomp: { applyPath } } : {}),
    });
  })();
  started = { key, ready };
  try {
    await ready;
  } catch (error) {
    if (started?.ready === ready) started = null;
    throw error;
  }
}

/**
 * The argv and environment that run `command` with bash in the sandbox: it may write only in `cwd`
 * (and the temp folder), not read `denyRead`, and reach only the allowed hosts.
 */
export async function sandboxedShell(
  policy: SandboxPolicy,
  command: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<{ argv: string[]; env: Record<string, string> }> {
  const support = sandboxSupport();
  if (!support.ok) throw new SandboxUnavailableError(support.reason);
  await ensureStarted(policy);
  const { argv, env } = await SandboxManager.wrapWithSandboxArgv(
    command,
    "bash",
    { filesystem: { denyRead: policy.denyRead, allowWrite: [cwd, tmpdir()], denyWrite: [] } },
    signal,
    cwd,
    { commandId: Bun.randomUUIDv7(), commandText: command },
  );
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === "string") clean[k] = v;
  return { argv, env: clean };
}
