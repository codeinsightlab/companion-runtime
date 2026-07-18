import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionResolver } from "../../behavior/ActionResolver.js";
import { PetCharacter } from "../../runtime/PetCharacter.js";

const resolver = new ActionResolver({
  IDLE: "idle",
  THINKING: "thinking",
  EXECUTING: "working",
  SUCCESS: "celebrate",
  ERROR: "danger"
});

const itachi = new PetCharacter({
  id: "itachi",
  name: "Itachi",
  version: "1.0.0",
  assetBase: "/pack",
  actions: ["idle", "thinking", "working", "celebrate", "danger"],
  assets: {
    idle: { asset: "idle.asset" },
    thinking: { asset: "thinking.asset" },
    working: { asset: "working.asset" },
    celebrate: { asset: "itachi-success.asset" },
    danger: { asset: "itachi-error.asset" }
  }
});

const naruto = new PetCharacter({
  id: "naruto",
  name: "Naruto",
  version: "1.0.0",
  assetBase: "/pack",
  actions: ["idle", "thinking", "working", "celebrate", "danger"],
  assets: {
    idle: { asset: "idle.asset" },
    thinking: { asset: "thinking.asset" },
    working: { asset: "working.asset" },
    celebrate: { asset: "naruto-success.asset" },
    danger: { asset: "naruto-error.asset" }
  }
});

test("ActionResolver uses user override before character and Runtime defaults", () => {
  const configuredCharacter = new PetCharacter({
    id: "configured",
    name: "Configured",
    version: "1.0.0",
    assetBase: "/pack",
    actions: ["idle", "pack-success", "user-success"],
    behaviorMapping: { SUCCESS: "pack-success" },
    assets: {
      idle: { asset: "idle.asset" },
      "pack-success": { asset: "pack-success.asset" },
      "user-success": { asset: "user-success.asset" }
    }
  });
  const overrideResolver = new ActionResolver({
    IDLE: "idle",
    THINKING: "idle",
    EXECUTING: "idle",
    SUCCESS: "idle",
    ERROR: "idle"
  }, { SUCCESS: "user-success" });

  assert.equal(overrideResolver.resolve(configuredCharacter, "SUCCESS").id, "user-success");
});

test("ActionResolver uses Character default before Runtime default", () => {
  const configuredCharacter = new PetCharacter({
    id: "configured",
    name: "Configured",
    version: "1.0.0",
    assetBase: "/pack",
    actions: ["idle", "pack-success"],
    behaviorMapping: { SUCCESS: "pack-success" },
    assets: {
      idle: { asset: "idle.asset" },
      "pack-success": { asset: "pack-success.asset" }
    }
  });

  assert.equal(resolver.resolve(configuredCharacter, "SUCCESS").id, "pack-success");
});

test("ActionResolver reports a clear error when no mapping exists", () => {
  const unmappedCharacter = new PetCharacter({
    id: "unmapped",
    name: "Unmapped",
    version: "1.0.0",
    assetBase: "/pack",
    actions: ["idle"],
    assets: { idle: { asset: "idle.asset" } }
  });

  assert.throws(
    () => new ActionResolver({}).resolve(unmappedCharacter, "SUCCESS"),
    /No Action mapping for Behavior Slot "SUCCESS"/
  );
});

test("ActionResolver resolves the same slot through each Character Pack", () => {
  const itachiAction = resolver.resolve(itachi, "SUCCESS");
  const narutoAction = resolver.resolve(naruto, "SUCCESS");

  assert.equal(itachiAction.id, "celebrate");
  assert.equal(narutoAction.id, "celebrate");
  assert.equal(itachiAction.asset, "itachi-success.asset");
  assert.equal(narutoAction.asset, "naruto-success.asset");
});
