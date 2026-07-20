import type { CharacterManifest } from "../../../packages/core/types/CharacterManifest.js";
import type { UserProfile } from "../../../packages/core/profile/UserProfile.js";
import type {
  BehaviorActionMapping,
  BehaviorRulesConfig,
  EventMapping,
  PersonalityProfilesConfig,
  RuntimeConfig
} from "../../../packages/core/types/RuntimeTypes.js";
import type { ExternalEvent } from "../../../packages/listeners/core/ExternalEvent.js";

export interface DesktopRuntimeConfiguration {
  assetBaseUrl: string;
  characters: CharacterManifest[];
  eventMapping: EventMapping;
  behaviorMapping: BehaviorActionMapping;
  behaviorRules: BehaviorRulesConfig;
  personalityProfiles: PersonalityProfilesConfig;
  runtimeConfig: RuntimeConfig;
  userProfile: UserProfile;
}

export interface CompanionDesktopBridge {
  loadRuntimeConfiguration(): Promise<DesktopRuntimeConfiguration>;
  getMode(): "development" | "production";
  onExternalEvent(handler: (event: ExternalEvent) => void): () => void;
  onRuntimeStop(handler: () => void): () => void;
  notifyRuntimeReady(): void;
  notifyRuntimeError(message: string): void;
}
