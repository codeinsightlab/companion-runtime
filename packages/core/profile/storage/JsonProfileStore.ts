import type { JsonUrl } from "../../types/RuntimeTypes.js";
import type { ProfileStore } from "../ProfileStore.js";
import type { UserProfile } from "../UserProfile.js";

type ProfileJsonDocument = UserProfile | UserProfile[] | { profiles: UserProfile[] };

export class JsonProfileStore implements ProfileStore {
  readonly #sourceUrl: JsonUrl;
  readonly #profiles = new Map<string, UserProfile>();
  #loaded = false;

  constructor(sourceUrl: JsonUrl) {
    this.#sourceUrl = sourceUrl;
  }

  async load(id: string): Promise<UserProfile | null> {
    await this.#loadSource();
    const profile = this.#profiles.get(id);
    return profile ? structuredClone(profile) : null;
  }

  async save(profile: UserProfile): Promise<void> {
    await this.#loadSource();
    this.#profiles.set(profile.id, structuredClone(profile));
  }

  async delete(id: string): Promise<void> {
    await this.#loadSource();
    this.#profiles.delete(id);
  }

  async list(): Promise<UserProfile[]> {
    await this.#loadSource();
    return [...this.#profiles.values()].map((profile) => structuredClone(profile));
  }

  async #loadSource(): Promise<void> {
    if (this.#loaded) return;
    const response = await fetch(this.#sourceUrl);
    if (!response.ok) {
      throw new Error(`Unable to load Profile JSON ${this.#sourceUrl}: HTTP ${response.status}`);
    }
    const document = await response.json() as ProfileJsonDocument;
    const profiles = Array.isArray(document)
      ? document
      : "profiles" in document
        ? document.profiles
        : [document];
    for (const profile of profiles) this.#profiles.set(profile.id, structuredClone(profile));
    this.#loaded = true;
  }
}
