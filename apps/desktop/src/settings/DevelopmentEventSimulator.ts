import {
  createExternalEvent
} from "../../../../packages/listeners/core/ExternalEvent.js";
import type { ExternalEvent } from "../../../../packages/listeners/core/ExternalEvent.js";

export const DEVELOPMENT_SYSTEM_EVENTS = [
  "CPU_HIGH",
  "MEMORY_PRESSURE",
  "BATTERY_LOW",
  "TASK_RUNNING",
  "TASK_SUCCESS",
  "TASK_ERROR"
] as const;

export type DevelopmentSystemEvent = typeof DEVELOPMENT_SYSTEM_EVENTS[number];

export function isDevelopmentSystemEvent(value: unknown): value is DevelopmentSystemEvent {
  return typeof value === "string"
    && DEVELOPMENT_SYSTEM_EVENTS.includes(value as DevelopmentSystemEvent);
}

export function createDevelopmentExternalEvent(name: DevelopmentSystemEvent): ExternalEvent {
  const payloadByName: Record<DevelopmentSystemEvent, Record<string, unknown>> = {
    CPU_HIGH: { platform: "macos", usage: 95, simulated: true },
    MEMORY_PRESSURE: { platform: "macos", level: "warning", simulated: true },
    BATTERY_LOW: { platform: "macos", level: 15, charging: false, simulated: true },
    TASK_RUNNING: { platform: "development", simulated: true },
    TASK_SUCCESS: { platform: "development", simulated: true },
    TASK_ERROR: { platform: "development", simulated: true }
  };
  return createExternalEvent({
    source: "system",
    name: name.toLowerCase(),
    payload: payloadByName[name]
  });
}
