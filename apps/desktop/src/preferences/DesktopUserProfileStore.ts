import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { UserProfile } from "../../../../packages/core/profile/UserProfile.js";

export class DesktopUserProfileStore {
  readonly #filePath: string;
  readonly #defaultProfile: UserProfile;
  readonly #reportError: (message: string, error: unknown) => void;
  #current: UserProfile;

  constructor(filePath: string, defaultProfile: UserProfile, reportError = console.error) {
    this.#filePath = filePath;
    this.#defaultProfile = structuredClone(defaultProfile);
    this.#current = structuredClone(defaultProfile);
    this.#reportError = reportError;
  }

  async load(): Promise<UserProfile> {
    try {
      const input = JSON.parse(await readFile(this.#filePath, "utf8")) as unknown;
      if (!input || typeof input !== "object") throw new TypeError("User Profile must be an object");
      const candidate = input as Partial<UserProfile>;
      if (typeof candidate.id !== "string" || typeof candidate.characterId !== "string") {
        throw new TypeError("User Profile id and characterId are required");
      }
      if (!candidate.behaviorMapping || typeof candidate.behaviorMapping !== "object") {
        throw new TypeError("User Profile behaviorMapping is required");
      }
      this.#current = structuredClone(candidate as UserProfile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.#reportError("Unable to load persisted User Profile; default is used", error);
      }
      this.#current = structuredClone(this.#defaultProfile);
    }
    return this.get();
  }

  get(): UserProfile {
    return structuredClone(this.#current);
  }

  async save(profile: UserProfile): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#filePath);
    this.#current = structuredClone(profile);
  }
}
