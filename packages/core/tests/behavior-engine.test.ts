import assert from "node:assert/strict";
import { test } from "node:test";
import { BehaviorResolver } from "../behavior/BehaviorResolver.js";
import { BehaviorScheduler } from "../runtime/BehaviorScheduler.js";
import { PetBehaviorEngine } from "../runtime/PetBehaviorEngine.js";
import type { CompanionEvent } from "../events/CompanionEvent.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";
import type { PetAction } from "../types/PetAction.js";
import type {
  BehaviorRulesConfig,
  EventMapping,
  PetCharacterLike,
  PetManagerLike
} from "../types/RuntimeTypes.js";

const eventMapping = {
  TASK_START: "THINKING",
  TASK_RUNNING: "EXECUTING",
  TASK_SUCCESS: "SUCCESS",
  TASK_ERROR: "ERROR",
  IDLE: "IDLE"
} satisfies EventMapping;

const rules = {
  priorities: {
    IDLE: 0,
    THINKING: 20,
    EXECUTING: 40,
    SUCCESS: 80,
    ERROR: 100
  },
  events: {
    TASK_START: {},
    TASK_RUNNING: {},
    TASK_SUCCESS: { duration: 3000, recover: "IDLE" },
    TASK_ERROR: { duration: 5000, recover: "IDLE" }
  },
  cooldown: {
    SUCCESS: 5000
  },
  idle: {
    enabled: false
  }
} satisfies BehaviorRulesConfig;

function companionEvent(type: CompanionEvent["type"]): CompanionEvent {
  return {
    id: `event-${type}`,
    type,
    source: { app: "test" },
    payload: {},
    timestamp: 1
  };
}

function createTimerHarness(): {
  scheduler: BehaviorScheduler;
  tick(ms: number): Promise<void>;
} {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { callback: () => void; due: number }>();
  return {
    scheduler: new BehaviorScheduler({
      now: () => now,
      setTimer: (callback, delay) => {
        const id = nextId++;
        timers.set(id, { callback, due: now + delay });
        return id;
      },
      clearTimer: (id) => {
        if (typeof id === "number") timers.delete(id);
      }
    }),
    tick: async (ms) => {
      now += ms;
      const due = [...timers.entries()].filter(([, timer]) => timer.due <= now);
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.callback();
      }
      await Promise.resolve();
    }
  };
}

interface TestManager extends PetManagerLike {
  calls: Array<[string, string]>;
}

function createManager(): TestManager {
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
  const characterFor = (characterId: string): PetCharacterLike => ({
    id: characterId,
    getAction(actionId) {
      return actionFor(characterId, actionId);
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

function createEngine(manager: TestManager, scheduler: BehaviorScheduler): PetBehaviorEngine {
  return new PetBehaviorEngine({
    petManager: manager,
    rules,
    behaviorResolver: new BehaviorResolver(eventMapping),
    scheduler
  });
}

test("SUCCESS enters success and recovers to IDLE after duration", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createEngine(manager, timers.scheduler);

  const result = await engine.handleEvent(companionEvent("TASK_SUCCESS"));
  assert.equal(result.accepted, true);
  assert.equal(manager.stateMachine.state, "SUCCESS");

  await timers.tick(2999);
  assert.equal(manager.stateMachine.state, "SUCCESS");

  await timers.tick(1);
  assert.equal(manager.stateMachine.state, "IDLE");
  assert.equal(engine.getCurrentBehavior().recoveredFrom, "TASK_SUCCESS");
});

test("ERROR interrupts EXECUTING without changing character", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createEngine(manager, timers.scheduler);

  await engine.handleEvent(companionEvent("TASK_RUNNING"));
  const result = await engine.handleEvent(companionEvent("TASK_ERROR"));

  assert.equal(result.accepted, true);
  assert.equal(manager.character.id, "sasuke");
  assert.equal(manager.stateMachine.state, "ERROR");
  assert.equal(manager.calls.some(([kind]) => kind === "character"), false);
});

test("SUCCESS cooldown blocks repeated success events", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createEngine(manager, timers.scheduler);

  await engine.handleEvent(companionEvent("TASK_SUCCESS"));
  const result = await engine.handleEvent(companionEvent("TASK_SUCCESS"));

  assert.equal(result.accepted, false);
  assert.equal(result.accepted ? undefined : result.reason, "cooldown");
});

test("priority keeps EXECUTING from interrupting SUCCESS but allows ERROR", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createEngine(manager, timers.scheduler);

  await engine.handleEvent(companionEvent("TASK_SUCCESS"));
  const lower = await engine.handleEvent(companionEvent("TASK_RUNNING"));
  assert.equal(lower.accepted, false);
  assert.equal(lower.accepted ? undefined : lower.reason, "priority");
  assert.equal(manager.stateMachine.state, "SUCCESS");

  const higher = await engine.handleEvent(companionEvent("TASK_ERROR"));
  assert.equal(higher.accepted, true);
  assert.equal(manager.stateMachine.state, "ERROR");
});
