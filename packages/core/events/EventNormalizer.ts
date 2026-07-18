import type {
  CompanionEvent,
  EventSource
} from "./CompanionEvent.js";
import type {
  EventType,
  KnownEventType
} from "./EventType.js";

export type EventSourceInput = string | EventSource;

export interface RawEventInput {
  readonly id?: string;
  readonly event: string;
  readonly name?: string;
  readonly source: EventSourceInput;
  readonly payload?: Record<string, unknown>;
  readonly timestamp?: number;
}

const EVENT_ALIASES: Readonly<Record<string, KnownEventType>> = Object.freeze({
  START: "TASK_START",
  TASK_START: "TASK_START",
  RUNNING: "TASK_RUNNING",
  TASK_RUNNING: "TASK_RUNNING",
  SUCCESS: "TASK_SUCCESS",
  TASK_SUCCESS: "TASK_SUCCESS",
  ERROR: "TASK_ERROR",
  TASK_ERROR: "TASK_ERROR",
  IDLE: "IDLE",
  CUSTOM_EVENT: "CUSTOM_EVENT"
});

export class EventNormalizer {
  normalize(input: RawEventInput): CompanionEvent {
    if (!input || typeof input !== "object") {
      throw new TypeError("EventNormalizer.normalize requires an event object");
    }

    const type = this.normalizeType(input.event);
    const source = this.normalizeSource(input.source);
    const id = String(input.id ?? "").trim() || globalThis.crypto.randomUUID();
    const timestamp = input.timestamp ?? Date.now();

    return Object.freeze({
      id,
      type,
      ...(input.name ? { name: input.name } : {}),
      source: Object.freeze(source),
      payload: Object.freeze({ ...(input.payload ?? {}) }),
      timestamp
    });
  }

  normalizeType(eventName: string): EventType {
    const normalized = String(eventName ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) throw new TypeError("Event type must be non-empty");
    return EVENT_ALIASES[normalized] ?? normalized;
  }

  normalizeSource(source: EventSourceInput): EventSource {
    if (typeof source === "string") {
      const app = source.trim();
      if (!app) throw new TypeError("Event source app must be non-empty");
      return { app };
    }
    if (!source || typeof source !== "object") {
      throw new TypeError("Event source must be a string or EventSource");
    }
    const app = String(source.app ?? "").trim();
    if (!app) throw new TypeError("Event source app must be non-empty");
    return {
      app,
      ...(source.platform ? { platform: source.platform } : {}),
      ...(source.collector ? { collector: source.collector } : {})
    };
  }
}
