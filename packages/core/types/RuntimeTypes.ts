import type { EventType } from "./EventType.js";
import type { PetState } from "./PetState.js";

export type JsonUrl = string | URL;

export type PetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface PetActionDefinition {
  id: string;
  file: string;
  characterId: string;
  assetBase: string;
}

export interface PetCharacterDefinition {
  id: string;
  name: string;
  actions: Record<string, string>;
  states?: Partial<Record<PetState, string>>;
  assetBase: string;
}

export interface PetManifestCharacterDefinition {
  name: string;
  actions: Record<string, string>;
  states?: Partial<Record<PetState, string>>;
}

export interface PetManifest {
  version: number;
  assetBase: string;
  defaultCharacter: string;
  defaultState?: PetState;
  characters: Record<string, PetManifestCharacterDefinition>;
}

export interface RuntimeConfig {
  enabled?: boolean;
  character?: string;
  state?: PetState;
  position?: PetPosition;
  size?: number;
}

export interface PetViewerOptions {
  container?: HTMLElement;
  position?: PetPosition;
  size?: number;
}

export interface PetManagerCreateOptions {
  manifestUrl?: JsonUrl;
  configUrl?: JsonUrl;
  container?: HTMLElement;
}

export interface PetManagerOptions {
  manifest: PetManifest;
  runtimeConfig?: RuntimeConfig;
  assetBaseUrl: string;
  container?: HTMLElement;
}

export interface RuntimeEventMessage {
  event: EventType;
  payload?: Record<string, unknown>;
}

export interface EventMappingTarget {
  character?: string;
  state?: PetState;
}

export type EventMapping = Record<string, EventMappingTarget>;

export interface PetEventAdapterCreateOptions {
  petManager?: PetManagerLike;
  mappingUrl?: JsonUrl;
}

export interface PetEventAdapterOptions {
  petManager: PetManagerLike;
  mapping: EventMapping;
}

export interface EventAdapterHandledDetail {
  event: string;
  payload: Record<string, unknown>;
  mapping: Readonly<EventMappingTarget>;
  character: string;
  state: PetState;
}

export interface BehaviorRuleDefinition {
  event?: string;
  character?: string;
  state?: PetState;
  action?: string;
  duration?: number;
  recover?: PetState;
  priority?: number;
  cooldownKey?: string;
}

export interface IdleBehaviorTarget {
  state?: PetState;
  action?: string;
  actionByCharacter?: Record<string, string>;
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
  character?: string;
  state?: PetState;
  action?: string;
  priority: number;
  duration?: number;
  recover?: PetState;
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
  actionPreferences?: Partial<Record<PetState, PersonalityActionPreference[]>>;
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
  state?: string;
  fallbackAction?: string;
  mood?: string;
}

export interface PersonalitySelection {
  characterId: string;
  state?: string;
  mood: string;
  style?: string;
  selectedAction?: string;
  fallbackAction?: string;
  usedPreference: boolean;
}

export interface PetCharacterLike {
  id: string;
  actionForState(state: PetState): { id: string };
}

export interface PetManagerLike {
  character: PetCharacterLike;
  stateMachine: { state: PetState };
  changeCharacter(characterId: string): Promise<void>;
  changeState(state: PetState): void | Promise<void>;
  changeAction(actionId: string): Promise<void>;
}

export interface PersonalityEngineLike {
  supports(characterId: string): boolean;
  selectAction(options: {
    characterId: string;
    state: PetState;
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
  scheduler?: BehaviorSchedulerLike;
  personalityEngine?: PersonalityEngineLike;
}

export interface PetBehaviorEngineOptions {
  petManager?: PetManagerLike;
  rules?: BehaviorRulesConfig;
  scheduler?: BehaviorSchedulerLike;
  personalityEngine?: PersonalityEngineLike;
}

export type TimerHandle = ReturnType<typeof globalThis.setTimeout> | number;

export interface SchedulerOptions {
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  now?: () => number;
}
