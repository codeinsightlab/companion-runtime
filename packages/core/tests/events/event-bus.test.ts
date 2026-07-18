import assert from "node:assert/strict";
import { test } from "node:test";
import type { CompanionEvent } from "../../events/CompanionEvent.js";
import { EventBus } from "../../events/EventBus.js";

const event: CompanionEvent = {
  id: "event-bus-1",
  type: "TASK_RUNNING",
  source: { app: "test" },
  payload: { taskId: "task-1" },
  timestamp: 100
};

test("EventBus publishes events to subscribers", async () => {
  const bus = new EventBus();
  const received: CompanionEvent[] = [];
  bus.subscribe((publishedEvent) => {
    received.push(publishedEvent);
  });

  await bus.publish(event);

  assert.deepEqual(received, [event]);
});

test("EventBus unsubscribe removes a subscriber", async () => {
  const bus = new EventBus();
  const received: CompanionEvent[] = [];
  const handler = (publishedEvent: CompanionEvent) => {
    received.push(publishedEvent);
  };
  bus.subscribe(handler);

  assert.equal(bus.unsubscribe(handler), true);
  await bus.publish(event);

  assert.deepEqual(received, []);
});

test("EventBus subscribe returns an unsubscribe function", async () => {
  const bus = new EventBus();
  const received: CompanionEvent[] = [];
  const unsubscribe = bus.subscribe((publishedEvent) => {
    received.push(publishedEvent);
  });

  unsubscribe();
  await bus.publish(event);

  assert.deepEqual(received, []);
});
