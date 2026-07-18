import type { PetAction } from "../runtime/PetAction.js";
import type { PetCharacter } from "../runtime/PetCharacter.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";

export type BehaviorActionMapping = Readonly<Partial<Record<BehaviorSlot, string>>>;
export type BehaviorActionOverrides = Readonly<Partial<Record<BehaviorSlot, string>>>;

export class ActionResolver {
  readonly #defaultMapping: BehaviorActionMapping;
  readonly #userMapping: BehaviorActionOverrides;

  constructor(mapping: BehaviorActionMapping, userMapping: BehaviorActionOverrides = {}) {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      throw new TypeError("ActionResolver requires a behavior mapping object");
    }
    this.#defaultMapping = Object.freeze({ ...mapping });
    this.#userMapping = Object.freeze({ ...userMapping });
  }

  resolve(character: PetCharacter, slot: BehaviorSlot): PetAction {
    const actionId = this.#userMapping[slot]
      ?? character.behaviorMapping[slot]
      ?? this.#defaultMapping[slot];
    if (!actionId) {
      throw new RangeError(`No Action mapping for Behavior Slot "${slot}"`);
    }
    return character.getAction(actionId);
  }
}
