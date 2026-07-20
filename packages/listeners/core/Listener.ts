import type { ExternalEvent } from "./ExternalEvent.js";

export type ExternalEventHandler = (event: ExternalEvent) => void;
export type ListenerLifecycleState = "CREATED" | "STARTED" | "STOPPED" | "DESTROYED";

export interface Listener {
  readonly id: string;
  readonly state: ListenerLifecycleState;
  readonly running: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  onEvent(handler: ExternalEventHandler): void;
}
