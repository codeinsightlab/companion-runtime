import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CharacterManifest } from "../../../packages/core/types/CharacterManifest.js";
import type { UserProfile } from "../../../packages/core/profile/UserProfile.js";
import type {
  BehaviorActionMapping,
  BehaviorRulesConfig,
  EventMapping,
  PersonalityProfilesConfig,
  PetManifest,
  RuntimeConfig
} from "../../../packages/core/types/RuntimeTypes.js";
import type { DesktopRuntimeConfiguration } from "./types.js";

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(fileURLToPath(url), "utf8")) as T;
}

export async function loadDesktopRuntimeConfiguration(): Promise<DesktopRuntimeConfiguration> {
  const manifestUrl = new URL("../../../packages/core/config/pet-manifest.json", import.meta.url);
  const configBase = new URL("../../../packages/core/config/", import.meta.url);
  const [manifest, runtimeConfig, eventMapping, behaviorMapping, behaviorRules, personalityProfiles, userProfile] =
    await Promise.all([
      readJson<PetManifest>(manifestUrl),
      readJson<RuntimeConfig>(new URL("runtime-config.json", configBase)),
      readJson<EventMapping>(new URL("event-mapping.json", configBase)),
      readJson<BehaviorActionMapping>(new URL("behavior-mapping.json", configBase)),
      readJson<BehaviorRulesConfig>(new URL("behavior-rules.json", configBase)),
      readJson<PersonalityProfilesConfig>(new URL("personality-profiles.json", configBase)),
      readJson<UserProfile>(new URL("user-profile.json", configBase))
    ]);
  const assetBaseUrl = new URL(manifest.assetBase, manifestUrl);
  const characterBaseUrl = new URL(`${assetBaseUrl.href.replace(/\/$/, "")}/`);
  const characters = await Promise.all(
    Object.entries(manifest.characters).map(async ([characterId, relativePath]) => {
      const character = await readJson<CharacterManifest>(new URL(relativePath, characterBaseUrl));
      if (character.id !== characterId) {
        throw new TypeError(
          `Character Manifest id "${character.id}" does not match catalog id "${characterId}"`
        );
      }
      return character;
    })
  );

  return {
    assetBaseUrl: pathToFileURL(fileURLToPath(assetBaseUrl)).href.replace(/\/$/, ""),
    characters,
    eventMapping,
    behaviorMapping,
    behaviorRules,
    personalityProfiles,
    runtimeConfig,
    userProfile
  };
}
