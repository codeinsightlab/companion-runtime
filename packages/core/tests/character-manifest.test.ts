import assert from "node:assert/strict";
import { test } from "node:test";
import { PetCharacter } from "../runtime/PetCharacter.js";

test("Character Manifest loads declared capabilities and assets", () => {
  const character = new PetCharacter({
    id: "manifest-pet",
    name: "Manifest Pet",
    version: "1.0.0",
    assetBase: "/character-pack",
    actions: ["idle", "celebrate"],
    assets: {
      idle: { asset: "idle.png" },
      celebrate: { asset: "celebrate.png" }
    },
    behaviorMapping: { SUCCESS: "celebrate" }
  });

  assert.equal(character.version, "1.0.0");
  assert.deepEqual(character.listActions(), ["idle", "celebrate"]);
  assert.equal(character.getAction("celebrate").asset, "celebrate.png");
  assert.equal(character.behaviorMapping.SUCCESS, "celebrate");
});

test("Character Manifest rejects a capability without an asset", () => {
  assert.throws(() => new PetCharacter({
    id: "invalid",
    name: "Invalid",
    version: "1.0.0",
    assetBase: "/character-pack",
    actions: ["idle"],
    assets: {}
  }), /has no asset definition/);
});
