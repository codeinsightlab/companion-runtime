import type { BehaviorSlot } from "../types/BehaviorSlot.js";

export interface UserProfile {
  id: string;
  characterId: string;
  behaviorMapping: Partial<Record<BehaviorSlot, string>>;
}

export interface UserProfileRuntimeConfiguration {
  profileId: string;
  characterId: string;
  behaviorMapping: Readonly<Partial<Record<BehaviorSlot, string>>>;
}
