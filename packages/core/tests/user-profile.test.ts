import assert from "node:assert/strict";
import { test } from "node:test";
import { UserProfileResolver } from "../profile/UserProfileResolver.js";
import type { CharacterManifest } from "../types/CharacterManifest.js";

const itachi: CharacterManifest = {
  id: "itachi",
  name: "Itachi",
  version: "1.0.0",
  actions: ["idle", "celebrate", "danger"],
  assets: {
    idle: { asset: "idle.asset" },
    celebrate: { asset: "celebrate.asset" },
    danger: { asset: "danger.asset" }
  }
};

const naruto: CharacterManifest = {
  ...itachi,
  id: "naruto",
  name: "Naruto"
};

test("UserProfile selects the current character from its characterId", () => {
  const resolver = new UserProfileResolver();
  const itachiRuntime = resolver.resolve({
    id: "itachi-profile",
    characterId: "itachi",
    behaviorMapping: {}
  }, itachi);
  const narutoRuntime = resolver.resolve({
    id: "naruto-profile",
    characterId: "naruto",
    behaviorMapping: {}
  }, naruto);

  assert.equal(itachiRuntime.characterId, "itachi");
  assert.equal(narutoRuntime.characterId, "naruto");
});

test("UserProfileResolver preserves valid Action overrides", () => {
  const runtime = new UserProfileResolver().resolve({
    id: "custom",
    characterId: "itachi",
    behaviorMapping: { SUCCESS: "celebrate", ERROR: "danger" }
  }, itachi);

  assert.deepEqual(runtime.behaviorMapping, {
    SUCCESS: "celebrate",
    ERROR: "danger"
  });
});

test("UserProfileResolver rejects actions absent from Character Manifest", () => {
  assert.throws(() => new UserProfileResolver().resolve({
    id: "invalid",
    characterId: "itachi",
    behaviorMapping: { SUCCESS: "unknown" }
  }, itachi), /unsupported action/);
});
