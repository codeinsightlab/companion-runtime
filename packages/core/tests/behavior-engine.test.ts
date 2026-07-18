import assert from "node:assert/strict";
import { test } from "node:test";
import { PetBehaviorEngine } from "../runtime/PetBehaviorEngine.js";
import { BehaviorScheduler } from "../runtime/BehaviorScheduler.js";
import type { PetState } from "../types/PetState.js";
import type {
  BehaviorRulesConfig,
  PetCharacterLike,
  PetManagerLike
} from "../types/RuntimeTypes.js";

const rules = {
  priorities: {
    IDLE: 0,
    THINKING: 20,
    EXECUTING: 40,
    REVIEWING: 60,
    SUCCESS: 80,
    ERROR: 100
  },
  events: {
    task_start: { state: "THINKING" },
    task_running: { state: "EXECUTING" },
    task_success: { state: "SUCCESS", duration: 3000, recover: "IDLE" },
    task_error: { character: "itachi", state: "ERROR", duration: 5000, recover: "IDLE" }
  },
  cooldown: {
    SUCCESS: 5000
  },
  idle: {
    enabled: false
  }
} satisfies BehaviorRulesConfig;

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
  const actionsByState: Record<PetState, string> = {
    IDLE: "idle",
    THINKING: "sharingan",
    EXECUTING: "chidori",
    REVIEWING: "code-review",
    SUCCESS: "susanoo",
    ERROR: "crow-dissolve"
  };
  const characterFor = (characterId: string): PetCharacterLike => ({
    id: characterId,
    actionForState(state) {
      return { id: actionsByState[state] ?? "idle" };
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
    async changeAction(action) {
      this.calls.push(["action", action]);
    }
  };
}

test("SUCCESS enters success and recovers to IDLE after duration", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = new PetBehaviorEngine({ petManager: manager, rules, scheduler: timers.scheduler });

  const result = await engine.handleEvent({ event: "task_success" });
  assert.equal(result.accepted, true);
  assert.equal(manager.stateMachine.state, "SUCCESS");

  await timers.tick(2999);
  assert.equal(manager.stateMachine.state, "SUCCESS");

  await timers.tick(1);
  assert.equal(manager.stateMachine.state, "IDLE");
  assert.equal(engine.getCurrentBehavior().recoveredFrom, "task_success");
});

test("ERROR interrupts EXECUTING and switches to Itachi", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = new PetBehaviorEngine({ petManager: manager, rules, scheduler: timers.scheduler });

  await engine.handleEvent({ event: "task_running" });
  assert.equal(manager.stateMachine.state, "EXECUTING");

  const result = await engine.handleEvent({ event: "task_error" });
  assert.equal(result.accepted, true);
  assert.equal(manager.character.id, "itachi");
  assert.equal(manager.stateMachine.state, "ERROR");
});

test("SUCCESS cooldown blocks repeated success events", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = new PetBehaviorEngine({ petManager: manager, rules, scheduler: timers.scheduler });

  await engine.handleEvent({ event: "task_success" });
  const result = await engine.handleEvent({ event: "task_success" });

  assert.equal(result.accepted, false);
  assert.equal(result.accepted ? undefined : result.reason, "cooldown");
});

test("priority order keeps lower-priority EXECUTING from interrupting SUCCESS but allows ERROR", async () => {
  const manager = createManager();
  const timers = createTimerHarness();
  const engine = new PetBehaviorEngine({ petManager: manager, rules, scheduler: timers.scheduler });

  await engine.handleEvent({ event: "task_success" });
  const lower = await engine.handleEvent({ event: "task_running" });
  assert.equal(lower.accepted, false);
  assert.equal(lower.accepted ? undefined : lower.reason, "priority");
  assert.equal(manager.stateMachine.state, "SUCCESS");

  const higher = await engine.handleEvent({ event: "task_error" });
  assert.equal(higher.accepted, true);
  assert.equal(manager.stateMachine.state, "ERROR");
});
