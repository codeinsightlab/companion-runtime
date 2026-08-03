import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createCompanionRuntime } from "../../bootstrap/createCompanionRuntime.js";
import type { CharacterRegistry } from "../../bootstrap/CharacterRegistry.js";
import type { ProfileStore } from "../../profile/ProfileStore.js";
import type { UserProfile } from "../../profile/UserProfile.js";
import type { CharacterManifest } from "../../types/CharacterManifest.js";
import type { BehaviorSchedulerLike } from "../../types/RuntimeTypes.js";
import { UserCommandAdapter } from "../../events/UserCommandAdapter.js";
import { ExternalEventMapper } from "../../../listeners/core/ExternalEventMapper.js";
import { createExternalEvent } from "../../../listeners/core/ExternalEvent.js";

class MemoryProfileStore implements ProfileStore {
  readonly #profiles = new Map<string, UserProfile>();

  constructor(profile: UserProfile) {
    this.#profiles.set(profile.id, structuredClone(profile));
  }

  async load(id: string): Promise<UserProfile | null> {
    const profile = this.#profiles.get(id);
    return profile ? structuredClone(profile) : null;
  }

  async save(profile: UserProfile): Promise<void> {
    this.#profiles.set(profile.id, structuredClone(profile));
  }

  async delete(id: string): Promise<void> {
    this.#profiles.delete(id);
  }

  async list(): Promise<UserProfile[]> {
    return [...this.#profiles.values()].map((profile) => structuredClone(profile));
  }
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly className = "";
  readonly style = { setProperty: () => undefined };
  readonly classList = {
    add: () => undefined,
    remove: () => undefined,
    contains: () => false
  };
  hidden = false;
  alt = "";
  draggable = false;
  src = "";
  append(): void {}
  remove(): void {}
  setAttribute(): void {}
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = "";

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }

  get src(): string {
    return this.#src;
  }
}

const originalDocument = globalThis.document;
const originalImage = globalThis.Image;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalWindow = globalThis.window;

before(() => {
  const body = new FakeElement();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body,
      createElement: () => new FakeElement()
    } as unknown as Document
  });
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: FakeImage
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis
  });
});

after(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "Image", { configurable: true, value: originalImage });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: originalRequestAnimationFrame
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

const character: CharacterManifest = {
  id: "test-pet",
  name: "Test Pet",
  version: "1.0.0",
  actions: ["idle", "thinking", "working", "celebrate", "danger"],
  behaviorMapping: {
    IDLE: "idle",
    THINKING: "thinking",
    EXECUTING: "working",
    SUCCESS: "celebrate",
    ERROR: "danger"
  },
  assets: {
    idle: { asset: "idle.asset" },
    thinking: { asset: "thinking.asset" },
    working: { asset: "working.asset" },
    celebrate: { asset: "success.asset" },
    danger: { asset: "error.asset" }
  }
};

const registry: CharacterRegistry = {
  getCharacter(id) {
    return id === character.id ? character : undefined;
  },
  listCharacters() {
    return [character];
  }
};

const scheduler: BehaviorSchedulerLike = {
  clearRecovery: () => undefined,
  scheduleRecovery: () => undefined,
  clearFeedback: () => undefined,
  scheduleFeedback: () => undefined,
  scheduleIdle: () => undefined,
  markCooldown: () => undefined,
  isCoolingDown: () => false,
  stop: () => undefined
};

async function createTestRuntime() {
  return createCompanionRuntime({
    profileId: "default",
    profileStore: new MemoryProfileStore({
      id: "default",
      characterId: "test-pet",
      behaviorMapping: {}
    }),
    characterRegistry: registry,
    assetBaseUrl: "/test-pack",
    eventMapping: {
      TASK_START: "THINKING",
      TASK_RUNNING: "EXECUTING",
      TASK_SUCCESS: "SUCCESS",
      TASK_ERROR: "ERROR",
      IDLE: "IDLE",
      "CUSTOM_EVENT:USER_COMMAND:GREET": "THINKING",
      "CUSTOM_EVENT:USER_COMMAND:CELEBRATE": "SUCCESS",
      "CUSTOM_EVENT:USER_COMMAND:REST": "IDLE",
      "CUSTOM_EVENT:BATTERY_LOW": "ERROR"
    },
    behaviorMapping: {
      IDLE: "idle",
      THINKING: "thinking",
      EXECUTING: "working",
      SUCCESS: "celebrate",
      ERROR: "danger"
    },
    behaviorRules: {
      priorities: { IDLE: 0, THINKING: 20, EXECUTING: 40, SUCCESS: 80, ERROR: 100 },
      events: {
        TASK_START: {},
        TASK_RUNNING: {},
        TASK_SUCCESS: {},
        TASK_ERROR: {},
        "CUSTOM_EVENT:BATTERY_LOW": {},
        "CUSTOM_EVENT:USER_COMMAND:GREET": {
          duration: 1000,
          recover: "IDLE",
          cooldownKey: "USER_GREET"
        },
        "CUSTOM_EVENT:USER_COMMAND:CELEBRATE": {
          duration: 1000,
          recover: "IDLE",
          cooldownKey: "USER_CELEBRATE"
        },
        "CUSTOM_EVENT:USER_COMMAND:REST": {
          duration: 500,
          recover: "IDLE",
          cooldownKey: "USER_REST"
        }
      }
    },
    behaviorScheduler: scheduler
  });
}

test("createCompanionRuntime creates a complete Runtime Context", async () => {
  const context = await createTestRuntime();

  assert.ok(context.eventBus);
  assert.ok(context.eventNormalizer);
  assert.ok(context.profileManager);
  assert.ok(context.profileResolver);
  assert.ok(context.behaviorResolver);
  assert.ok(context.behaviorEngine);
  assert.ok(context.actionResolver);
  assert.ok(context.petManager);
  assert.ok(context.runtime);
});

