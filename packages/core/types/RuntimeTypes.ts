import type { CompanionEvent } from "../events/CompanionEvent.js";
import type { EventType } from "../events/EventType.js";
import type { BehaviorSlot } from "./BehaviorSlot.js";
import type { PetAction } from "./PetAction.js";
import type { CharacterManifest } from "./CharacterManifest.js";
import type { UserProfileRuntimeConfiguration } from "../profile/UserProfile.js";

export type JsonUrl = string | URL;

export type PetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface PetActionDefinition {
  id: string;
  asset: string;
  characterId: string;
  assetBase: string;
}

export interface PetCharacterDefinition extends CharacterManifest {
  assetBase: string;
}

export interface PetManifest {
  version: number;
  assetBase: string;
  defaultCharacter: string;
  defaultBehavior?: BehaviorSlot;
  characters: Record<string, string>;
}

export interface RuntimeConfig {
  enabled?: boolean;
  behavior?: BehaviorSlot;
  position?: PetPosition;
  size?: number;
}

export interface PetViewerOptions {
  container?: HTMLElement;
  position?: PetPosition;
  size?: number;
}

export type EventMapping = Record<string, BehaviorSlot>;
export type BehaviorActionMapping = Partial<Record<BehaviorSlot, string>>;

export interface BehaviorResolverLike {
  resolve(event: CompanionEvent): BehaviorSlot;
  supports(eventType: string, name?: string): boolean;
}

export interface PetManagerCreateOptions {
  manifestUrl?: JsonUrl;
  configUrl?: JsonUrl;
  behaviorMappingUrl?: JsonUrl;
  profileUrl?: JsonUrl;
  container?: HTMLElement;
}

export interface PetManagerOptions {
  manifest: PetManifest;
  characterDefinitions: PetCharacterDefinition[];
  behaviorMapping: BehaviorActionMapping;
  userProfile: UserProfileRuntimeConfiguration;
  runtimeConfig?: RuntimeConfig;
  assetBaseUrl: string;
  container?: HTMLElement;
}

export interface PetEventAdapterCreateOptions {
  petManager?: PetManagerLike;
  mappingUrl?: JsonUrl;
}

export interface PetEventAdapterOptions {
  petManager: PetManagerLike;
  behaviorResolver: BehaviorResolverLike;
}

export interface EventAdapterHandledDetail {
  event: EventType;
  payload: Readonly<Record<string, unknown>>;
  slot: BehaviorSlot;
  character: string;
  behavior: BehaviorSlot;
}

export interface BehaviorRuleDefinition {
  event?: string;
  duration?: number;
  recover?: BehaviorSlot;
  priority?: number;
  cooldownKey?: string;
}

export interface IdleBehaviorTarget {
  slot: BehaviorSlot;
  weight?: number;
}

export interface BehaviorRulesConfig {
  version?: number;
  priorities: Record<string, number>;
  events: Record<string, BehaviorRuleDefinition>;
  cooldown?: Record<string, number>;
  idle?: {
    enabled?: boolean;
    timeout?: number;
    idleActions?: IdleBehaviorTarget[];
  };
}

export interface Behavior {
  event: string;
  payload?: Record<string, unknown>;
  slot: BehaviorSlot;
  priority: number;
  duration?: number;
  recover?: BehaviorSlot;
  cooldownKey?: string;
  startedAt: number;
  recoveredFrom?: string;
  selectedAction?: string;
  mood?: string;
  style?: string;
  usedPersonalityPreference?: boolean;
}

export type BehaviorIgnoreReason = "cooldown" | "priority";

export type BehaviorResult =
  | { accepted: true; behavior: Behavior }
  | { accepted: false; reason: BehaviorIgnoreReason; behavior: Behavior };

export interface PersonalityActionPreference {
  action: string;
  weight?: number;
}

export interface PersonalityProfile {
  style?: string;
  mood?: string;
  description?: string;
  keywords?: string[];
  actionPreferences?: Partial<Record<BehaviorSlot, PersonalityActionPreference[]>>;
}

export interface PersonalityProfilesConfig {
  version?: number;
  defaultMood?: string;
  moods?: string[];
  characters?: Record<string, PersonalityProfile>;
}

export interface PetPersonalityEngineCreateOptions {
  profilesUrl?: JsonUrl;
  random?: () => number;
}

export interface PetPersonalityEngineOptions {
  profiles?: PersonalityProfilesConfig | Record<string, PersonalityProfile>;
  random?: () => number;
}

export interface SelectActionOptions {
  characterId?: string;
  slot?: string;
  fallbackAction?: string;
  mood?: string;
}

export interface PersonalitySelection {
  characterId: string;
  slot?: string;
  mood: string;
  style?: string;
  selectedAction?: string;
  fallbackAction?: string;
  usedPreference: boolean;
}

export interface PetCharacterLike {
  id: string;
  getAction(actionId: string): PetAction;
}

export interface PetManagerLike {
  character: PetCharacterLike;
  stateMachine: { state: BehaviorSlot };
  changeCharacter(characterId: string): Promise<void>;
  changeBehavior(slot: BehaviorSlot): void | Promise<void>;
  changeAction(actionId: string): Promise<void>;
  resolveAction(slot: BehaviorSlot): PetAction;
}

export interface PersonalityEngineLike {
  supports(characterId: string): boolean;
  selectAction(options: {
    characterId: string;
    slot: BehaviorSlot;
    fallbackAction: string;
  }): PersonalitySelection;
}

export interface BehaviorSchedulerLike {
  clearRecovery(): void;
  scheduleRecovery(duration: number, callback: () => void): void;
  scheduleIdle(timeout: number, callback: () => void): void;
  markCooldown(key: string | undefined, duration: number): void;
  isCoolingDown(key: string | undefined): boolean;
  stop(): void;
}

export interface PetBehaviorEngineCreateOptions {
  petManager?: PetManagerLike;
  rulesUrl?: JsonUrl;
  behaviorResolver?: BehaviorResolverLike;
  scheduler?: BehaviorSchedulerLike;
  personalityEngine?: PersonalityEngineLike;
}

export interface PetBehaviorEngineOptions {
  petManager?: PetManagerLike;
  rules?: BehaviorRulesConfig;
  behaviorResolver?: BehaviorResolverLike;
  scheduler?: BehaviorSchedulerLike;
  personalityEngine?: PersonalityEngineLike;
}

export type TimerHandle = ReturnType<typeof globalThis.setTimeout> | number;

export interface SchedulerOptions {
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  now?: () => number;
}
