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
import { BaseListener } from "../core/BaseListener.js";
import { ListenerManager } from "../core/ListenerManager.js";
import { MacSystemListener } from "../system/macos/MacSystemListener.js";
import type { SystemMetricsProvider } from "../system/macos/MacSystemListener.js";
import type { MemoryPressureAdapter, MemoryPressureSample } from "../system/macos/MacMemoryPressureAdapter.js";
import { MacMemoryPressureAdapter } from "../system/macos/MacMemoryPressureAdapter.js";
import { MacBatteryListener, MacBatteryStatusProvider } from "../system/macos/MacBatteryListener.js";
import type { BatteryStatus, BatteryStatusProvider } from "../system/macos/MacBatteryListener.js";

class TestMemoryPressureAdapter implements MemoryPressureAdapter {
  sampleValue: MemoryPressureSample = { level: "normal", freePercentage: 70 };
  destroyed = false;
  cancelled = false;

  async sample(): Promise<MemoryPressureSample> {
    return this.sampleValue;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }

  cancel(): void {
    this.cancelled = true;
  }
}

class TestListener extends BaseListener implements Listener {
  readonly id: string;
  readonly #failStart: boolean;
  readonly #failStop: boolean;
  readonly #failDestroy: boolean;
  starts = 0;
  stops = 0;
  destroys = 0;

  constructor(
    id = "test-listener",
    options: { failStart?: boolean; failStop?: boolean; failDestroy?: boolean } = {}
  ) {
    super();
    this.id = id;
    this.#failStart = options.failStart ?? false;
    this.#failStop = options.failStop ?? false;
    this.#failDestroy = options.failDestroy ?? false;
  }

