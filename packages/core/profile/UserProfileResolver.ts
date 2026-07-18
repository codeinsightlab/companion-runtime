import type { UserProfile, UserProfileRuntimeConfiguration } from "./UserProfile.js";
import type { CharacterManifest } from "../types/CharacterManifest.js";

export class UserProfileResolver {
  resolve(profile: UserProfile, character: CharacterManifest): UserProfileRuntimeConfiguration {
    if (!profile || typeof profile !== "object") {
      throw new TypeError("UserProfileResolver requires a UserProfile");
    }
    if (!character || typeof character !== "object") {
      throw new TypeError("UserProfileResolver requires a Character Manifest");
    }
    if (!profile.id || !profile.characterId) {
      throw new TypeError("UserProfile requires id and characterId");
    }
    if (profile.characterId !== character.id) {
      throw new RangeError(
        `UserProfile character "${profile.characterId}" does not match manifest "${character.id}"`
      );
    }

    for (const [slot, actionId] of Object.entries(profile.behaviorMapping ?? {})) {
      if (actionId && !character.actions.includes(actionId)) {
        throw new RangeError(
          `UserProfile maps Behavior Slot "${slot}" to unsupported action "${actionId}"`
        );
      }
    }

    return Object.freeze({
      profileId: profile.id,
      characterId: profile.characterId,
      behaviorMapping: Object.freeze({ ...(profile.behaviorMapping ?? {}) })
    });
  }
}
