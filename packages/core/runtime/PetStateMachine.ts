import { PET_STATES as TYPED_PET_STATES } from "../types/PetState.js";
import type { PetState } from "../types/PetState.js";

export const PET_STATES = Object.freeze([...TYPED_PET_STATES]);

export class PetStateMachine extends EventTarget {
  state: PetState;

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

  #validate(state: string): PetState {
    const normalized = String(state).toUpperCase();
    if (!PET_STATES.includes(normalized as PetState)) {
      throw new RangeError(`Unknown pet state "${state}". Expected: ${PET_STATES.join(", ")}`);
    }
    return normalized as PetState;
  }
}
