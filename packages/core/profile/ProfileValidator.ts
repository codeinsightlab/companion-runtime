import { isBehaviorSlot } from "../types/BehaviorSlot.js";
import type { CharacterManifest } from "../types/CharacterManifest.js";
import type { UserProfile } from "./UserProfile.js";

export class ProfileValidator {
  readonly #characters: ReadonlyMap<string, CharacterManifest>;

  constructor(characters: ReadonlyMap<string, CharacterManifest>) {
    this.#characters = characters;
  }

  validate(input: unknown): UserProfile {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("User Profile must be an object");
    }
    const candidate = input as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const characterId = typeof candidate.characterId === "string"
      ? candidate.characterId.trim()
      : "";
    const mapping = candidate.behaviorMapping;
    if (!id) throw new TypeError("User Profile id must be a non-empty string");
    if (!characterId) {
      throw new TypeError("User Profile characterId must be a non-empty string");
    }
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      throw new TypeError("User Profile behaviorMapping must be an object");
    }

    const character = this.#characters.get(characterId);
    if (!character) throw new RangeError(`Unknown character "${characterId}"`);

    const behaviorMapping: Record<string, string> = {};
    for (const [slot, action] of Object.entries(mapping)) {
      if (!isBehaviorSlot(slot)) {
        throw new RangeError(`Invalid Behavior Slot "${slot}"`);
      }
      if (typeof action !== "string" || !action.trim()) {
        throw new TypeError(`Action for Behavior Slot "${slot}" must be a non-empty string`);
      }
      if (!character.actions.includes(action)) {
        throw new RangeError(
          `Character "${characterId}" does not support action "${action}"`
        );
      }
      behaviorMapping[slot] = action;
    }

    return Object.freeze({
      id,
      characterId,
      behaviorMapping: Object.freeze(behaviorMapping)
    });
  }
}
