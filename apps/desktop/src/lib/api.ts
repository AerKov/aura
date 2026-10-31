import type { App } from "@aura/server";
import { WS_PATH } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { isNoResponse, type ServerStatus, untilServerAnswers } from "./server-wait";

/** Base URL of the aura server on this computer (an env override for development). */
export const SERVER_URL: string = import.meta.env.VITE_AURA_SERVER_URL ?? "http://127.0.0.1:4517";

let token: string | null = null;
let pending: Promise<string> | null = null;

/** Typed API client. Types come from the server through Eden Treaty; never hand-write them. */
export const api = treaty<App>(SERVER_URL, {
  // The protocol uses ISO strings for dates; keep them as strings.
  parseDate: false,
  headers: (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {}),
});

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** How long the window waits for the local server to answer at startup. */
const SERVER_WAIT_MS = 30_000;

/** The desktop shell's view of the server it started; null outside the desktop shell. */
export async function serverStatus(): Promise<ServerStatus | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<ServerStatus>("server_status");
  } catch (error) {
    console.warn("server_status failed", error);
    return null;
  }
}

/** Gets (or reuses) the session token. See docs/decisions/0003-local-session.md. */
export function ensureSession(): Promise<string> {
  if (token) return Promise.resolve(token);
  pending ??= (async () => {
    try {
      const data = await untilServerAnswers(
        async (notYet) => {
          const { data, error } = await api.session.local.post();
          if (!error) return data;
          if (isNoResponse(error)) return notYet;
          throw new ApiError(
            error.status,
            `The server refused a local session: ${errorText(error.value)}`,
          );
        },
        { timeoutMs: SERVER_WAIT_MS, status: serverStatus },
      );
      token = data.token;
      return data.token;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

type EdenResult<T> =
  | { data: T; error: null }
  | { data: null; error: { status: number; value: unknown } };

/**
 * Runs an Eden call with a session, renewing a local session once on 401 (e.g. after a server
 * restart), and unwraps the data or throws an ApiError.
 */
export async function call<T>(fn: () => Promise<EdenResult<T>>): Promise<T> {
  await ensureSession();
  let result = await fn();
  if (result.error?.status === 401) {
    token = null;
    await ensureSession();
    result = await fn();
  }
  if (result.error) throw new ApiError(result.error.status, errorText(result.error.value));
  return result.data as T;
}

/** A raw request with the session (file bytes): renews a local session once on 401, like `call`. */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = async () => {
    const session = await ensureSession();
    return fetch(`${SERVER_URL}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${session}` },
    });
  };
  let res = await send();
  if (res.status === 401) {
    token = null;
    res = await send();
  }
  if (!res.ok) throw new ApiError(res.status, `The server answered ${res.status}`);
  return res;
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "error" in value) return String(value.error);
  return "Request failed";
}

export async function wsUrl(): Promise<string> {
  const current = await ensureSession();
  return `${SERVER_URL.replace(/^http/, "ws")}${WS_PATH}?token=${encodeURIComponent(current)}`;
}

/** Drops the cached token so the next call requests a fresh session. */
export function resetSession(): void {
  token = null;
}
