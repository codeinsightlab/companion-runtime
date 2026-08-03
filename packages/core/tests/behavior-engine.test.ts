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
  BehaviorSchedulerLike,
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
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
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

test("persistent SYSTEM execution hands off to the next queued SYSTEM event", async () => {
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

  assert.equal(result.status, "queued");
  assert.equal(engine.pendingQueue.length, 1);
  await timers.tick(3000);
  assert.equal(engine.pendingQueue.length, 0);
  assert.equal(manager.stateMachine.state, "IDLE");
});

test("SYSTEM events queue behind temporary SYSTEM execution and preserve FIFO", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createEngine(manager, timers.scheduler);

  await engine.handleEvent(companionEvent("TASK_SUCCESS"));
  const lower = await engine.handleEvent(companionEvent("TASK_RUNNING"));
  assert.equal(lower.status, "queued");
  assert.equal(manager.stateMachine.state, "SUCCESS");

  const higher = await engine.handleEvent(companionEvent("TASK_ERROR"));
  assert.equal(higher.status, "queued");
  assert.equal(engine.pendingQueue.length, 2);
  await timers.tick(3000);
  assert.equal(manager.stateMachine.state, "ERROR");
  assert.equal(engine.pendingQueue.length, 0);
});

const userEventMapping = {
  ...eventMapping,
  "CUSTOM_EVENT:USER_COMMAND:GREET": "THINKING",
  "CUSTOM_EVENT:USER_COMMAND:CELEBRATE": "SUCCESS",
  "CUSTOM_EVENT:USER_COMMAND:REST": "IDLE"
} satisfies EventMapping;

const ownershipRules = {
  ...rules,
  events: {
    ...rules.events,
    "CUSTOM_EVENT:USER_COMMAND:GREET": {
      duration: 1200,
      recover: "IDLE",
      cooldownKey: "USER_GREET"
    },
    "CUSTOM_EVENT:USER_COMMAND:CELEBRATE": {
      duration: 3000,
      recover: "IDLE",
      cooldownKey: "USER_CELEBRATE"
    },
    "CUSTOM_EVENT:USER_COMMAND:REST": {
      duration: 600,
      recover: "IDLE",
      cooldownKey: "USER_REST"
    }
  }
} satisfies BehaviorRulesConfig;

function userCommand(name: "GREET" | "CELEBRATE" | "REST"): CompanionEvent {
  return {
    id: `user-${name}`,
    type: "CUSTOM_EVENT",
    name: `USER_COMMAND:${name}`,
    source: { app: "companion-control-surface" },
    payload: {},
    timestamp: 1
  };
}

function createOwnershipEngine(
  manager: TestManager,
  scheduler: BehaviorSchedulerLike
): PetBehaviorEngine {
  return new PetBehaviorEngine({
    petManager: manager,
    rules: ownershipRules,
    behaviorResolver: new BehaviorResolver(userEventMapping),
    scheduler
  });
}

test("USER replaces USER and rapid switching ends at REST", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createOwnershipEngine(manager, timers.scheduler);

  const [greet, celebrate, rest] = await Promise.all([
    engine.handleEvent(userCommand("GREET")),
    engine.handleEvent(userCommand("CELEBRATE")),
    engine.handleEvent(userCommand("REST"))
  ]);

  assert.equal(greet.status, "accepted");
  assert.equal(celebrate.status, "replaced");
  assert.equal(rest.status, "replaced");
  assert.equal(engine.currentExecution?.source, "USER");
  assert.equal(engine.currentExecution?.triggerName, "REST");
  assert.equal(manager.stateMachine.state, "IDLE");
  assert.equal(engine.pendingQueue.length, 0);
});

test("SYSTEM execution protects itself and queues latest USER command", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createOwnershipEngine(manager, timers.scheduler);

  await engine.handleEvent(companionEvent("TASK_ERROR"));
  const first = await engine.handleEvent(userCommand("GREET"));
  const latest = await engine.handleEvent(userCommand("CELEBRATE"));

  assert.equal(first.status, "queued");
  assert.equal(latest.status, "queued");
  assert.equal(manager.stateMachine.state, "ERROR");
  assert.equal(engine.pendingQueue.length, 1);
  assert.equal(engine.pendingQueue[0]?.triggerName, "CELEBRATE");

  await timers.tick(5000);
  assert.equal(manager.stateMachine.state, "SUCCESS");
  assert.equal(engine.currentExecution?.source, "USER");
});

test("temporary USER behavior recovers to IDLE", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = createOwnershipEngine(manager, timers.scheduler);

  await engine.handleEvent(userCommand("CELEBRATE"));
  assert.equal(manager.stateMachine.state, "SUCCESS");
  await timers.tick(3000);

  assert.equal(manager.stateMachine.state, "IDLE");
  assert.equal(engine.currentExecution, undefined);
  assert.equal(engine.getCurrentBehavior().recoveredFrom, "CUSTOM_EVENT:USER_COMMAND:CELEBRATE");
});

test("USER command exposes a factual active Behavior reason", async () => {
  const engine = createOwnershipEngine(createManager(), createTimerHarness().scheduler);

  await engine.handleEvent(userCommand("CELEBRATE"));

  assert.deepEqual(engine.activeBehaviorView, {
    behaviorSlot: "SUCCESS",
    source: "USER",
    triggerName: "CELEBRATE",
    reason: "用户请求庆祝",
    startedAt: engine.currentExecution?.startedAt
  });
});

