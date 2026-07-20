import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExternalEvent } from "../../../packages/listeners/core/ExternalEvent.js";
import type { Listener } from "../../../packages/listeners/core/Listener.js";
import { ListenerManager } from "../../../packages/listeners/core/ListenerManager.js";
import { DesktopLifecycleManager } from "../src/lifecycle/DesktopLifecycleManager.js";
import type {
  BeforeQuitEvent,
  DesktopApplication,
  RuntimeCoordinator
} from "../src/lifecycle/DesktopLifecycleManager.js";
import { acquireSingleInstanceLock } from "../src/lifecycle/singleInstance.js";
import { WindowManager } from "../src/window/WindowManager.js";
import type { PetWindow, WindowCloseEvent } from "../src/window/WindowManager.js";

class FakeWindow implements PetWindow {
  visible = false;
  minimized = false;
  destroyed = false;
  shows = 0;
  hides = 0;
  focuses = 0;
  restores = 0;
  destroys = 0;
  readonly #closeHandlers: Array<(event: WindowCloseEvent) => void> = [];
  readonly #closedHandlers: Array<() => void> = [];

  isDestroyed(): boolean { return this.destroyed; }
  isVisible(): boolean { return this.visible; }
  isMinimized(): boolean { return this.minimized; }
  show(): void { this.visible = true; this.shows += 1; }
  showInactive(): void { this.show(); }
  hide(): void { this.visible = false; this.hides += 1; }
  focus(): void { this.focuses += 1; }
  restore(): void { this.minimized = false; this.restores += 1; }
  destroy(): void {
    this.destroyed = true;
    this.destroys += 1;
    for (const handler of this.#closedHandlers) handler();
  }
  on(event: "close" | "closed", handler: ((event: WindowCloseEvent) => void) | (() => void)): void {
    if (event === "close") {
      this.#closeHandlers.push(handler as (event: WindowCloseEvent) => void);
    } else {
      this.#closedHandlers.push(handler as () => void);
    }
  }
  requestClose(): boolean {
    let prevented = false;
    for (const handler of this.#closeHandlers) {
      handler({ preventDefault: () => { prevented = true; } });
    }
    if (!prevented) this.destroy();
    return prevented;
  }
}

class FakeApplication implements DesktopApplication {
  readonly handlers = new Map<string, Set<(...args: never[]) => void>>();
  quitCalls = 0;