  protected async onStart(): Promise<void> {
    this.starts += 1;
    if (this.#failStart) throw new Error(`${this.id} start failed`);
  }

  protected async onStop(): Promise<void> {
    this.stops += 1;
    if (this.#failStop) throw new Error(`${this.id} stop failed`);
  }

  protected async onDestroy(): Promise<void> {
    this.destroys += 1;
    if (this.#failDestroy) throw new Error(`${this.id} destroy failed`);
  }

  emit(event: ExternalEvent): void {
    this.emitIfActive(event, this.currentGeneration);
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
  listener.emit(createExternalEvent({ source: "test", name: "late" }));

  assert.equal(listener.starts, 1);
  assert.equal(listener.stops, 1);
  assert.equal(received?.source, "test");
  assert.equal(received?.name, "changed");
  assert.equal(listener.state, "STOPPED");
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

  await manager.destroyAll();
  assert.deepEqual([first.destroys, second.destroys], [1, 1]);
  assert.equal(manager.listeners.length, 0);
});

test("ListenerManager isolates start and destroy failures", async () => {
  const failingStart = new TestListener("failing-start", { failStart: true });
  const healthy = new TestListener("healthy");
  const manager = new ListenerManager();
  manager.register(failingStart);
  manager.register(healthy);

  await assert.rejects(manager.startAll(), AggregateError);
  assert.equal(healthy.running, true);
  assert.equal(healthy.starts, 1);

  await manager.destroyAll();

  const failingDestroy = new TestListener("failing-destroy", { failDestroy: true });
  const survivingDestroy = new TestListener("surviving-destroy");
  const destroyManager = new ListenerManager();
  destroyManager.register(failingDestroy);
  destroyManager.register(survivingDestroy);
  await destroyManager.startAll();
  await assert.rejects(destroyManager.destroyAll(), AggregateError);
  assert.equal(failingDestroy.destroys, 1);
  assert.equal(survivingDestroy.destroys, 1);
  assert.equal(destroyManager.listeners.length, 0);
});

test("Listener destroy runs resource cleanup even when stop fails", async () => {
  const listener = new TestListener("stop-failure", { failStop: true });
  await listener.start();

  await assert.rejects(listener.destroy(), AggregateError);

  assert.equal(listener.stops, 1);
  assert.equal(listener.destroys, 1);
  assert.equal(listener.state, "DESTROYED");
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
    sample: () => ({ cpuUsage: 12 })
  };
  const memoryPressureAdapter = new TestMemoryPressureAdapter();
  memoryPressureAdapter.sampleValue = { level: "warning", freePercentage: 12 };
  const listener = new MacSystemListener({
    intervalMs: 60_000,
    metricsProvider: metrics,
    memoryPressureAdapter
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

test("MacMemoryPressureAdapter parses native pressure output and emits ExternalEvent", async () => {
  const adapter = new MacMemoryPressureAdapter({
    commandRunner: () => ({
      result: Promise.resolve("System-wide memory free percentage: 10%"),
      cancel: () => undefined
    })
  });
  const listener = new MacSystemListener({
    intervalMs: 60_000,
    metricsProvider: { sample: () => ({ cpuUsage: 10 }) },
    memoryPressureAdapter: adapter
  });
  const events: ExternalEvent[] = [];
  listener.onEvent((event) => events.push(event));

  await listener.start();
  await listener.destroy();

  assert.equal(events.length, 1);
  assert.equal(events[0]?.name, "memory_pressure");
  assert.equal(events[0]?.payload.level, "warning");
  assert.equal(events[0]?.payload.freePercentage, 10);
});

test("MacSystemListener requires sustained CPU usage and rearms after recovery", async () => {
  let usage = 95;
  let now = 0;
  const listener = new MacSystemListener({
    intervalMs: 60_000,
    cpuThreshold: 90,
    cpuSustainMs: 10_000,
    now: () => now,
    metricsProvider: { sample: () => ({ cpuUsage: usage }) },
    memoryPressureAdapter: new TestMemoryPressureAdapter()
  });
  const events: ExternalEvent[] = [];
  listener.onEvent((event) => events.push(event));

  await listener.start();
  now = 9_999;
  await listener.sampleNow();
  assert.equal(events.length, 0);

  now = 10_000;
  await listener.sampleNow();
  assert.equal(events.filter((event) => event.name === "cpu_high").length, 1);

  usage = 20;
  now = 11_000;
  await listener.sampleNow();
  usage = 95;
  now = 20_000;
  await listener.sampleNow();
  now = 30_000;
  await listener.sampleNow();

  assert.equal(events.filter((event) => event.name === "cpu_high").length, 2);
  await listener.destroy();
});

test("MacBatteryListener emits battery_low only for low non-charging battery", async () => {
  let status: BatteryStatus = { level: 15, charging: false };
  let destroyed = false;
  const provider: BatteryStatusProvider = {
    sample: async () => status,
    cancel: () => undefined,
    destroy: async () => { destroyed = true; }
  };
  const listener = new MacBatteryListener({
    intervalMs: 60_000,
    lowThreshold: 20,
    statusProvider: provider
  });
  const events: ExternalEvent[] = [];
  listener.onEvent((event) => events.push(event));

  await listener.start();
  await listener.sampleNow();
  status = { level: 30, charging: false };
  await listener.sampleNow();
  status = { level: 10, charging: true };
  await listener.sampleNow();
  status = { level: 10, charging: false };
  await listener.sampleNow();
  await listener.destroy();

  assert.equal(events.length, 2);
  assert.equal(events[0]?.name, "battery_low");
  assert.deepEqual(
    { level: events[0]?.payload.level, charging: events[0]?.payload.charging },
    { level: 15, charging: false }
  );
  assert.equal(destroyed, true);
});

test("MacBatteryStatusProvider parses pmset battery state", async () => {
  const provider = new MacBatteryStatusProvider(() => ({
    result: Promise.resolve(
      "Now drawing from 'Battery Power'\n -InternalBattery-0\t15%; discharging; present: true"
    ),
    cancel: () => undefined
  }));
  assert.deepEqual(await provider.sample(), { level: 15, charging: false });
  await provider.destroy();
});

test("duplicate start and in-flight sampling create only one sampling resource", async () => {
  let samples = 0;
  let resolveSample: ((status: BatteryStatus) => void) | undefined;
  const sampleResult = new Promise<BatteryStatus>((resolve) => {
    resolveSample = resolve;
  });
  const provider: BatteryStatusProvider = {
    sample: () => {
      samples += 1;
      return sampleResult;
    },
    cancel: () => undefined,
    destroy: async () => undefined
  };
  const listener = new MacBatteryListener({ intervalMs: 60_000, statusProvider: provider });

  const firstStart = listener.start();
  const secondStart = listener.start();
  const overlappingSample = listener.sampleNow();
  assert.equal(await overlappingSample, false);
  assert.equal(samples, 1);
  resolveSample?.({ level: 80, charging: false });
  await Promise.all([firstStart, secondStart]);

  assert.equal(listener.running, true);
  assert.equal(samples, 1);
  await listener.destroy();
  assert.equal(listener.state, "DESTROYED");
  await assert.rejects(listener.start(), /destroyed/);
});

test("stop suppresses a late async sample result", async () => {
  let resolveSample: ((status: BatteryStatus) => void) | undefined;
  let cancelled = 0;
  const sampleResult = new Promise<BatteryStatus>((resolve) => {
    resolveSample = resolve;
  });
  const provider: BatteryStatusProvider = {
    sample: () => sampleResult,
    cancel: () => { cancelled += 1; },
    destroy: async () => undefined
  };
  const listener = new MacBatteryListener({ intervalMs: 60_000, statusProvider: provider });
  const events: ExternalEvent[] = [];
  listener.onEvent((event) => events.push(event));

  const startOperation = listener.start();
  const stopOperation = listener.stop();
  resolveSample?.({ level: 5, charging: false });
  await Promise.all([startOperation, stopOperation]);

  assert.equal(cancelled, 1);
  assert.equal(events.length, 0);
  assert.equal(listener.state, "STOPPED");
  await listener.destroy();
});

test("Memory adapter cancel releases its active command handle", async () => {
  let cancelCalls = 0;
  let rejectCommand: ((reason?: unknown) => void) | undefined;
  const commandResult = new Promise<string>((_resolve, reject) => {
    rejectCommand = reject;
  });
  const adapter = new MacMemoryPressureAdapter({
    commandRunner: () => ({
      result: commandResult,
      cancel: () => {
        cancelCalls += 1;
        rejectCommand?.(new Error("cancelled"));
      }
    })
  });

  const sampleOperation = adapter.sample();
  adapter.cancel();
  await assert.rejects(sampleOperation, /cancelled/);
  assert.equal(cancelCalls, 1);
  await adapter.destroy();
});
