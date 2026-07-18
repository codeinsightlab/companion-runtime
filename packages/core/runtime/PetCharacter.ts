import { PetAction } from "./PetAction.js";
import type { PetState } from "../types/PetState.js";
import type { PetCharacterDefinition } from "../types/RuntimeTypes.js";

export class PetCharacter {
  readonly id: string;
  readonly name: string;
  readonly states: Readonly<Partial<Record<PetState, string>>>;
  readonly actions: ReadonlyMap<string, PetAction>;

  constructor({ id, name, actions, states = {}, assetBase }: PetCharacterDefinition) {
    if (!id || !name || !actions || typeof actions !== "object") {
      throw new TypeError("PetCharacter requires id, name and actions");
    }

    this.id = id;
    this.name = name;
    this.states = Object.freeze({ ...states });
    this.actions = new Map(
      Object.entries(actions).map(([actionId, file]) => [
        actionId,
        new PetAction({ id: actionId, file, characterId: id, assetBase })
      ])
    );
  }

  getAction(actionId: string): PetAction {
    const action = this.actions.get(actionId);
    if (!action) {
      throw new RangeError(`Unknown action "${actionId}" for character "${this.id}"`);
    }
    return action;
  }

  actionForState(state: PetState): PetAction {
    const actionId = this.states[state] ?? this.states.IDLE;
    if (!actionId) {
      throw new RangeError(`Character "${this.id}" has no mapping for state "${state}" or IDLE`);
    }
    return this.getAction(actionId);
  }

  listActions(): string[] {
    return [...this.actions.keys()];
  }
}
