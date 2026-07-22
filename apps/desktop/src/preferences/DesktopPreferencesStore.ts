import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DEFAULT_DESKTOP_PREFERENCES,
  validateDesktopPreferences
} from "./DesktopPreferences.js";
import type { DesktopPreferences, PetSize } from "./DesktopPreferences.js";

export interface DesktopPreferencesStoreOptions {
  readonly filePath: string;
  readonly reportError?: (message: string, error: unknown) => void;
}

export class DesktopPreferencesStore {
  readonly #filePath: string;
  readonly #reportError: (message: string, error: unknown) => void;
  #current: DesktopPreferences = DEFAULT_DESKTOP_PREFERENCES;
  #loaded = false;

  constructor({ filePath, reportError = console.error }: DesktopPreferencesStoreOptions) {
    this.#filePath = filePath;
    this.#reportError = reportError;
  }

  async load(): Promise<DesktopPreferences> {
    if (this.#loaded) return this.get();
    try {
      this.#current = validateDesktopPreferences(JSON.parse(await readFile(this.#filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.#reportError("Unable to load Desktop Preferences; defaults are used", error);
      }
      this.#current = DEFAULT_DESKTOP_PREFERENCES;
    }
    this.#loaded = true;
    return this.get();
  }

  get(): DesktopPreferences {
    return structuredClone(this.#current);
  }

  async updatePetSize(petSize: PetSize): Promise<DesktopPreferences> {
    const next = validateDesktopPreferences({ version: 1, petSize });
    await this.#save(next);
    this.#current = next;
    this.#loaded = true;
    return this.get();
  }

  async #save(value: DesktopPreferences): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#filePath);
  }
}
