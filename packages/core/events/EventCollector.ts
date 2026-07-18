import type { CompanionEvent } from "./CompanionEvent.js";

export type EventCollectorHandler = (
  event: CompanionEvent
) => void | Promise<void>;

export interface EventCollector {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: EventCollectorHandler): void;
}
