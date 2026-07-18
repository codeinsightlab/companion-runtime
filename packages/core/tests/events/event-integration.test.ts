import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createCompanionRuntime } from "../../bootstrap/createCompanionRuntime.js";
import type { CharacterRegistry } from "../../bootstrap/CharacterRegistry.js";
import type { ProfileStore } from "../../profile/ProfileStore.js";
import type { UserProfile } from "../../profile/UserProfile.js";
import type { CharacterManifest } from "../../types/CharacterManifest.js";
import type { BehaviorSchedulerLike } from "../../types/RuntimeTypes.js";

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
      IDLE: "IDLE"
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
        TASK_ERROR: {}
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