test("Runtime Context modules share the same dependency instances", async () => {
  const context = await createTestRuntime();
  let published = false;
  context.eventBus.subscribe(() => {
    published = true;
  });
  context.runtime.start();
  await context.runtime.publish(context.eventNormalizer.normalize({
    event: "TASK_START",
    source: "test"
  }));
  context.runtime.stop();

  assert.equal(context.behaviorEngine.petManager, context.petManager);
  assert.equal(context.behaviorEngine.behaviorResolver, context.behaviorResolver);
  assert.equal(context.petManager.profileManager, context.profileManager);
  assert.equal(context.petManager.actionResolver, context.actionResolver);
  assert.equal(published, true);
});

test("reapplying the current IDLE slot does not redraw the same Action", async () => {
  const context = await createTestRuntime();
  await context.petManager.ready;
  let renders = 0;
  context.petManager.viewer.addEventListener("render", () => { renders += 1; });

  await context.petManager.changeBehavior("IDLE");

  assert.equal(renders, 0);
  assert.equal(context.petManager.viewer.currentSrc, "/test-pack/test-pet/idle.asset");
});

test("TASK_SUCCESS flows through Behavior Slot to current Character Action", async () => {
  const context = await createTestRuntime();
  context.runtime.start();
  await context.runtime.publish(context.eventNormalizer.normalize({
    event: "TASK_SUCCESS",
    source: { app: "integration-test" }
  }));
  context.runtime.stop();

  assert.equal(context.petManager.stateMachine.state, "SUCCESS");
  assert.equal(context.behaviorEngine.getCurrentBehavior().slot, "SUCCESS");
  assert.equal(context.petManager.resolveAction("SUCCESS").id, "celebrate");
  assert.equal(context.petManager.character.id, "test-pet");
});

test("UserCommand flows through Runtime publish to Behavior Slot and Character Action", async () => {
  const context = await createTestRuntime();
  const adapter = new UserCommandAdapter(context.eventNormalizer);
  context.runtime.start();
  const result = await context.runtime.publish(adapter.toCompanionEvent({
    type: "USER_COMMAND",
    name: "CELEBRATE"
  }));
  context.runtime.stop();

  assert.equal(result?.status, "accepted");
  assert.equal(context.behaviorEngine.getCurrentBehavior().slot, "SUCCESS");
  assert.equal(context.petManager.resolveAction("SUCCESS").id, "celebrate");
  assert.equal(context.petManager.resolveAction("SUCCESS").asset, "success.asset");
});

test("rapid UserCommands use latest-wins through Runtime and Viewer", async () => {
  const context = await createTestRuntime();
  const adapter = new UserCommandAdapter(context.eventNormalizer);
  context.runtime.start();
  const publish = (name: "GREET" | "CELEBRATE" | "REST") =>
    context.runtime.publish(adapter.toCompanionEvent({
      type: "USER_COMMAND",
      name
    }));

  const [greet, celebrate, rest] = await Promise.all([
    publish("GREET"),
    publish("CELEBRATE"),
    publish("REST")
  ]);

  assert.equal(greet?.status, "accepted");
  assert.equal(celebrate?.status, "replaced");
  assert.equal(rest?.status, "replaced");
  assert.equal(context.behaviorEngine.currentExecution?.triggerName, "REST");
  assert.equal(context.petManager.stateMachine.state, "IDLE");
  assert.equal(context.petManager.viewer.currentSrc, "/test-pack/test-pet/idle.asset");
  context.runtime.stop();
});

test("Development ExternalEvent Simulator flows through Mapping to Action and Feedback", async () => {
  const context = await createTestRuntime();
  const mapper = new ExternalEventMapper({
    "system:task_running": { type: "TASK_RUNNING" },
    "system:task_success": { type: "TASK_SUCCESS" },
    "system:battery_low": { type: "CUSTOM_EVENT", name: "BATTERY_LOW" }
  });
  const publishExternal = (name: string, payload: Record<string, unknown> = {}) =>
    context.runtime.publish(context.eventNormalizer.normalize(mapper.map(createExternalEvent({
      source: "system",
      name,
      payload
    }))));
  context.runtime.start();

  await publishExternal("task_running");
  assert.equal(context.petManager.stateMachine.state, "EXECUTING");
  assert.equal(context.petManager.viewer.currentSrc, "/test-pack/test-pet/working.asset");
  assert.equal(context.behaviorEngine.currentFeedback?.reason, "正在执行任务");
  assert.equal(context.behaviorEngine.currentFeedback?.mode, "PERSISTENT");

  await publishExternal("task_success");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(context.petManager.stateMachine.state, "SUCCESS");
  assert.equal(context.petManager.viewer.currentSrc, "/test-pack/test-pet/success.asset");
  assert.equal(context.behaviorEngine.currentFeedback?.reason, "任务执行成功");

  context.runtime.stop();

  const batteryContext = await createTestRuntime();
  batteryContext.runtime.start();
  await batteryContext.runtime.publish(batteryContext.eventNormalizer.normalize(mapper.map(
    createExternalEvent({
      source: "system",
      name: "battery_low",
      payload: { level: 15, charging: false }
    })
  )));
  assert.equal(batteryContext.petManager.stateMachine.state, "ERROR");
  assert.equal(batteryContext.petManager.viewer.currentSrc, "/test-pack/test-pet/error.asset");
  assert.equal(batteryContext.behaviorEngine.currentFeedback?.reason, "设备电量较低");
  batteryContext.runtime.stop();
});
