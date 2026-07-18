import { BehaviorResolver } from "../behavior/BehaviorResolver.js";
import { EventBus } from "../events/EventBus.js";
import { EventNormalizer } from "../events/EventNormalizer.js";
import { ProfileManager } from "../profile/ProfileManager.js";
import { UserProfileResolver } from "../profile/UserProfileResolver.js";
import { ActionResolver } from "../behavior/ActionResolver.js";
import type { ProfileStore } from "../profile/ProfileStore.js";
import { PetBehaviorEngine } from "../runtime/PetBehaviorEngine.js";
import { PetManager } from "../runtime/PetManager.js";
import { PetPersonalityEngine } from "../runtime/PetPersonalityEngine.js";
import type {
  BehaviorActionMapping,
  BehaviorSchedulerLike,
  BehaviorRulesConfig,
  EventMapping,
  PersonalityProfilesConfig,
  RuntimeConfig
} from "../types/RuntimeTypes.js";
import type { CharacterRegistry } from "./CharacterRegistry.js";
import { CompanionRuntime } from "./CompanionRuntime.js";
import type { CompanionRuntimeContext } from "./CompanionRuntimeContext.js";

export interface CreateCompanionRuntimeConfig {
  profileId: string;
  profileStore: ProfileStore;
  characterRegistry: CharacterRegistry;
  assetBaseUrl: string;
  eventMapping: EventMapping;
  behaviorMapping: BehaviorActionMapping;
  behaviorRules: BehaviorRulesConfig;
  runtimeConfig?: RuntimeConfig;
  personalityProfiles?: PersonalityProfilesConfig;
  personalityRandom?: () => number;
  behaviorScheduler?: BehaviorSchedulerLike;
  container?: HTMLElement;
}

export async function createCompanionRuntime({
  profileId,
  profileStore,
  characterRegistry,
  assetBaseUrl,
  eventMapping,
  behaviorMapping,
  behaviorRules,
  runtimeConfig = {},
  personalityProfiles,
  personalityRandom,
  behaviorScheduler,
  container
}: CreateCompanionRuntimeConfig): Promise<CompanionRuntimeContext> {
  if (!profileId) throw new TypeError("createCompanionRuntime requires profileId");
  if (!profileStore) throw new TypeError("createCompanionRuntime requires profileStore");
  if (!characterRegistry) throw new TypeError("createCompanionRuntime requires characterRegistry");
  if (!assetBaseUrl) throw new TypeError("createCompanionRuntime requires assetBaseUrl");

  const characterManifests = characterRegistry.listCharacters();
  const profileResolver = new UserProfileResolver();
  const profileManager = new ProfileManager(
    profileStore,
    new Map(characterManifests.map((character) => [character.id, character])),
    profileResolver
  );
  const userProfile = await profileManager.loadProfile(profileId);
  const behaviorResolver = new BehaviorResolver(eventMapping);
  const actionResolver = new ActionResolver(behaviorMapping, userProfile.behaviorMapping);
  const petManager = new PetManager({
    characterDefinitions: characterManifests.map((character) => ({
      ...character,
      assetBase: assetBaseUrl
    })),
    behaviorMapping,
    actionResolver,
    userProfile,
    profileManager,
    runtimeConfig,
    assetBaseUrl,
    container
  });
  const personalityEngine = personalityProfiles
    ? new PetPersonalityEngine({ profiles: personalityProfiles, random: personalityRandom })
    : undefined;
  await petManager.ready;
  const behaviorEngine = new PetBehaviorEngine({
    petManager,
    rules: behaviorRules,
    behaviorResolver,
    scheduler: behaviorScheduler,
    personalityEngine
  });
  const eventBus = new EventBus();
  const eventNormalizer = new EventNormalizer();
  const runtime = new CompanionRuntime(eventBus, behaviorEngine);

  return Object.freeze({
    eventBus,
    eventNormalizer,
    profileManager,
    profileResolver,
    behaviorResolver,
    behaviorEngine,
    actionResolver,
    characterRegistry,
    petManager,
    runtime
  });
}
