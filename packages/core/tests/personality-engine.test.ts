import assert from "node:assert/strict";
import { test } from "node:test";
import { PetPersonalityEngine } from "../runtime/PetPersonalityEngine.js";
import type { PersonalityProfilesConfig } from "../types/RuntimeTypes.js";

const profiles = {
  defaultMood: "normal",
  moods: ["normal", "focused", "excited", "alert", "sleepy"],
  characters: {
    sasuke: {
      style: "calm",
      mood: "focused",
      actionPreferences: {
        SUCCESS: [
          { action: "susanoo", weight: 80 },
          { action: "code-focus", weight: 20 }
        ]
      }
    },
    naruto: {
      style: "energetic",
      actionPreferences: {
        SUCCESS: [
          { action: "big-rasengan", weight: 70 },
          { action: "shadow-clone", weight: 30 }
        ]
      }
    },
    itachi: {
      style: "silent",
      actionPreferences: {
        ERROR: [
          { action: "crow-dissolve", weight: 100 }
        ]
      }
    }
  }
} satisfies PersonalityProfilesConfig;

test("Sasuke SUCCESS can select susanoo from personality preferences", () => {
  const engine = new PetPersonalityEngine({ profiles, random: () => 0.1 });
  const result = engine.selectAction({
    characterId: "sasuke",
    state: "SUCCESS",
    fallbackAction: "susanoo"
  });

  assert.equal(result.selectedAction, "susanoo");
  assert.equal(result.mood, "focused");
  assert.equal(result.style, "calm");
  assert.equal(result.usedPreference, true);
});

test("Naruto SUCCESS can select big-rasengan or shadow-clone by weight", () => {
  const big = new PetPersonalityEngine({ profiles, random: () => 0.69 }).selectAction({
    characterId: "naruto",
    state: "SUCCESS",
    fallbackAction: "big-rasengan"
  });
  const clone = new PetPersonalityEngine({ profiles, random: () => 0.71 }).selectAction({
    characterId: "naruto",
    state: "SUCCESS",
    fallbackAction: "big-rasengan"
  });

  assert.equal(big.selectedAction, "big-rasengan");
  assert.equal(clone.selectedAction, "shadow-clone");
});

test("Itachi ERROR is fixed to crow-dissolve", () => {
  const engine = new PetPersonalityEngine({ profiles, random: () => 0.99 });
  const result = engine.selectAction({
    characterId: "itachi",
    state: "ERROR",
    fallbackAction: "crow-dissolve"
  });

  assert.equal(result.selectedAction, "crow-dissolve");
  assert.equal(result.usedPreference, true);
});

test("weighted selection uses cumulative weights", () => {
  const options = [
    { action: "a", weight: 70 },
    { action: "b", weight: 30 }
  ];

  assert.equal(PetPersonalityEngine.selectWeighted(options, () => 0)?.action, "a");
  assert.equal(PetPersonalityEngine.selectWeighted(options, () => 0.699)?.action, "a");
  assert.equal(PetPersonalityEngine.selectWeighted(options, () => 0.7)?.action, "b");
  assert.equal(PetPersonalityEngine.selectWeighted(options, () => 0.999)?.action, "b");
});
