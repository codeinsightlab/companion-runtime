import assert from "node:assert/strict";
import { test } from "node:test";
import { JsonProfileStore } from "../profile/storage/JsonProfileStore.js";

function profileDataUrl(): string {
  return `data:application/json,${encodeURIComponent(JSON.stringify({
    id: "default",
    characterId: "sasuke",
    behaviorMapping: {}
  }))}`;
}

test("JsonProfileStore loads, saves, lists and deletes profiles", async () => {
  const store = new JsonProfileStore(profileDataUrl());

  assert.equal((await store.load("default"))?.characterId, "sasuke");
  await store.save({ id: "custom", characterId: "naruto", behaviorMapping: {} });
  assert.equal((await store.load("custom"))?.characterId, "naruto");
  assert.deepEqual((await store.list()).map(({ id }) => id), ["default", "custom"]);
  await store.delete("custom");
  assert.equal(await store.load("custom"), null);
});

test("JsonProfileStore returns detached Profile values", async () => {
  const store = new JsonProfileStore(profileDataUrl());
  const loaded = await store.load("default");
  assert.ok(loaded);
  loaded.characterId = "changed-outside-store";

  assert.equal((await store.load("default"))?.characterId, "sasuke");
});