test("SYSTEM reason follows the active execution and replaces long-running task reason", async () => {
  const engine = createOwnershipEngine(createManager(), createTimerHarness().scheduler);

  await engine.handleEvent(companionEvent("TASK_RUNNING"));
  assert.equal(engine.activeBehaviorView?.reason, "正在执行任务");

  await engine.handleEvent(companionEvent("TASK_SUCCESS"));
  for (let index = 0; index < 3; index += 1) await Promise.resolve();
  assert.equal(engine.activeBehaviorView?.triggerName, "TASK_SUCCESS");
  assert.equal(engine.activeBehaviorView?.reason, "任务执行成功");
});

test("Behavior reason ignores pending USER commands behind SYSTEM execution", async () => {
  const engine = createOwnershipEngine(createManager(), createTimerHarness().scheduler);

  await engine.handleEvent(companionEvent("TASK_RUNNING"));
  const queued = await engine.handleEvent(userCommand("CELEBRATE"));

  assert.equal(queued.status, "queued");
  assert.equal(engine.activeBehaviorView?.reason, "正在执行任务");
  assert.equal(engine.pendingQueue[0]?.reason, "用户请求庆祝");
  assert.equal(engine.currentFeedback?.reason, "正在执行任务");
});

test("temporary Feedback uses its own duration instead of USER Behavior duration", async () => {
  const timers = createTimerHarness();
  const engine = createOwnershipEngine(createManager(), timers.scheduler);

  await engine.handleEvent(userCommand("GREET"));
  assert.equal(engine.currentFeedback?.duration, 3000);
  assert.equal(engine.currentFeedback?.reason, "用户请求打招呼");

  await timers.tick(1200);
  assert.equal(engine.currentExecution, undefined);
  assert.equal(engine.currentFeedback?.reason, "用户请求打招呼");

  await timers.tick(1799);
  assert.ok(engine.currentFeedback);
  await timers.tick(1);
  assert.equal(engine.currentFeedback, undefined);
});

test("SYSTEM warning Feedback covers its configured temporary Behavior window", async () => {
  const timers = createTimerHarness();
  const engine = createEngine(createManager(), timers.scheduler);

  await engine.handleEvent(companionEvent("TASK_ERROR"));
  assert.equal(engine.currentFeedback?.reason, "任务执行异常");
  assert.equal(engine.currentFeedback?.duration, 5000);

  await timers.tick(4999);
  assert.equal(engine.currentFeedback?.reason, "任务执行异常");
  await timers.tick(1);
  assert.equal(engine.currentFeedback, undefined);
});

test("persistent Feedback is replaced without an empty handoff event", async () => {
  const engine = createOwnershipEngine(createManager(), createTimerHarness().scheduler);
  const feedback: Array<string | undefined> = [];
  engine.addEventListener("feedbackchanged", (event) => {
    const detail = (event as CustomEvent<{ feedback?: { reason: string } }>).detail;
    feedback.push(detail.feedback?.reason);
  });

  await engine.handleEvent(companionEvent("TASK_RUNNING"));
  assert.equal(engine.currentFeedback?.mode, "PERSISTENT");
  await engine.handleEvent(companionEvent("TASK_SUCCESS"));
  for (let index = 0; index < 3; index += 1) await Promise.resolve();

  assert.deepEqual(feedback, ["正在执行任务", "任务执行成功"]);
  assert.equal(engine.currentFeedback?.mode, "TEMPORARY");
});

test("stale recovery cannot mutate a replacement execution", async () => {
  let staleRecovery: (() => void) | undefined;
  const scheduler: BehaviorSchedulerLike = {
    clearRecovery: () => undefined,
    scheduleRecovery: (_duration, callback) => { staleRecovery = callback; },
    clearFeedback: () => undefined,
    scheduleFeedback: () => undefined,
    scheduleIdle: () => undefined,
    markCooldown: () => undefined,
    isCoolingDown: () => false,
    stop: () => undefined
  };
  const manager = createManager();
  const engine = createOwnershipEngine(manager, scheduler);

  await engine.handleEvent(userCommand("CELEBRATE"));
  const obsoleteRecovery = staleRecovery;
  await engine.handleEvent(userCommand("GREET"));
  obsoleteRecovery?.();
  for (let index = 0; index < 3; index += 1) await Promise.resolve();

  assert.equal(engine.currentExecution?.triggerName, "GREET");
  assert.equal(manager.stateMachine.state, "THINKING");
  assert.equal(engine.currentFeedback?.reason, "用户请求打招呼");
});

test("idle scheduler resolves a configured Event to a Behavior Slot and stops cleanly", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const resolved: CompanionEvent["type"][] = [];
  const engine = new PetBehaviorEngine({
    petManager: manager,
    rules: {
      ...rules,
      idle: {
        enabled: true,
        timeout: 100,
        idleActions: [{ slot: "THINKING", event: "TASK_START", weight: 1 }]
      }
    },
    behaviorResolver: {
      resolve(event) {
        resolved.push(event.type);
        switch (event.type) {
          case "TASK_START": return "THINKING";
          case "TASK_RUNNING": return "EXECUTING";
          case "TASK_SUCCESS": return "SUCCESS";
          case "TASK_ERROR": return "ERROR";
          default: return "IDLE";
        }
      },
      supports: () => true
    },
    scheduler: timers.scheduler
  });

  engine.start();
  await timers.tick(100);
  assert.deepEqual(resolved, ["TASK_START"]);
  assert.equal(manager.stateMachine.state, "THINKING");
  assert.ok(manager.calls.some(([kind, value]) => kind === "behavior" && value === "THINKING"));
  engine.stop();
  await timers.tick(1000);
  assert.deepEqual(resolved, ["TASK_START"]);
});
