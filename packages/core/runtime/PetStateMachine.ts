import { BEHAVIOR_SLOTS as TYPED_BEHAVIOR_SLOTS } from "../types/BehaviorSlot.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";

export const BEHAVIOR_SLOTS = Object.freeze([...TYPED_BEHAVIOR_SLOTS]);

export class PetStateMachine extends EventTarget {
  state: BehaviorSlot;

  constructor(initialState: string = "IDLE") {
    super();
    this.state = this.#validate(initialState);
  }

  transition(nextState: string, detail: Record<string, unknown> = {}): boolean {
    const next = this.#validate(nextState);
    if (next === this.state) return false;

    const previous = this.state;
    this.state = next;
    this.dispatchEvent(new CustomEvent("change", { detail: { previous, state: next, ...detail } }));
    return true;
  }

  #validate(state: string): BehaviorSlot {
    const normalized = String(state).toUpperCase();
    if (!BEHAVIOR_SLOTS.includes(normalized as BehaviorSlot)) {
      throw new RangeError(`Unknown Behavior Slot "${state}". Expected: ${BEHAVIOR_SLOTS.join(", ")}`);
    }
    return normalized as BehaviorSlot;
  }
}
