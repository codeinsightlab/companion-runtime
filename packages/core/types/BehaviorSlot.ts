export const BEHAVIOR_SLOTS = [
  "IDLE",
  "THINKING",
  "EXECUTING",
  "SUCCESS",
  "ERROR"
] as const;

export type BehaviorSlot = (typeof BEHAVIOR_SLOTS)[number];

export function isBehaviorSlot(value: string): value is BehaviorSlot {
  return BEHAVIOR_SLOTS.includes(value as BehaviorSlot);
}
