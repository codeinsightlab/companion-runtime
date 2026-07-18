import { PetAction } from "./PetAction.js";
import type { PetCharacterDefinition } from "../types/RuntimeTypes.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";

export class PetCharacter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly actions: ReadonlyMap<string, PetAction>;
  readonly behaviorMapping: Readonly<Partial<Record<BehaviorSlot, string>>>;

  constructor({ id, name, version, actions, assets, behaviorMapping = {}, assetBase }: PetCharacterDefinition) {
    if (!id || !name || !version || !Array.isArray(actions) || !assets) {
      throw new TypeError("PetCharacter requires id, name, version, actions and assets");
    }

    this.id = id;
    this.name = name;
    this.version = version;
    this.behaviorMapping = Object.freeze({ ...behaviorMapping });
    this.actions = new Map(
      actions.map((actionId) => {
        const definition = assets[actionId];
        if (!definition) {
          throw new TypeError(`Character "${id}" action "${actionId}" has no asset definition`);
        }
        return [
          actionId,
          new PetAction({ id: actionId, asset: definition.asset, characterId: id, assetBase })
        ];
      })
    );
  }

  getAction(actionId: string): PetAction {
    const action = this.actions.get(actionId);
    if (!action) {
      throw new RangeError(`Unknown action "${actionId}" for character "${this.id}"`);
    }
    return action;
  }

  listActions(): string[] {
    return [...this.actions.keys()];
  }
}
