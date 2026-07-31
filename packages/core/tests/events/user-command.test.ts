import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionResolver } from "../../behavior/ActionResolver.js";
import { BehaviorResolver } from "../../behavior/BehaviorResolver.js";
import { EventNormalizer } from "../../events/EventNormalizer.js";
import { UserCommandAdapter } from "../../events/UserCommandAdapter.js";
import { PetCharacter } from "../../runtime/PetCharacter.js";

const actionResolver = new ActionResolver({
  IDLE: "idle",
  THINKING: "thinking",
  EXECUTING: "working",
  SUCCESS: "celebrate",
  ERROR: "danger"
});
const behaviorResolver = new BehaviorResolver({
  "CUSTOM_EVENT:USER_COMMAND:GREET": "THINKING",
  "CUSTOM_EVENT:USER_COMMAND:CELEBRATE": "SUCCESS",
  "CUSTOM_EVENT:USER_COMMAND:ENCOURAGE": "EXECUTING",
  "CUSTOM_EVENT:USER_COMMAND:REST": "IDLE"
});
const adapter = new UserCommandAdapter(new EventNormalizer());

function character(id: string, successAsset: string): PetCharacter {
  return new PetCharacter({
    id,
    name: id,
    version: "1.0.0",
    assetBase: "/pack",
    actions: ["idle", "thinking", "working", "celebrate", "danger"],
    assets: {
      idle: { asset: "idle.asset" },
      thinking: { asset: "thinking.asset" },
      working: { asset: "working.asset" },
      celebrate: { asset: successAsset },
      danger: { asset: "danger.asset" }
    }
  });
}

test("UserCommand CELEBRATE enters the standard Behavior and Action pipeline", () => {
  const event = adapter.toCompanionEvent({
    type: "USER_COMMAND",
    name: "CELEBRATE"
  });
  const slot = behaviorResolver.resolve(event);

  assert.equal(event.type, "CUSTOM_EVENT");
  assert.equal(event.name, "USER_COMMAND:CELEBRATE");
  assert.equal(slot, "SUCCESS");
  assert.equal(actionResolver.resolve(character("itachi", "susanoo.png"), slot).asset, "susanoo.png");
  assert.equal(actionResolver.resolve(character("naruto", "big-rasengan.png"), slot).asset, "big-rasengan.png");
});

test("UserCommand Adapter rejects unsupported commands", () => {
  assert.throws(
    () => adapter.toCompanionEvent({
      type: "USER_COMMAND",
      name: "DANCE"
    } as never),
    /valid UserCommand/
  );
});
