import type { ExternalEvent } from "./ExternalEvent.js";

export type ExternalEventHandler = (event: ExternalEvent) => void;

export interface Listener {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: ExternalEventHandler): void;
}
