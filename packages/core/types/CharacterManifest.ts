import type { BehaviorSlot } from "./BehaviorSlot.js";

export interface CharacterAssetDefinition {
  asset: string;
}

export interface CharacterManifest {
  id: string;
  name: string;
  version: string;
  actions: string[];
  assets: Record<string, CharacterAssetDefinition>;
  behaviorMapping?: Partial<Record<BehaviorSlot, string>>;
}
