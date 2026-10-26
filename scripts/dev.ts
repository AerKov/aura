/**
 * `bun run dev`: starts the server (watch mode, dev data in `.crew-dev/`) and the Tauri desktop app.
 * Stops both when either exits or on Ctrl+C.
 *
 * Each child runs in its own process group so the whole tree (bun --watch, vite, cargo, the app
 * window) can be stopped at once; killing only the direct child would leave orphans.
 */
import type { Subprocess } from "bun";

const root = new URL("..", import.meta.url).pathname;
const isWindows = process.platform === "win32";

function start(cmd: string[], cwd: string): Subprocess {
  return Bun.spawn(cmd, {
    cwd: `${root}${cwd}`,
    stdout: "inherit",
    stderr: "inherit",
    detached: !isWindows,
  });
}

const procs = [
  start(["bun", "run", "dev"], "apps/server"),
  start(["bun", "run", "tauri", "dev"], "apps/desktop"),
];

function killTree(proc: Subprocess): void {
  if (proc.exitCode !== null && isWindows) return;
  try {
    if (isWindows) proc.kill();
    else process.kill(-proc.pid, "SIGTERM");
  } catch (error) {
    // ESRCH: the group is already gone.
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      console.error(`failed to stop pid ${proc.pid}:`, error);
    }
  }
}

let stopping = false;
function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const proc of procs) killTree(proc);
  process.exit(code);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

const exitCode = await Promise.race(procs.map((proc) => proc.exited));
stopAll(exitCode);
