# Phone

Your phone connects to the Aura running on your computer. Nothing runs on the phone itself, and no
cloud is involved.

## Pair a phone

1. Start Aura with `AURA_REMOTE=1` so it listens on your local network (by default it only listens
   on your computer).
2. Open **Phone** (phone icon) and press **Pair a device**. You get a one-time code (valid 5
   minutes) and the address to open, like `http://192.168.1.20:4517/app/`.
3. Open that address on the phone, enter the code and a name for the device.
4. Optional: **Add to Home Screen** to use it like an app, and **Enable notifications**.

The phone gets its own token; revoke it on the Devices screen at any time.

## Notifications

You get notified when an approval waits for you, a critical alert arrives, or the orchestrator
finishes a reply. On a phone, notifications use Web Push and need the page to be served over HTTPS
(for example through a tunnel), which is how browsers allow push.

## Outside your home network

Use a private network such as Tailscale or WireGuard rather than exposing Aura to the internet.
