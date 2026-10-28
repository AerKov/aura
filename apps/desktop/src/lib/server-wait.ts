/**
 * Waiting for the local server. The desktop shell starts the server as a sidecar together with the
 * window, and its first start after an install can take seconds (an antivirus scanning the new
 * binary), so the first requests must wait for it rather than fail.
 */

/** What the desktop shell knows about the server it started (Tauri command `server_status`). */
export interface ServerStatus {
  started: boolean;
  /** Why it is not running: it could not start, or it exited (code, signal). */
  stopped: string | null;
  /** Its last output lines. */
  lines: string[];
}

/** The server does not answer at all (not running yet, crashed, or another address). */
export class ServerUnreachableError extends Error {
  override name = "ServerUnreachableError";
  constructor(
    message: string,
    readonly status: ServerStatus | null = null,
  ) {
    super(message);
  }
}

/** Eden reports a request that got no response as status 503 with the fetch error as its value. */
export function isNoResponse(error: { status: number; value: unknown }): boolean {
  return error.status === 503 && error.value instanceof Error;
}

export interface WaitOptions {
  /** How long to keep trying, in ms. */
  timeoutMs: number;
  /** The shell's view of the server, when there is a shell; stops waiting once it has exited. */
  status?: () => Promise<ServerStatus | null>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const NOT_YET = Symbol("not yet");

/**
 * Runs `attempt` until it gets a response: `attempt` returns NOT_YET (via `notYet`) while the server
 * does not answer. Gives up with ServerUnreachableError after the timeout or when the server exited.
 */
export async function untilServerAnswers<T>(
  attempt: (notYet: typeof NOT_YET) => Promise<T | typeof NOT_YET>,
  options: WaitOptions,
): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + options.timeoutMs;
  let delay = 200;
  for (;;) {
    const result = await attempt(NOT_YET);
    if (result !== NOT_YET) return result as T;
    const status = (await options.status?.()) ?? null;
    if (status?.stopped)
      throw new ServerUnreachableError(`The server stopped (${status.stopped})`, status);
    if (now() >= deadline) throw new ServerUnreachableError("The server does not answer", status);
    await sleep(delay);
    delay = Math.min(delay * 2, 1000);
  }
}
