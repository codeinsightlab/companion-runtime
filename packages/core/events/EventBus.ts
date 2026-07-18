import type { CompanionEvent } from "./CompanionEvent.js";

export type EventHandler = (
  event: CompanionEvent
) => void | Promise<void>;

export class EventBus {
  readonly #handlers = new Set<EventHandler>();

  subscribe(handler: EventHandler): () => void {
    if (typeof handler !== "function") {
      throw new TypeError("EventBus.subscribe requires a handler");
    }
    this.#handlers.add(handler);
    return () => {
      this.unsubscribe(handler);
    };
  }

  unsubscribe(handler: EventHandler): boolean {
    return this.#handlers.delete(handler);
  }

  async publish(event: CompanionEvent): Promise<void> {
    if (!event || typeof event !== "object") {
      throw new TypeError("EventBus.publish requires a CompanionEvent");
    }
    await Promise.all([...this.#handlers].map((handler) => handler(event)));
  }
}
