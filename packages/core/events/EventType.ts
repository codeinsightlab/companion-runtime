export const KNOWN_EVENT_TYPES = [
  "TASK_START",
  "TASK_RUNNING",
  "TASK_SUCCESS",
  "TASK_ERROR",
  "IDLE",
  "CUSTOM_EVENT"
] as const;

export const EVENT_TYPES = Object.freeze({
  TASK_START: "TASK_START",
  TASK_RUNNING: "TASK_RUNNING",
  TASK_SUCCESS: "TASK_SUCCESS",
  TASK_ERROR: "TASK_ERROR",
  IDLE: "IDLE",
  CUSTOM_EVENT: "CUSTOM_EVENT"
} as const);

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

export type EventType = KnownEventType | (string & Record<never, never>);

export function isKnownEventType(type: string): type is KnownEventType {
  return KNOWN_EVENT_TYPES.includes(type as KnownEventType);
}
