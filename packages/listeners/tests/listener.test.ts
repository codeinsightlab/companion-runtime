import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionResolver } from "../../core/behavior/ActionResolver.js";
import { BehaviorResolver } from "../../core/behavior/BehaviorResolver.js";
import { CompanionRuntime } from "../../core/bootstrap/CompanionRuntime.js";
import { EventBus } from "../../core/events/EventBus.js";
import { EventNormalizer } from "../../core/events/EventNormalizer.js";
import { PetBehaviorEngine } from "../../core/runtime/PetBehaviorEngine.js";
import { PetCharacter } from "../../core/runtime/PetCharacter.js";
import type { BehaviorSlot } from "../../core/types/BehaviorSlot.js";
import type { ExternalEvent } from "../core/ExternalEvent.js";
import { createExternalEvent } from "../core/ExternalEvent.js";
import { ExternalEventMapper } from "../core/ExternalEventMapper.js";
import type { ExternalEventHandler, Listener } from "../core/Listener.js";
import { ListenerManager } from "../core/ListenerManager.js";
import { MacSystemListener } from "../system/macos/MacSystemListener.js";
import type { SystemMetricsProvider } from "../system/macos/MacSystemListener.js";

class TestListener implements Listener {
  readonly id: string;
  readonly handlers = new Set<ExternalEventHandler>();
  starts = 0;
  stops = 0;

  constructor(id = "test-listener") {
    this.id = id;
  }

  async start(): Promise<void> {
    this.starts += 1;
  }

  async stop(): Promise<void> {
    this.stops += 1;
  }

  onEvent(handler: ExternalEventHandler): void {
    this.handlers.add(handler);
  }

  emit(event: ExternalEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

test("Listener supports start, stop and External Event callbacks", async () => {
  const listener = new TestListener();
  let received: ExternalEvent | undefined;
  listener.onEvent((event) => {
    received = event;
  });

  await listener.start();
  listener.emit(createExternalEvent({ source: "test", name: "changed", payload: { value: 1 } }));
  await listener.stop();

  assert.equal(listener.starts, 1);
  assert.equal(listener.stops, 1);
  assert.equal(received?.source, "test");
  assert.equal(received?.name, "changed");
});

test("ListenerManager registers and manages all Listener lifecycles", async () => {
  const first = new TestListener("first");
  const second = new TestListener("second");
  const manager = new ListenerManager();
  manager.register(first);
  manager.register(second);

  await manager.startAll();
  assert.equal(manager.started, true);
  assert.deepEqual([first.starts, second.starts], [1, 1]);

  await manager.stopAll();
  assert.equal(manager.started, false);
  assert.deepEqual([first.stops, second.stops], [1, 1]);
});

test("ExternalEvent remains separate from the Internal Event contract", () => {
  const event = createExternalEvent({
    id: "external-1",
    source: "system",
    name: "memory_pressure",
    timestamp: 123,
    payload: { usage: 95 }
  });

  assert.deepEqual(event, {
    id: "external-1",
    source: "system",
    name: "memory_pressure",
    timestamp: 123,
    payload: { usage: 95 }
  });
  assert.equal("type" in event, false);
});

test("MacSystemListener External Event maps through Runtime to the current pet Action", async () => {
  const metrics: SystemMetricsProvider = {
    sample: () => ({ cpuUsage: 12, memoryUsage: 95 })
  };
  const listener = new MacSystemListener({
    intervalMs: 60_000,
    memoryThreshold: 90,
    metricsProvider: metrics
  });
  const mapper = new ExternalEventMapper({
    "system:memory_pressure": { type: "CUSTOM_EVENT", name: "MEMORY_PRESSURE" }
  });
  const normalizer = new EventNormalizer();
  const eventBus = new EventBus();
  const character = new PetCharacter({
    id: "sasuke",
    name: "Sasuke",
    version: "1.0.0",
    actions: ["idle", "danger"],
    behaviorMapping: { IDLE: "idle", ERROR: "danger" },
    assets: { idle: { asset: "idle.png" }, danger: { asset: "danger.png" } },
    assetBase: "/characters"
  });
  const actionResolver = new ActionResolver({ IDLE: "idle", ERROR: "danger" });
  let state: BehaviorSlot = "IDLE";
  const petManager = {
    character,
    stateMachine: { get state() { return state; } },
    changeCharacter: async () => undefined,
    changeBehavior: async (slot: BehaviorSlot) => { state = slot; },
    changeAction: async () => undefined,
    resolveAction: (slot: BehaviorSlot) => actionResolver.resolve(character, slot)
  };
  const behaviorEngine = new PetBehaviorEngine({
    petManager,
    behaviorResolver: new BehaviorResolver({ "CUSTOM_EVENT:MEMORY_PRESSURE": "ERROR" }),
    rules: {
      priorities: { IDLE: 0, ERROR: 100 },
      events: { "CUSTOM_EVENT:MEMORY_PRESSURE": {} }
    }
  });
  const runtime = new CompanionRuntime(eventBus, behaviorEngine);
  const pending: Promise<void>[] = [];
  listener.onEvent((externalEvent) => {
    pending.push(runtime.publish(normalizer.normalize(mapper.map(externalEvent))));
  });

  runtime.start();
  await listener.start();
  await Promise.all(pending);
  await listener.stop();
  runtime.stop();

  assert.equal(state, "ERROR");
  assert.equal(petManager.character.id, "sasuke");
  assert.equal(petManager.resolveAction(state).id, "danger");
});
