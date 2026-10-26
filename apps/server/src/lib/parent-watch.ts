/** Returns true while a process with this pid exists (a zombie still counts). */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * True while `pid` is still our parent. On Unix an orphan is re-parented immediately, so the
 * `ppid` check catches a dead parent even before it is reaped; on Windows the pid check does.
 */
export function isParentAlive(pid: number): boolean {
  return process.ppid === pid && isProcessAlive(pid);
}

/**
 * Calls `onExit` once `isAlive` returns false, so the sidecar never outlives the Tauri shell,
 * even when the shell is killed without running its exit hooks.
 */
export function watchParent(
  isAlive: () => boolean,
  onExit: () => void,
  intervalMs = 1_000,
): () => void {
  const timer = setInterval(() => {
    if (!isAlive()) {
      clearInterval(timer);
      onExit();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
