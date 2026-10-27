import { type Surreal, Table } from "surrealdb";
import { errorMessage, log } from "../../lib/log";
import { rowToChat, rowToMessage } from "../chat/repo";
import type { EventHub } from "./hub";

/**
 * Bridges SurrealDB LIVE SELECT to the event hub, so every write to `message` or `chat`
 * (from any code path) reaches clients. Returns a function that stops the subscriptions.
 */
export async function startLiveBridge(db: Surreal, hub: EventHub): Promise<() => Promise<void>> {
  const messages = await db.live(new Table("message"));
  messages.subscribe((change) => {
    if (change.action !== "CREATE" && change.action !== "UPDATE") return;
    try {
      const message = rowToMessage(change.value);
      hub.publish({
        type: change.action === "CREATE" ? "message.created" : "message.updated",
        message,
      });
    } catch (error) {
      log.error("live message mapping failed", { error: errorMessage(error) });
    }
  });

  const chats = await db.live(new Table("chat"));
  chats.subscribe((change) => {
    if (change.action !== "CREATE" && change.action !== "UPDATE") return;
    try {
      hub.publish({ type: "chat.updated", chat: rowToChat(change.value) });
    } catch (error) {
      log.error("live chat mapping failed", { error: errorMessage(error) });
    }
  });

  return async () => {
    await messages.kill();
    await chats.kill();
  };
}
