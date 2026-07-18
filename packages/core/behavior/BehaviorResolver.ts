import type { CompanionEvent } from "../events/CompanionEvent.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";

export type EventBehaviorMapping = Readonly<Record<string, BehaviorSlot>>;

export class BehaviorResolver {
  readonly #mapping: EventBehaviorMapping;

  constructor(mapping: EventBehaviorMapping) {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      throw new TypeError("BehaviorResolver requires an event mapping object");
    }
    this.#mapping = Object.freeze({ ...mapping });
  }

  resolve(event: CompanionEvent): BehaviorSlot {
    if (!event || typeof event !== "object") {
      throw new TypeError("BehaviorResolver.resolve requires a CompanionEvent");
    }
    const key = event.type === "CUSTOM_EVENT" && event.name
      ? `CUSTOM_EVENT:${event.name}`
      : event.type;
    const slot = this.#mapping[key];
    if (!slot) throw new RangeError(`No Behavior Slot mapping for event "${key}"`);
    return slot;
  }

  supports(eventType: string, name?: string): boolean {
    const key = eventType === "CUSTOM_EVENT" && name
      ? `CUSTOM_EVENT:${name}`
      : eventType;
    return Object.hasOwn(this.#mapping, key);
  }
}
