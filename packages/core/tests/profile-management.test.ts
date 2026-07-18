import assert from "node:assert/strict";
import { test } from "node:test";
import { ProfileManager } from "../profile/ProfileManager.js";
import { JsonProfileStore } from "../profile/storage/JsonProfileStore.js";
import type { CharacterManifest } from "../types/CharacterManifest.js";

const sasuke: CharacterManifest = {
  id: "sasuke",
  name: "Sasuke",
  version: "1.0.0",
  actions: ["idle", "celebrate"],
  assets: {
    idle: { asset: "idle.asset" },
    celebrate: { asset: "celebrate.asset" }
  }
};

const naruto: CharacterManifest = {
  ...sasuke,
  id: "naruto",
  name: "Naruto"
};

function createManager(profile = {
  id: "default",
  characterId: "sasuke",
  behaviorMapping: { SUCCESS: "celebrate" }
}): { manager: ProfileManager; store: JsonProfileStore } {
  const url = `data:application/json,${encodeURIComponent(JSON.stringify(profile))}`;
  const store = new JsonProfileStore(url);
  return {
    store,
    manager: new ProfileManager(store, new Map([
      [sasuke.id, sasuke],
      [naruto.id, naruto]
    ]))
  };
}

test("ProfileManager loads the current Profile", async () => {
  const { manager } = createManager();
  const runtime = await manager.loadProfile("default");

  assert.equal(runtime.characterId, "sasuke");
  assert.equal(manager.getCurrentProfile()?.id, "default");
});

test("ProfileManager switches character, saves and notifies Runtime", async () => {
  const { manager, store } = createManager();
  await manager.loadProfile("default");
  let notifiedCharacter: string | undefined;
  manager.onChange((runtime) => {
    notifiedCharacter = runtime.characterId;
  });

  await manager.switchCharacter("naruto");

  assert.equal(manager.getCurrentProfile()?.characterId, "naruto");
  assert.equal((await store.load("default"))?.characterId, "naruto");
  assert.equal(notifiedCharacter, "naruto");
  assert.deepEqual(manager.getCurrentProfile()?.behaviorMapping, {});
});

test("Profile export can be imported without data loss", async () => {
  const { manager, store } = createManager();
  await manager.loadProfile("default");
  const exported = await manager.exportProfile();
  await store.delete("default");
  const imported = await manager.importProfile(exported);

  assert.deepEqual(imported, {
    id: "default",
    characterId: "sasuke",
    behaviorMapping: { SUCCESS: "celebrate" }
  });
  assert.deepEqual(await store.load("default"), imported);
});

test("Profile import rejects invalid JSON, characters, slots and actions", async () => {
  const { manager } = createManager();

  await assert.rejects(() => manager.importProfile("{"), /Invalid User Profile JSON/);
  await assert.rejects(() => manager.importProfile(JSON.stringify({
    id: "bad-character",
    characterId: "unknown",
    behaviorMapping: {}
  })), /Unknown character/);
  await assert.rejects(() => manager.importProfile(JSON.stringify({
    id: "bad-slot",
    characterId: "sasuke",
    behaviorMapping: { REVIEWING: "idle" }
  })), /Invalid Behavior Slot/);
  await assert.rejects(() => manager.importProfile(JSON.stringify({
    id: "bad-action",
    characterId: "sasuke",
    behaviorMapping: { SUCCESS: "unknown" }
  })), /does not support action/);
});
