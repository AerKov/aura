import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Message, previewText, type ServerEvent } from "@aura/shared";
import webpush from "web-push";
import { errorMessage, log } from "../../lib/log";
import type { EventHub } from "../realtime/hub";
import type { DeviceService, PushSubscription } from "./service";

export interface Notification {
  title: string;
  body: string;
  chatId: string;
  /** Collapses repeats on the device (one notification per key). */
  tag: string;
}

/** Decides whether a chat event deserves the user's attention when they are away. */
export function notificationFor(
  event: ServerEvent,
  chatKind: (chatId: string) => string | undefined,
): Notification | null {
  if (event.type !== "message.created" && event.type !== "message.updated") return null;
  const m: Message = event.message;
  const card = m.card;
  if (event.type === "message.created" && card?.type === "approval" && card.status === "pending") {
    return {
      title: "Approval needed",
      body: card.title,
      chatId: m.chatId,
      tag: `approval:${card.approvalId}`,
    };
  }
  if (event.type === "message.created" && card?.type === "alert" && card.severity === "critical") {
    return {
      title: `Critical alert · ${card.source}`,
      body: card.title,
      chatId: m.chatId,
      tag: `alert:${m.id}`,
    };
  }
  // A finished orchestrator reply in the direct chat (streamed messages become final by an update).
  if (
    event.type === "message.updated" &&
    m.status === "final" &&
    m.author.kind === "agent" &&
    m.kind === "text" &&
    m.body &&
    chatKind(m.chatId) === "direct"
  ) {
    return {
      title: "Orchestrator",
      body: previewText(m.body, 140),
      chatId: m.chatId,
      tag: `reply:${m.id}`,
    };
  }
  return null;
}

export interface PushSender {
  send(subscription: PushSubscription, payload: string): Promise<void>;
}

export class PushGoneError extends Error {
  override name = "PushGoneError";
}

/** Web Push with VAPID keys kept in the local state dir. */
export class WebPushSender implements PushSender {
  readonly publicKey: string;

  constructor(dataDir: string, subject = "mailto:aura@localhost") {
    const file = join(dataDir, "state", "vapid.json");
    let keys: { publicKey: string; privateKey: string };
    if (existsSync(file)) {
      keys = JSON.parse(readFileSync(file, "utf8"));
    } else {
      keys = webpush.generateVAPIDKeys();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
    }
    this.publicKey = keys.publicKey;
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  }

  async send(subscription: PushSubscription, payload: string): Promise<void> {
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 3600 });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) throw new PushGoneError("subscription expired");
      throw error;
    }
  }
}

/**
 * Turns chat events into notifications: a `notification` event for open clients (shown when the
 * window is hidden) and Web Push to paired devices that subscribed (ADR 0009).
 */
export class NotificationService {
  private readonly sent = new Set<string>();

  constructor(
    private readonly deps: {
      hub: EventHub;
      devices: DeviceService;
      sender: PushSender | null;
      chatKind: (chatId: string) => string | undefined;
    },
  ) {}

  start(): () => void {
    return this.deps.hub.subscribe((event) => {
      const notification = notificationFor(event, this.deps.chatKind);
      if (!notification || this.sent.has(notification.tag)) return;
      this.sent.add(notification.tag);
      if (this.sent.size > 5000) this.sent.clear();
      this.deps.hub.publish({ type: "notification", ...notification });
      void this.push(notification);
    });
  }

  private async push(notification: Notification): Promise<void> {
    const sender = this.deps.sender;
    if (!sender) return;
    const payload = JSON.stringify(notification);
    for (const target of await this.deps.devices.pushTargets()) {
      try {
        await sender.send(target.subscription, payload);
      } catch (error) {
        if (error instanceof PushGoneError) {
          await this.deps.devices.setPush(target.id, null);
        } else {
          log.warn("push failed", { device: target.id, error: errorMessage(error) });
        }
      }
    }
  }
}
