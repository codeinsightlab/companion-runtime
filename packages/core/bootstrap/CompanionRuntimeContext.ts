import type { ActionResolver } from "../behavior/ActionResolver.js";
import type { BehaviorResolver } from "../behavior/BehaviorResolver.js";
import type { EventBus } from "../events/EventBus.js";
import type { EventNormalizer } from "../events/EventNormalizer.js";
import type { ProfileManager } from "../profile/ProfileManager.js";
import type { UserProfileResolver } from "../profile/UserProfileResolver.js";
import type { PetBehaviorEngine } from "../runtime/PetBehaviorEngine.js";
import type { PetManager } from "../runtime/PetManager.js";
import type { CompanionRuntime } from "./CompanionRuntime.js";
import type { CharacterRegistry } from "./CharacterRegistry.js";

export interface CompanionRuntimeContext {
  eventBus: EventBus;
  eventNormalizer: EventNormalizer;
  profileManager: ProfileManager;
  profileResolver: UserProfileResolver;
  behaviorResolver: BehaviorResolver;
  behaviorEngine: PetBehaviorEngine;
  actionResolver: ActionResolver;
  characterRegistry: CharacterRegistry;
  petManager: PetManager;
  runtime: CompanionRuntime;
}
