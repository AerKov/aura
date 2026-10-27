import type { App } from "@aura/server";
import { WS_PATH } from "@aura/shared";
import { treaty } from "@elysiajs/eden";

const DEVICE_KEY = "aura.device";

/**
 * Remote clients (ADR 0009): the web client served by the server at /app (phones, other browsers)
 * and Tauri mobile. They authenticate with a paired device token instead of a local session.
 */
export const IS_REMOTE: boolean =
  window.location.pathname.startsWith("/app") ||
  ["android", "ios"].includes(String(import.meta.env.TAURI_ENV_PLATFORM ?? ""));

interface StoredDevice {
  server: string;
  token: string;
}

function storedDevice(): StoredDevice | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as StoredDevice) : null;
  } catch {
    return null;
  }
}

/** Base URL of the aura server: env override, the serving origin for /app, a paired server, or local. */
export const SERVER_URL: string =
  import.meta.env.VITE_AURA_SERVER_URL ??
  (window.location.pathname.startsWith("/app")
    ? window.location.origin
    : (storedDevice()?.server ?? "http://127.0.0.1:4517"));

let token: string | null = IS_REMOTE ? (storedDevice()?.token ?? null) : null;
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

/** Thrown when a remote client has no (or a revoked) device token: show the pairing screen. */
export class NeedsPairingError extends Error {
  override name = "NeedsPairingError";
}

/** Gets (or reuses) the session token. See docs/decisions/0003-local-session.md and 0009. */
export function ensureSession(): Promise<string> {
  if (token) return Promise.resolve(token);
  if (IS_REMOTE) return Promise.reject(new NeedsPairingError("This device is not paired"));
  pending ??= (async () => {
    try {
      const { data, error } = await api.session.local.post();
      if (error) throw new ApiError(error.status, "Could not start a local session");
      token = data.token;
      return data.token;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Stores the device token after pairing (remote clients only). */
export function savePairing(server: string, deviceToken: string): void {
  localStorage.setItem(DEVICE_KEY, JSON.stringify({ server, token: deviceToken }));
}

export function forgetPairing(): void {
  localStorage.removeItem(DEVICE_KEY);
  token = null;
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
    if (IS_REMOTE) {
      // The device was revoked.
      forgetPairing();
      throw new NeedsPairingError("This device is no longer paired");
    }
    token = null;
    await ensureSession();
    result = await fn();
  }
  if (result.error) throw new ApiError(result.error.status, errorText(result.error.value));
  return result.data as T;
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
  if (!IS_REMOTE) token = null;
}
