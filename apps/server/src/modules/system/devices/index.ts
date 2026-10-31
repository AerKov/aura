import { existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { type DeviceService, PairingError } from "./service";

export interface DevicesDeps {
  sessions: LocalSessions;
  devices: DeviceService;
  pushPublicKey: string | null;
  /** Built web client (Vite `dist-web`), served at /app for phones and other browsers. */
  webDir: string | null;
  lanUrls: string[];
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const WEB_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'";

/** Serves the built web client; unknown paths fall back to index.html (client-side routing). */
function webResponse(webDir: string | null, path: string | undefined): Response {
  if (!webDir)
    return new Response("The web client is not built (bun run build:web)", { status: 404 });
  const root = resolve(webDir);
  let file = resolve(join(root, normalize(path || "index.html")));
  // Inside the folder itself, not a sibling whose name starts the same (dist-web-old).
  if (!file.startsWith(root + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html");
  }
  const headers: Record<string, string> = {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
  };
  if (file.endsWith("index.html")) headers["content-security-policy"] = WEB_CSP;
  if (file.endsWith("sw.js")) headers["service-worker-allowed"] = "/app/";
  return new Response(Bun.file(file), { headers });
}

/** Paired devices (ADR 0009): pairing, device list, Web Push subscriptions, and the web client. */
export const devicesModule = (deps: DevicesDeps) =>
  new Elysia({ name: "devices" })
    .post(
      "/devices/pair",
      async ({ body, status }) => {
        try {
          return await deps.devices.pair(body.code, body.name);
        } catch (error) {
          if (error instanceof PairingError) return status(401, { error: error.message });
          throw error;
        }
      },
      { body: t.Object({ code: t.String({ maxLength: 20 }), name: t.String({ maxLength: 60 }) }) },
    )
    .get("/app", ({ request, redirect }) =>
      // `/app` and `/app/` reach the same route; relative asset URLs need the trailing slash.
      new URL(request.url).pathname === "/app"
        ? redirect("/app/")
        : webResponse(deps.webDir, "index.html"),
    )
    .get("/app/*", ({ params }) => webResponse(deps.webDir, params["*"]))
    .use(authGuard(deps.sessions))
    .post(
      "/devices/pairing",
      ({ user, status }) => {
        // Only the desktop itself (a local session) can start pairing a new device.
        if (user.deviceId) return status(403, { error: "Pair new devices from the desktop" });
        return { ...deps.devices.startPairing(), urls: deps.lanUrls };
      },
      { auth: true },
    )
    .get("/devices", () => deps.devices.list(), { auth: true })
    .delete(
      "/devices/:deviceId",
      async ({ params }) => {
        await deps.devices.revoke(params.deviceId);
        return { revoked: true };
      },
      { auth: true },
    )
    .get(
      "/devices/me",
      ({ user }) => ({ deviceId: user.deviceId ?? null, pushPublicKey: deps.pushPublicKey }),
      {
        auth: true,
      },
    )
    .put(
      "/devices/me/push",
      async ({ user, body, status }) => {
        if (!user.deviceId) return status(400, { error: "Only paired devices use Web Push" });
        await deps.devices.setPush(user.deviceId, body.subscription);
        return { ok: true };
      },
      {
        auth: true,
        body: t.Object({
          subscription: t.Nullable(
            t.Object({
              endpoint: t.String({ maxLength: 2000, pattern: "^https://" }),
              keys: t.Object({
                p256dh: t.String({ maxLength: 200 }),
                auth: t.String({ maxLength: 100 }),
              }),
            }),
          ),
        }),
      },
    );
