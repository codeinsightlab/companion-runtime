import type { CharacterManifest } from "../types/CharacterManifest.js";

export interface CharacterRegistry {
  getCharacter(id: string): CharacterManifest | undefined;
  listCharacters(): CharacterManifest[];
}
