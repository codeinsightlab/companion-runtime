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
import type { PetSize } from "./preferences/DesktopPreferences.js";

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
  onCharacterChanged(handler: (characterId: string) => void): () => void;
  onPetSizeChanged(handler: (petSize: PetSize, pixels: number) => void): () => void;
  notifyRuntimeReady(): void;
  notifyRuntimeError(message: string): void;
}

export type ListenerDisplayState = "running" | "stopped" | "unavailable" | "error";

export interface DesktopSettingsSnapshot {
  readonly currentCharacterId: string;
  readonly petSize: PetSize;
  readonly characters: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly listeners: {
    readonly cpu: ListenerDisplayState;
    readonly memory: ListenerDisplayState;
    readonly battery: ListenerDisplayState;
  };
}

export type DesktopSettingsResult =
  | { readonly ok: true; readonly snapshot: DesktopSettingsSnapshot }
  | { readonly ok: false; readonly error: string };

export interface CompanionSettingsBridge {
  getSnapshot(): Promise<DesktopSettingsResult>;
  setCharacter(characterId: string): Promise<DesktopSettingsResult>;
  setPetSize(petSize: PetSize): Promise<DesktopSettingsResult>;
  showPet(): Promise<DesktopSettingsResult>;
  hidePet(): Promise<DesktopSettingsResult>;
  onUpdated(handler: (snapshot: DesktopSettingsSnapshot) => void): () => void;
}
