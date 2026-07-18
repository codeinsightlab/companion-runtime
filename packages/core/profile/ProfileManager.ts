import type { CharacterManifest } from "../types/CharacterManifest.js";
import type { ProfileStore } from "./ProfileStore.js";
import type { UserProfile, UserProfileRuntimeConfiguration } from "./UserProfile.js";
import { ProfileValidator } from "./ProfileValidator.js";
import { UserProfileResolver } from "./UserProfileResolver.js";

export type ProfileChangeHandler = (
  profile: UserProfileRuntimeConfiguration
) => void | Promise<void>;

export class ProfileManager {
  readonly #store: ProfileStore;
  readonly #characters: ReadonlyMap<string, CharacterManifest>;
  readonly #validator: ProfileValidator;
  readonly #resolver: UserProfileResolver;
  readonly #handlers = new Set<ProfileChangeHandler>();
  #current: UserProfile | null = null;

  constructor(
    store: ProfileStore,
    characters: ReadonlyMap<string, CharacterManifest>,
    resolver: UserProfileResolver = new UserProfileResolver()
  ) {
    this.#store = store;
    this.#characters = characters;
    this.#resolver = resolver;
    this.#validator = new ProfileValidator(characters);
  }

  async loadProfile(id: string): Promise<UserProfileRuntimeConfiguration> {
    const profile = await this.#store.load(id);
    if (!profile) throw new RangeError(`Unknown User Profile "${id}"`);
    const validated = this.#validator.validate(profile);
    this.#current = validated;
    return this.#resolve(validated);
  }

  async switchCharacter(characterId: string): Promise<UserProfileRuntimeConfiguration> {
    if (!this.#current) throw new Error("No User Profile is currently loaded");
    const updated = this.#validator.validate({
      ...this.#current,
      characterId,
      behaviorMapping: {}
    });
    await this.#store.save(updated);
    this.#current = updated;
    const runtime = this.#resolve(updated);
    await Promise.all([...this.#handlers].map((handler) => handler(runtime)));
    return runtime;
  }

  getCurrentProfile(): UserProfile | null {
    return this.#current ? structuredClone(this.#current) : null;
  }

  async exportProfile(id?: string): Promise<string> {
    const profile = id ? await this.#store.load(id) : this.#current;
    if (!profile) throw new RangeError(`Unknown User Profile "${id ?? "current"}"`);
    return JSON.stringify(this.#validator.validate(profile), null, 2);
  }

  async importProfile(json: string): Promise<UserProfile> {
    let input: unknown;
    try {
      input = JSON.parse(json);
    } catch (error) {
      throw new SyntaxError(`Invalid User Profile JSON: ${(error as Error).message}`);
    }
    const profile = this.#validator.validate(input);
    await this.#store.save(profile);
    return structuredClone(profile);
  }

  onChange(handler: ProfileChangeHandler): () => void {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  #resolve(profile: UserProfile): UserProfileRuntimeConfiguration {
    const character = this.#characters.get(profile.characterId);
    if (!character) throw new RangeError(`Unknown character "${profile.characterId}"`);
    return this.#resolver.resolve(profile, character);
  }
}
