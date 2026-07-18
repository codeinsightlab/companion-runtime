import type { PetAction as PetActionContract } from "../types/PetAction.js";
import type { PetActionDefinition } from "../types/RuntimeTypes.js";

export class PetAction implements PetActionContract {
  readonly id: string;
  readonly asset: string;
  readonly characterId: string;
  readonly assetBase: string;

  constructor({ id, asset, characterId, assetBase }: PetActionDefinition) {
    if (!id || !asset || !characterId || !assetBase) {
      throw new TypeError("PetAction requires id, asset, characterId and assetBase");
    }

    this.id = id;
    this.asset = asset;
    this.characterId = characterId;
    this.assetBase = assetBase.replace(/\/$/, "");
    Object.freeze(this);
  }

  get src(): string {
    return `${this.assetBase}/${encodeURIComponent(this.characterId)}/${encodeURIComponent(this.asset)}`;
  }
}
