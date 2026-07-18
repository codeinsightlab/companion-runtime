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
          { action: "celebrate", weight: 80 },
          { action: "focus", weight: 20 }
        ]
      }
    },
    naruto: {
      style: "energetic",
      actionPreferences: {
        SUCCESS: [
          { action: "celebrate", weight: 70 },
          { action: "celebrate-alt", weight: 30 }
        ]
      }
    },
    itachi: {
      style: "silent",
      actionPreferences: {
        ERROR: [
          { action: "danger", weight: 100 }
        ]
      }
    }
  }
} satisfies PersonalityProfilesConfig;

test("Sasuke SUCCESS can select celebrate from personality preferences", () => {
  const engine = new PetPersonalityEngine({ profiles, random: () => 0.1 });
  const result = engine.selectAction({
    characterId: "sasuke",
    slot: "SUCCESS",
    fallbackAction: "celebrate"
  });

  assert.equal(result.selectedAction, "celebrate");
  assert.equal(result.mood, "focused");
  assert.equal(result.style, "calm");
  assert.equal(result.usedPreference, true);
});

test("Naruto SUCCESS selects configured generic actions by weight", () => {
  const big = new PetPersonalityEngine({ profiles, random: () => 0.69 }).selectAction({
    characterId: "naruto",
    slot: "SUCCESS",
    fallbackAction: "celebrate"
  });
  const clone = new PetPersonalityEngine({ profiles, random: () => 0.71 }).selectAction({
    characterId: "naruto",
    slot: "SUCCESS",
    fallbackAction: "celebrate"
  });

  assert.equal(big.selectedAction, "celebrate");
  assert.equal(clone.selectedAction, "celebrate-alt");
});

test("Itachi ERROR resolves to the generic danger action", () => {
  const engine = new PetPersonalityEngine({ profiles, random: () => 0.99 });
  const result = engine.selectAction({
    characterId: "itachi",
    slot: "ERROR",
    fallbackAction: "danger"
  });

  assert.equal(result.selectedAction, "danger");
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
