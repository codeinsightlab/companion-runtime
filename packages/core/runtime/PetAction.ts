import type { PetAction as PetActionContract } from "../types/PetAction.js";
import type { PetActionDefinition } from "../types/RuntimeTypes.js";

export class PetAction implements PetActionContract {
  readonly id: string;
  readonly file: string;
  readonly characterId: string;
  readonly assetBase: string;

  constructor({ id, file, characterId, assetBase }: PetActionDefinition) {
    if (!id || !file || !characterId || !assetBase) {
      throw new TypeError("PetAction requires id, file, characterId and assetBase");
    }

    this.id = id;
    this.file = file;
    this.characterId = characterId;
    this.assetBase = assetBase.replace(/\/$/, "");
    Object.freeze(this);
  }

  get src(): string {
    return `${this.assetBase}/${encodeURIComponent(this.characterId)}/${encodeURIComponent(this.file)}`;
  }
}
