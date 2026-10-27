import type { ServerEvent } from "@crew/shared";
import { errorMessage, log } from "../../lib/log";

type Listener = (event: ServerEvent) => void;

/** Fan-out of server events to connected clients and in-process listeners. */
export class EventHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: ServerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        log.error("event listener failed", { event: event.type, error: errorMessage(error) });
      }
    }
  }
}
