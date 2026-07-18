import assert from "node:assert/strict";
import { test } from "node:test";
import { BehaviorResolver } from "../../behavior/BehaviorResolver.js";
import type { CompanionEvent } from "../../events/CompanionEvent.js";

const resolver = new BehaviorResolver({
  TASK_START: "THINKING",
  TASK_RUNNING: "EXECUTING",
  TASK_SUCCESS: "SUCCESS",
  TASK_ERROR: "ERROR",
  IDLE: "IDLE"
});

function event(type: CompanionEvent["type"]): CompanionEvent {
  return {
    id: `resolver-${type}`,
    type,
    source: { app: "test" },
    payload: {},
    timestamp: 1
  };
}

test("BehaviorResolver maps TASK_SUCCESS to SUCCESS", () => {
  assert.equal(resolver.resolve(event("TASK_SUCCESS")), "SUCCESS");
});

test("BehaviorResolver maps TASK_ERROR to ERROR", () => {
  assert.equal(resolver.resolve(event("TASK_ERROR")), "ERROR");
});
