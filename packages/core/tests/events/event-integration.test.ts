import assert from "node:assert/strict";
import { test } from "node:test";
import { BehaviorResolver } from "../../behavior/BehaviorResolver.js";
import { MockEventCollector } from "../../../collectors/mock/MockEventCollector.js";
import { EventBus } from "../../events/EventBus.js";
import { BehaviorScheduler } from "../../runtime/BehaviorScheduler.js";
import { PetBehaviorEngine } from "../../runtime/PetBehaviorEngine.js";
import { PetEventAdapter } from "../../runtime/PetEventAdapter.js";
import type { BehaviorSlot } from "../../types/BehaviorSlot.js";
import type { PetAction } from "../../types/PetAction.js";
import type {
  BehaviorRulesConfig,
  EventMapping,
  PetCharacterLike,
  PetManagerLike
} from "../../types/RuntimeTypes.js";

interface IntegrationManager extends PetManagerLike {
  calls: Array<[string, string]>;
}

function createManager(): IntegrationManager {
  const actionsBySlot: Record<BehaviorSlot, string> = {
    IDLE: "idle",
    THINKING: "thinking",
    EXECUTING: "working",
    SUCCESS: "celebrate",
    ERROR: "danger"
  };
  const actionFor = (characterId: string, actionId: string): PetAction => ({
    id: actionId,
    asset: `${actionId}.asset`,
    characterId,
    assetBase: "/assets",
    src: `/assets/${characterId}/${actionId}.asset`
  });
  const characterFor = (id: string): PetCharacterLike => ({
    id,
    getAction(actionId) {
      return actionFor(id, actionId);
    }
  });
  return {
    character: characterFor("sasuke"),
    stateMachine: { state: "IDLE" },
    calls: [],
    async changeCharacter(characterId) {
      this.character = characterFor(characterId);
      this.calls.push(["character", characterId]);
    },
    async changeBehavior(slot) {
      this.stateMachine.state = slot;
      this.calls.push(["behavior", slot]);
    },
    async changeAction(actionId) {
      this.calls.push(["action", actionId]);
    },
    resolveAction(slot) {
      return this.character.getAction(actionsBySlot[slot]);
    }
  };
}

const mapping = {
  TASK_SUCCESS: "SUCCESS"
} satisfies EventMapping;

const rules = {
  priorities: {
    IDLE: 0,
    SUCCESS: 80
  },
  events: {
    TASK_SUCCESS: {
      duration: 3000,
      recover: "IDLE"
    }
  },
  idle: {
    enabled: false
  }
} satisfies BehaviorRulesConfig;

test("TASK_SUCCESS reaches Behavior Slot without selecting a character", async () => {
  const manager = createManager();
  const behaviorResolver = new BehaviorResolver(mapping);
  const adapter = new PetEventAdapter({ petManager: manager, behaviorResolver });
  const scheduler = new BehaviorScheduler({
    setTimer: () => 1,
    clearTimer: () => undefined
  });
  const behaviorEngine = new PetBehaviorEngine({
    petManager: manager,
    rules,
    behaviorResolver,
    scheduler
  });
  const bus = new EventBus();
  const collector = new MockEventCollector();
  collector.onEvent((event) => bus.publish(event));
  bus.subscribe(async (event) => {
    await adapter.handle(event);
    await behaviorEngine.handleEvent(event);
  });

  await collector.start();
  await collector.emit({
    id: "integration-1",
    type: "TASK_SUCCESS",
    timestamp: 1000
  });
  await collector.stop();

  assert.equal(manager.character.id, "sasuke");
  assert.equal(manager.stateMachine.state, "SUCCESS");
  assert.equal(behaviorEngine.getCurrentBehavior().event, "TASK_SUCCESS");
  assert.equal(behaviorEngine.getCurrentBehavior().slot, "SUCCESS");
  assert.equal(manager.calls.some(([kind]) => kind === "character"), false);
});
