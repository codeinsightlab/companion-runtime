import assert from "node:assert/strict";
import { test } from "node:test";
import { MockEventCollector } from "../../../collectors/mock/MockEventCollector.js";
import { EventBus } from "../../events/EventBus.js";
import { EventNormalizer } from "../../events/EventNormalizer.js";
import { BehaviorScheduler } from "../../runtime/BehaviorScheduler.js";
import { PetBehaviorEngine } from "../../runtime/PetBehaviorEngine.js";
import { PetEventAdapter } from "../../runtime/PetEventAdapter.js";
import type { PetState } from "../../types/PetState.js";
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
  const actionsByState: Record<PetState, string> = {
    IDLE: "idle",
    THINKING: "sharingan",
    EXECUTING: "chidori",
    REVIEWING: "code-review",
    SUCCESS: "susanoo",
    ERROR: "crow-dissolve"
  };
  const characterFor = (id: string): PetCharacterLike => ({
    id,
    actionForState(state) {
      return { id: actionsByState[state] };
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
    async changeState(state) {
      this.stateMachine.state = state;
      this.calls.push(["state", state]);
    },
    async changeAction(actionId) {
      this.calls.push(["action", actionId]);
    }
  };
}

const mapping = {
  task_success: { state: "SUCCESS" }
} satisfies EventMapping;

const rules = {
  priorities: {
    IDLE: 0,
    SUCCESS: 80
  },
  events: {
    task_success: {
      state: "SUCCESS",
      duration: 3000,
      recover: "IDLE"
    }
  },
  idle: {
    enabled: false
  }
} satisfies BehaviorRulesConfig;

test("TASK_SUCCESS reaches the existing Adapter and Behavior Engine", async () => {
  const manager = createManager();
  const adapter = new PetEventAdapter({ petManager: manager, mapping });
  const scheduler = new BehaviorScheduler({
    setTimer: () => 1,
    clearTimer: () => undefined
  });
  const behaviorEngine = new PetBehaviorEngine({ petManager: manager, rules, scheduler });
  const normalizer = new EventNormalizer();
  const bus = new EventBus();
  const collector = new MockEventCollector(normalizer);
  collector.onEvent((event) => bus.publish(event));
  bus.subscribe(async (event) => {
    const runtimeMessage = normalizer.toRuntimeMessage(event);
    await adapter.handle(runtimeMessage);
    await behaviorEngine.handleEvent(runtimeMessage);
  });

  await collector.start();
  await collector.emit({
    id: "integration-1",
    type: "TASK_SUCCESS",
    timestamp: 1000
  });
  await collector.stop();

  assert.equal(manager.stateMachine.state, "SUCCESS");
  assert.equal(behaviorEngine.getCurrentBehavior().event, "task_success");
  assert.equal(behaviorEngine.getCurrentBehavior().state, "SUCCESS");
});
