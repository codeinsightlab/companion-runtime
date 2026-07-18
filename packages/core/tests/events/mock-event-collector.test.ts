import assert from "node:assert/strict";
import { test } from "node:test";
import type { CompanionEvent } from "../../events/CompanionEvent.js";
import { EventBus } from "../../events/EventBus.js";
import { MockEventCollector } from "../../../collectors/mock/MockEventCollector.js";

test("MockEventCollector sends emitted events through EventBus", async () => {
  const bus = new EventBus();
  const collector = new MockEventCollector();
  const received: CompanionEvent[] = [];
  collector.onEvent((event) => bus.publish(event));
  bus.subscribe((event) => {
    received.push(event);
  });

  await collector.start();
  const emitted = await collector.emit({
    id: "mock-1",
    type: "TASK_RUNNING",
    payload: { taskId: "task-1" },
    timestamp: 789
  });
  await collector.stop();

  assert.equal(received.length, 1);
  assert.equal(received[0], emitted);
  assert.equal(emitted.type, "TASK_RUNNING");
  assert.deepEqual(emitted.source, { app: "mock", collector: "mock" });
});

test("MockEventCollector requires start before emit", async () => {
  const collector = new MockEventCollector();

  await assert.rejects(
    collector.emit({ type: "TASK_START" }),
    /must be started/
  );
});
