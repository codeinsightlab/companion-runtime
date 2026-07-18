import type {
  CompanionEvent,
  EventSource
} from "../../core/events/CompanionEvent.js";
import type { EventCollectorHandler } from "../../core/events/EventCollector.js";
import type { EventCollector } from "../../core/events/EventCollector.js";
import { EventNormalizer } from "../../core/events/EventNormalizer.js";
import type { EventType } from "../../core/events/EventType.js";

export interface MockEventInput {
  readonly id?: string;
  readonly type?: EventType;
  readonly event?: string;
  readonly source?: string | EventSource;
  readonly payload?: Record<string, unknown>;
  readonly timestamp?: number;
}

export class MockEventCollector implements EventCollector {
  readonly #handlers = new Set<EventCollectorHandler>();
  readonly #normalizer: EventNormalizer;
  #running = false;

  constructor(normalizer: EventNormalizer = new EventNormalizer()) {
    this.#normalizer = normalizer;
  }

  async start(): Promise<void> {
    this.#running = true;
  }

  async stop(): Promise<void> {
    this.#running = false;
  }

  onEvent(handler: EventCollectorHandler): void {
    if (typeof handler !== "function") {
      throw new TypeError("MockEventCollector.onEvent requires a handler");
    }
    this.#handlers.add(handler);
  }

  async emit(input: MockEventInput): Promise<CompanionEvent> {
    if (!this.#running) {
      throw new Error("MockEventCollector must be started before emit");
    }
    const eventName = input.type ?? input.event;
    if (!eventName) throw new TypeError("MockEventCollector.emit requires type or event");

    const event = this.#normalizer.normalize({
      id: input.id,
      event: eventName,
      source: input.source ?? { app: "mock", collector: "mock" },
      payload: input.payload,
      timestamp: input.timestamp
    });
    await Promise.all([...this.#handlers].map((handler) => handler(event)));
    return event;
  }
}
