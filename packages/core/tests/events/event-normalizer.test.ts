import assert from "node:assert/strict";
import { test } from "node:test";
import { EventNormalizer } from "../../events/EventNormalizer.js";

test("EventNormalizer converts source events to CompanionEvent", () => {
  const normalizer = new EventNormalizer();

  const event = normalizer.normalize({
    id: "normalizer-1",
    source: "mock",
    event: "running",
    payload: { taskId: "task-1" },
    timestamp: 123
  });

  assert.deepEqual(event, {
    id: "normalizer-1",
    type: "TASK_RUNNING",
    source: { app: "mock" },
    payload: { taskId: "task-1" },
    timestamp: 123
  });
});

test("EventNormalizer converts standard types to V1 Runtime event names", () => {
  const normalizer = new EventNormalizer();
  const event = normalizer.normalize({
    id: "normalizer-2",
    source: { app: "mock", platform: "test" },
    event: "TASK_SUCCESS",
    timestamp: 456
  });

  assert.deepEqual(normalizer.toRuntimeMessage(event), {
    event: "task_success",
    payload: {}
  });
});
