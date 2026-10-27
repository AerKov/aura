import { api, call, IS_REMOTE } from "@/lib/api";

/** Shows a system notification for an event while the app is in the background. */
export function showNotification(n: { title: string; body: string; tag: string }): void {
  if (
    !document.hidden ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return;
  try {
    new Notification(n.title, { body: n.body, tag: n.tag });
  } catch {
    // Some webviews only allow notifications from a service worker; push covers those.
  }
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Asks for notification permission; on paired web clients also subscribes to Web Push so the phone
 * is notified when the app is closed.
 */
export async function enableNotifications(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  if (!IS_REMOTE || !("serviceWorker" in navigator) || !("PushManager" in window)) return "granted";

  const { pushPublicKey } = await call(() => api.devices.me.get());
  if (!pushPublicKey) return "granted";
  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(pushPublicKey),
    }));
  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await call(() => api.devices.me.push.put({ subscription: json }));
  return "granted";
}
