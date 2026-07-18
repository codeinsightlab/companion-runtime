import type { EventType } from "./EventType.js";

export interface EventSource {
  readonly app: string;
  readonly platform?: string;
  readonly collector?: string;
}

export interface CompanionEvent {
  readonly id: string;
  readonly type: EventType;
  readonly name?: string;
  readonly source: Readonly<EventSource>;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
}