  async whenReady(): Promise<void> {}
  on(event: string, handler: (...args: never[]) => void): void {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
  }
  off(event: string, handler: (...args: never[]) => void): void {
    this.handlers.get(event)?.delete(handler);
  }
  quit(): void { this.quitCalls += 1; }
  emit(event: string, ...args: never[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

class OrderedListener implements Listener {
  readonly id = "ordered-listener";
  state: Listener["state"] = "CREATED";
  readonly order: string[];
  failDestroy = false;

  constructor(order: string[]) { this.order = order; }
  get running(): boolean { return this.state === "STARTED"; }
  async start(): Promise<void> { this.state = "STARTED"; this.order.push("listener-start"); }
  async stop(): Promise<void> { this.state = "STOPPED"; this.order.push("listener-stop"); }
  async destroy(): Promise<void> {
    this.state = "DESTROYED";
    this.order.push("listener-destroy");
    if (this.failDestroy) throw new Error("destroy failed");
  }
  onEvent(): void {}
}

class FakeRuntimeCoordinator implements RuntimeCoordinator<FakeWindow> {
  readonly order: string[];
  failStop = false;
  registers = 0;
  unregisters = 0;

  constructor(order: string[]) { this.order = order; }
  register(): void { this.registers += 1; this.order.push("ipc-register"); }
  unregister(): void { this.unregisters += 1; this.order.push("ipc-unregister"); }
  async waitForReady(): Promise<void> { this.order.push("runtime-ready"); }
  async requestStop(): Promise<void> {
    this.order.push("runtime-stop");
    if (this.failStop) throw new Error("runtime stop timeout");
    this.order.push("runtime-stopped");
  }
  sendExternalEvent(_window: FakeWindow | undefined, _event: ExternalEvent): boolean { return true; }
}

test("single instance lock rejects a second Desktop initialization", () => {
  let quits = 0;
  assert.equal(acquireSingleInstanceLock({ requestSingleInstanceLock: () => true, quit: () => { quits += 1; } }), true);
  assert.equal(quits, 0);
  assert.equal(acquireSingleInstanceLock({ requestSingleInstanceLock: () => false, quit: () => { quits += 1; } }), false);
  assert.equal(quits, 1);
});

test("WindowManager owns one pet window and converts close to hide", () => {
  let quitting = false;
  let creations = 0;
  const manager = new WindowManager({
    createWindow: () => { creations += 1; return new FakeWindow(); },
    isQuitting: () => quitting
  });

  const first = manager.createPetWindow();
  assert.equal(manager.createPetWindow(), first);
  assert.equal(creations, 1);
  manager.showPetWindow();
  manager.focusPetWindow();
  assert.equal(first.visible, true);
  assert.equal(first.focuses, 1);

  assert.equal(first.requestClose(), true);
  assert.equal(first.visible, false);
  assert.equal(first.destroyed, false);

  manager.showPetWindow();
  assert.equal(first.visible, true);
  quitting = true;
  assert.equal(first.requestClose(), false);
  assert.equal(first.destroyed, true);
});

test("Desktop lifecycle starts Runtime before Listeners and shuts down in order", async () => {
  const order: string[] = [];
  const application = new FakeApplication();
  const listenerManager = new ListenerManager();
  listenerManager.register(new OrderedListener(order));
  const window = new FakeWindow();
  let lifecycle!: DesktopLifecycleManager<FakeWindow>;
  const windowManager: WindowManager<FakeWindow> = new WindowManager({
    createWindow: () => { order.push("window-create"); return window; },
    isQuitting: (): boolean => lifecycle.isQuitting
  });
  const runtimeCoordinator = new FakeRuntimeCoordinator(order);
  lifecycle = new DesktopLifecycleManager({
    application,
    windowManager,
    listenerManager,
    runtimeCoordinator
  });

  await lifecycle.start();
  assert.deepEqual(order.slice(0, 4), ["ipc-register", "window-create", "runtime-ready", "listener-start"]);

  const firstQuit = lifecycle.requestQuit();
  const secondQuit = lifecycle.requestQuit();
  assert.equal(firstQuit, secondQuit);
  await firstQuit;

  assert.ok(order.indexOf("listener-destroy") < order.indexOf("runtime-stop"));
  assert.ok(order.indexOf("runtime-stopped") < order.indexOf("ipc-unregister"));
  assert.equal(window.destroys, 1);
  assert.equal(application.quitCalls, 1);
});

test("activate and second-instance restore and focus the existing pet window", async () => {
  const application = new FakeApplication();
  const listenerManager = new ListenerManager();
  const window = new FakeWindow();
  const windowManager = new WindowManager({ createWindow: () => window, isQuitting: () => false });
  const lifecycle = new DesktopLifecycleManager({
    application,
    windowManager,
    listenerManager,
    runtimeCoordinator: new FakeRuntimeCoordinator([])
  });
  await lifecycle.start();
  window.hide();

  application.emit("second-instance");
  assert.equal(window.visible, true);
  assert.equal(window.focuses, 1);
  window.hide();
  application.emit("activate");
  assert.equal(window.visible, true);
  assert.equal(window.focuses, 2);
  await lifecycle.requestQuit();
});

test("shutdown isolates Listener and Runtime stop failures", async () => {
  const errors: string[] = [];
  const order: string[] = [];
  const application = new FakeApplication();
  const listener = new OrderedListener(order);
  listener.failDestroy = true;
  const listenerManager = new ListenerManager();
  listenerManager.register(listener);
  const window = new FakeWindow();
  let lifecycle!: DesktopLifecycleManager<FakeWindow>;
  const windowManager: WindowManager<FakeWindow> = new WindowManager({
    createWindow: () => window,
    isQuitting: (): boolean => lifecycle.isQuitting
  });
  const runtimeCoordinator = new FakeRuntimeCoordinator(order);
  runtimeCoordinator.failStop = true;
  lifecycle = new DesktopLifecycleManager({
    application,
    windowManager,
    listenerManager,
    runtimeCoordinator,
    reportError: (message) => errors.push(message)
  });

  await lifecycle.start();
  await lifecycle.requestQuit();

  assert.ok(order.includes("listener-destroy"));
  assert.ok(order.includes("runtime-stop"));
  assert.equal(window.destroyed, true);
  assert.equal(application.quitCalls, 1);
  assert.equal(errors.length, 2);
});

test("shutdown safely skips Runtime IPC when the pet window is already destroyed", async () => {
  const order: string[] = [];
  const application = new FakeApplication();
  const window = new FakeWindow();
  const windowManager = new WindowManager({ createWindow: () => window, isQuitting: () => false });
  const runtimeCoordinator = new FakeRuntimeCoordinator(order);
  const lifecycle = new DesktopLifecycleManager({
    application,
    windowManager,
    listenerManager: new ListenerManager(),
    runtimeCoordinator
  });

  await lifecycle.start();
  window.destroy();
  await lifecycle.requestQuit();

  assert.equal(order.includes("runtime-stop"), false);
  assert.equal(application.quitCalls, 1);
});
