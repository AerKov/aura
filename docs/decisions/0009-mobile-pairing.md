# 0009: Mobile thin client, device pairing and notifications

- Status: accepted (changes the auth choice in CLAUDE.md; see "Better Auth")
- Date: 2026-10-27
- Phase: 7

## Thin client

- The server can serve the web build of the app at `/app/` (`bun run build:web`, Vite `base=/app/`). A
  phone opens it from the desktop over the LAN (`AURA_REMOTE=1` makes the server listen on the network
  and lists the LAN URLs). It is a PWA (manifest + service worker). The same React code runs in the
  Tauri desktop window, the browser and, later, Tauri mobile.
- Remote clients (`/app` or `TAURI_ENV_PLATFORM` android/ios) never use the local session; they pair.
- Narrow screens show one pane at a time (chat list or content) with a back button.
- Tauri mobile builds (`tauri android init`, `tauri ios init`) need the Android SDK / Xcode, which the
  development container does not have; the client is ready for it (configurable server URL, pairing,
  no sidecar on mobile), but the native build is **not verified yet**.

## Pairing instead of Better Auth

ADR 0003 deferred Better Auth to this phase. For this product (one owner per install, a phone that
connects to that owner's own desktop) a login with passwords or OAuth adds friction without adding
security, and Better Auth has no SurrealDB adapter (we would write and maintain one). So:

- The desktop (local session only) starts pairing: a one-time 8-character code, valid 5 minutes,
  cancelled after 5 wrong attempts.
- `POST /devices/pair {code, name}` returns a 256-bit device token, shown once; only its SHA-256 is
  stored. Every API call and the WebSocket accept it. Devices are listed and revoked on the Devices
  screen; a revoked token stops working at once.
- Remote mode relaxes the loopback-Host check (all non-public routes need a token anyway), but
  `/session/local` still requires a loopback peer and an allowed Origin.

If multi-user or internet-facing access arrives, revisit Better Auth then.

## Notifications

- The server derives notifications from chat events: an approval waiting for the user, a critical
  alert, a finished orchestrator reply in the direct chat. Open clients get a `notification` event
  and show it with the Notification API when the window is hidden.
- Paired web clients can subscribe to **Web Push** (VAPID keys in `state/vapid.json`, `web-push`
  library). The service worker shows the notification only when no app window is visible. Expired
  subscriptions are dropped. Browser push services are the "relay" the spec asked about; native
  mobile push (FCM/APNs) needs a relay service and is future work.

## Hardening found while testing

- Parallel requests from a freshly opened phone conflicted on `device.last_seen_at`; it is now written
  at most once a minute and failures are ignored. The shared `chat.last_message_at` write retries
  SurrealDB transaction conflicts.
