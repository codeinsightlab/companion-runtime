import type { BehaviorSlot } from "../types/BehaviorSlot.js";
import type {
  JsonUrl,
  PersonalityActionPreference,
  PetPersonalityEngineCreateOptions,
  PetPersonalityEngineOptions,
  PersonalityProfile,
  PersonalityProfilesConfig,
  PersonalitySelection,
  SelectActionOptions
} from "../types/RuntimeTypes.js";

const DEFAULT_MOODS = Object.freeze(["normal", "focused", "excited", "alert", "sleepy"]);

export class PetPersonalityEngine extends EventTarget {
  readonly random: () => number;
  readonly defaultMood: string;
  readonly moods: readonly string[];
  readonly profiles: Readonly<Record<string, Readonly<PersonalityProfile>>>;

  static async create({
    profilesUrl,
    random
  }: PetPersonalityEngineCreateOptions = {}): Promise<PetPersonalityEngine> {
    if (!profilesUrl) throw new TypeError("PetPersonalityEngine.create requires profilesUrl");

    const response = await fetch(profilesUrl);
    if (!response.ok) {
      throw new Error(`Unable to load personality profiles ${profilesUrl}: HTTP ${response.status}`);
    }

    const profiles = await response.json() as PersonalityProfilesConfig;
    return new PetPersonalityEngine({ profiles, random });
  }

  constructor({ profiles, random = Math.random }: PetPersonalityEngineOptions = {}) {
    super();
    if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
      throw new TypeError("PetPersonalityEngine requires a personality profile object");
    }

    this.random = random;
    const profilesConfig = profiles as PersonalityProfilesConfig;
    this.defaultMood = profilesConfig.defaultMood ?? "normal";
    this.moods = Object.freeze([...(profilesConfig.moods ?? DEFAULT_MOODS)]);
    const characters = profilesConfig.characters
      ? profilesConfig.characters
      : profiles as Record<string, PersonalityProfile>;
    this.profiles = Object.freeze(
      Object.fromEntries(
        Object.entries(characters).map(([characterId, profile]) => [
          characterId,
          Object.freeze({
            ...profile,
            mood: profile.mood ?? this.defaultMood,
            actionPreferences: Object.freeze({ ...(profile.actionPreferences ?? {}) })
          })
        ])
      )
    );
  }

  selectAction({
    characterId,
    slot,
    fallbackAction,
    mood
  }: SelectActionOptions = {}): PersonalitySelection {
    if (!characterId) throw new TypeError("selectAction requires characterId");

    const profile = this.getProfile(characterId);
    const normalizedSlot = slot ? String(slot).toUpperCase() : undefined;
    const preferences = normalizedSlot
      ? profile.actionPreferences?.[normalizedSlot as BehaviorSlot] ?? []
      : [];
    const selectedAction = preferences.length > 0
      ? PetPersonalityEngine.selectWeighted(preferences, this.random)?.action
      : undefined;

    const detail: PersonalitySelection = {
      characterId,
      slot: normalizedSlot,
      mood: this.#normalizeMood(mood ?? profile.mood),
      style: profile.style,
      selectedAction: selectedAction ?? fallbackAction,
      fallbackAction,
      usedPreference: Boolean(selectedAction)
    };
    this.dispatchEvent(new CustomEvent("selected", { detail }));
    return detail;
  }

  getProfile(characterId: string): Readonly<PersonalityProfile> {
    const profile = this.profiles[characterId];
    if (!profile) throw new RangeError(`Unknown personality profile "${characterId}"`);
    return profile;
  }

  listProfiles(): Array<{
    id: string;
    style?: string;
    mood?: string;
    description?: string;
  }> {
    return Object.entries(this.profiles).map(([id, profile]) => ({
      id,
      style: profile.style,
      mood: profile.mood,
      description: profile.description
    }));
  }

  supports(characterId: string): boolean {
    return Object.hasOwn(this.profiles, characterId);
  }

  #normalizeMood(mood: string | undefined): string {
    return mood && this.moods.includes(mood) ? mood : this.defaultMood;
  }

  static selectWeighted<T extends PersonalityActionPreference>(
    options: T[],
    random: () => number = Math.random
  ): (T & { weight: number }) | undefined {
    if (!Array.isArray(options)) throw new TypeError("selectWeighted requires an array");

    const weighted = options
      .map((option) => ({ ...option, weight: Math.max(0, Number(option.weight ?? 1)) }))
      .filter((option) => option.weight > 0);
    if (weighted.length === 0) return undefined;

    const total = weighted.reduce((sum, option) => sum + option.weight, 0);
    let cursor = random() * total;
    for (const option of weighted) {
      cursor -= option.weight;
      if (cursor < 0) return option;
    }
    return weighted.at(-1);
  }
}
