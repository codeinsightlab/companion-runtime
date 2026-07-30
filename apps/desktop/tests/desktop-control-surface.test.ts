import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type { MenuItemConstructorOptions } from "electron";
import type { BrowserWindow, IpcMain } from "electron";
import type { Listener } from "../../../packages/listeners/core/Listener.js";
import { ListenerManager } from "../../../packages/listeners/core/ListenerManager.js";
import { DesktopPreferencesStore } from "../src/preferences/DesktopPreferencesStore.js";
import { DesktopUserProfileStore } from "../src/preferences/DesktopUserProfileStore.js";
import {
  PET_SIZE_LAYOUT,
  validateDesktopPreferences,
  validatePetWindowPosition
} from "../src/preferences/DesktopPreferences.js";
import { SettingsIpcCoordinator } from "../src/settings/SettingsIpcCoordinator.js";
import type { DesktopRuntimeConfiguration } from "../src/types.js";
import type { RuntimeIpcCoordinator } from "../src/runtime/RuntimeIpcCoordinator.js";
import { TrayManager } from "../src/tray/TrayManager.js";
import type { TrayHandle } from "../src/tray/TrayManager.js";
import { WindowManager } from "../src/window/WindowManager.js";
import type { PetWindow, WindowCloseEvent } from "../src/window/WindowManager.js";
import { PetInteractionIpcCoordinator } from "../src/ipc/PetInteractionIpcCoordinator.js";
import { DESKTOP_CHANNELS } from "../src/ipc/channels.js";

class FakeTray implements TrayHandle {
  destroyed = false;
  menu?: unknown;
  toolTip = "";
  destroy(): void { this.destroyed = true; }
  isDestroyed(): boolean { return this.destroyed; }
  setContextMenu(menu: unknown): void { this.menu = menu; }
  setToolTip(toolTip: string): void { this.toolTip = toolTip; }
}

class FakeWindow implements PetWindow {
  visible = false;
  minimized = false;
  destroyed = false;
  readonly closeHandlers: Array<(event: WindowCloseEvent) => void> = [];
  readonly closedHandlers: Array<() => void> = [];
  readonly moveHandlers: Array<() => void> = [];
  position = [0, 0];
  ignoresMouse = false;
  isDestroyed(): boolean { return this.destroyed; }
  isVisible(): boolean { return this.visible; }
  isMinimized(): boolean { return this.minimized; }
  show(): void { this.visible = true; }
  showInactive(): void { this.show(); }
  hide(): void { this.visible = false; }
  focus(): void {}
  restore(): void { this.minimized = false; }
  destroy(): void { this.destroyed = true; for (const handler of this.closedHandlers) handler(); }
  getPosition(): number[] { return [...this.position]; }
  setPosition(x: number, y: number): void {
    this.position = [x, y];
    for (const handler of this.moveHandlers) handler();
  }
  setIgnoreMouseEvents(ignore: boolean): void { this.ignoresMouse = ignore; }
  on(event: "close" | "closed" | "move", handler: ((event: WindowCloseEvent) => void) | (() => void)): void {
    if (event === "close") this.closeHandlers.push(handler as (event: WindowCloseEvent) => void);
    else if (event === "closed") this.closedHandlers.push(handler as () => void);
    else this.moveHandlers.push(handler as () => void);
  }
  close(): void {
    let prevented = false;
    for (const handler of this.closeHandlers) handler({ preventDefault: () => { prevented = true; } });
    if (!prevented) this.destroy();
  }
}

class StatusListener implements Listener {
  readonly id: string;
  state: Listener["state"] = "CREATED";
  constructor(id: string) { this.id = id; }
  get running(): boolean { return this.state === "STARTED"; }
  async start(): Promise<void> { this.state = "STARTED"; }
  async stop(): Promise<void> { this.state = "STOPPED"; }
  async destroy(): Promise<void> { this.state = "DESTROYED"; }
  onEvent(): void {}
}

function menuItem(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions {
  const item = template.find((candidate) => candidate.label === label);
  assert.ok(item, `Missing menu item ${label}`);
  return item;
}

test("TrayManager creates once, routes actions, catches errors and destroys idempotently", async () => {
  let creations = 0;
  const errors: string[] = [];
  const calls: string[] = [];
  let template: MenuItemConstructorOptions[] = [];
  const tray = new FakeTray();
  const manager = new TrayManager({
    createTray: () => { creations += 1; return tray; },
    buildMenu: (input) => { template = input; return input; },
    actions: {
      showPet: () => { calls.push("show"); },
      hidePet: () => { calls.push("hide"); },
      openSettings: () => { throw new Error("settings failed"); },
      requestQuit: () => { calls.push("quit"); }
    },
    reportError: (message) => errors.push(message)
  });

  assert.equal(manager.create(), true);
  assert.equal(manager.create(), true);
  assert.equal(creations, 1);
  menuItem(template, "显示宠物").click?.({} as never, undefined, {} as never);
  menuItem(template, "隐藏宠物").click?.({} as never, undefined, {} as never);
  menuItem(template, "打开设置").click?.({} as never, undefined, {} as never);
  menuItem(template, "退出 Companion").click?.({} as never, undefined, {} as never);
  await Promise.resolve();
  assert.deepEqual(calls, ["show", "hide", "quit"]);
  assert.equal(errors.length, 1);
  manager.destroy();
  manager.destroy();
  assert.equal(tray.destroyed, true);
});

test("Tray creation failure is isolated", () => {
  const errors: string[] = [];
  const manager = new TrayManager({
    createTray: () => { throw new Error("no tray"); },
    buildMenu: (template) => template,
    actions: { showPet() {}, hidePet() {}, openSettings() {}, requestQuit() {} },
    reportError: (message) => errors.push(message)
  });
  assert.equal(manager.create(), false);
  assert.equal(manager.isCreated(), false);
  assert.equal(errors.length, 1);
});

test("WindowManager keeps Pet and Settings windows independent and reuses Settings", () => {
  const pet = new FakeWindow();
  let settings = new FakeWindow();
  let settingsCreations = 0;
  const resizes: string[] = [];
  const manager = new WindowManager({
    createWindow: () => pet,
    createSettingsWindow: () => { settingsCreations += 1; return settings; },
    resizePetWindow: (_window, size) => resizes.push(size),
    isQuitting: () => false
  });
  assert.equal(manager.createPetWindow(), pet);
  assert.equal(manager.showSettingsWindow(), settings);
  assert.equal(manager.showSettingsWindow(), settings);
  assert.equal(settingsCreations, 1);
  manager.setPetSize("large");
  assert.deepEqual(resizes, ["large"]);
  settings.close();
  assert.equal(settings.destroyed, true);
  assert.equal(pet.destroyed, false);
  settings = new FakeWindow();
  assert.notEqual(manager.createSettingsWindow(), pet);
  assert.equal(settingsCreations, 2);
  manager.destroyAllWindows();
  assert.equal(pet.destroyed, true);
  assert.equal(settings.destroyed, true);
});

test("DesktopPreferencesStore defaults, persists atomically and survives restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-preferences-"));
  const filePath = join(directory, "desktop-preferences.json");
  try {
    const first = new DesktopPreferencesStore({ filePath });
    assert.equal((await first.load()).petSize, "medium");
    await first.updatePetSize("large");
    await first.updatePetPosition({ x: 120, y: 240, displayId: "7" });
    await first.updateMouseInteractionMode("click-through");
    assert.equal(JSON.parse(await readFile(filePath, "utf8")).petSize, "large");
    const restarted = new DesktopPreferencesStore({ filePath });
    assert.equal((await restarted.load()).petSize, "large");
    assert.deepEqual(restarted.get().petPosition, { x: 120, y: 240, displayId: "7" });
    assert.equal(restarted.get().mouseInteractionMode, "click-through");
    assert.deepEqual(PET_SIZE_LAYOUT.small, { viewer: 96, windowWidth: 248, windowHeight: 208 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DesktopPreferencesStore rejects invalid updates and falls back from corrupt JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-preferences-invalid-"));
  const filePath = join(directory, "desktop-preferences.json");
  const errors: string[] = [];
  try {
    assert.throws(() => validateDesktopPreferences({ version: 1, petSize: "huge" }), /petSize/);
    assert.throws(() => validatePetWindowPosition({ x: Number.NaN, y: 0 }), /coordinates/);
    assert.equal(
      validateDesktopPreferences({ version: 1, petSize: "small" }).mouseInteractionMode,
      "interactive"
    );
    await writeFile(filePath, "not json", "utf8");
    const store = new DesktopPreferencesStore({ filePath, reportError: (message) => errors.push(message) });
    assert.equal((await store.load()).petSize, "medium");
    assert.equal(errors.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("WindowManager debounces position persistence, supports drag and flushes final position", async () => {
  const pet = new FakeWindow();
  pet.position = [20, 30];
  const persisted: Array<{ x: number; y: number; displayId?: string }> = [];
  let creations = 0;
  const manager = new WindowManager({
    createWindow: () => { creations += 1; return pet; },
    isQuitting: () => false,
    getDisplayId: () => "display-main",
    persistPetPosition: async (position) => { persisted.push(position); },
    positionDebounceMs: 20
  });
  manager.createPetWindow();
  manager.movePetBy(5, 7);
  manager.movePetBy(3, 2);
  assert.equal(creations, 1);
  assert.deepEqual(pet.position, [28, 39]);
  assert.equal(persisted.length, 0);
  await manager.flushPetPosition();
  assert.deepEqual(persisted, [{ x: 28, y: 39, displayId: "display-main" }]);
});

test("WindowManager applies interactive and click-through mouse modes without Runtime access", () => {
  const pet = new FakeWindow();
  const manager = new WindowManager({
    createWindow: () => pet,
    isQuitting: () => false,
    initialMouseInteractionMode: "click-through"
  });
  manager.createPetWindow();
  assert.equal(pet.ignoresMouse, true);
  manager.setIgnoreMouseEvents(false);
  assert.equal(manager.mouseInteractionMode, "interactive");
  assert.equal(pet.ignoresMouse, false);
});

test("Pet drag IPC accepts only the current Pet Renderer and moves the existing window", () => {
  const pet = new FakeWindow() as FakeWindow & { webContents: { id: number } };
  pet.webContents = { id: 42 };
  pet.position = [100, 200];
  const manager = new WindowManager({ createWindow: () => pet, isQuitting: () => false });
  manager.createPetWindow();
  let listener: ((event: { sender: { id: number } }, x: unknown, y: unknown) => void) | undefined;
  const ipc = {
    on(channel: string, handler: typeof listener) {
      if (channel === DESKTOP_CHANNELS.petDrag) listener = handler;
    },
    removeListener() {}
  };
  const coordinator = new PetInteractionIpcCoordinator(
    ipc as unknown as IpcMain,
    manager as unknown as WindowManager<BrowserWindow>
  );
  coordinator.register();
  listener?.({ sender: { id: 99 } }, 10, 20);
  assert.deepEqual(pet.position, [100, 200]);
  listener?.({ sender: { id: 42 } }, 10, 20);
  assert.deepEqual(pet.position, [110, 220]);
  coordinator.unregister();
});

test("Settings coordinator validates Character, persists Profile, syncs size and reports real Listener state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-settings-"));
  try {
    const preferencesStore = new DesktopPreferencesStore({ filePath: join(directory, "preferences.json") });
    await preferencesStore.load();
    const profileStore = new DesktopUserProfileStore(join(directory, "profile.json"), {
      id: "default",
      characterId: "sasuke",
      behaviorMapping: {}
    });
    await profileStore.load();
    const listenerManager = new ListenerManager();
    listenerManager.register(new StatusListener("macos-system"));
    listenerManager.register(new StatusListener("macos-battery"));
    await listenerManager.startAll();
    const sent: string[] = [];
    const sizes: string[] = [];
    const windowManager = {
      getPetWindow: () => undefined,
      getSettingsWindow: () => undefined,
      showPetWindow() {},
      focusPetWindow() {},
      hidePetWindow() {},
      setPetSize(size: string) { sizes.push(size); },
      setIgnoreMouseEvents() {}
    } as unknown as WindowManager<BrowserWindow>;
    const runtimeCoordinator = {
      sendCharacterChanged: (_window: BrowserWindow | undefined, id: string) => { sent.push(id); return true; },
      sendPetSizeChanged: (_window: BrowserWindow | undefined, size: string, pixels: number) => {
        sent.push(`${size}:${pixels}`); return true;
      },
      sendMouseInteractionModeChanged: () => true,
      isReady: () => true
    } as unknown as RuntimeIpcCoordinator;
    const configuration = {
      assetBaseUrl: "file:///characters/naruto-pack",
      characters: [
        {
          id: "sasuke",
          name: "宇智波佐助",
          behaviorMapping: { IDLE: "idle" },
          assets: { idle: { asset: "idle.png" } }
        },
        {
          id: "naruto",
          name: "漩涡鸣人",
          behaviorMapping: { IDLE: "idle" },
          assets: { idle: { asset: "idle.png" } }
        }
      ]
    } as unknown as DesktopRuntimeConfiguration;
    const coordinator = new SettingsIpcCoordinator({
      ipcMain: {} as IpcMain,
      configuration,
      preferencesStore,
      profileStore,
      listenerManager,
      windowManager,
      runtimeCoordinator,
      batteryAvailable: false
    });

    assert.deepEqual(coordinator.snapshot().listeners, {
      cpu: "running",
      memory: "running",
      battery: "unavailable"
    });
    assert.equal(coordinator.snapshot().runtimeConnected, true);
    assert.equal(
      coordinator.snapshot().characters[0]?.previewUrl,
      "file:///characters/naruto-pack/sasuke/idle.png"
    );
    await assert.rejects(coordinator.setCharacter("unknown"), /Unknown character/);
    await coordinator.setCharacter("naruto");
    assert.equal(profileStore.get().characterId, "naruto");
    assert.deepEqual(sent, ["naruto"]);
    await assert.rejects(coordinator.setPetSize("huge"), /Unknown pet size/);
    await coordinator.setPetSize("small");
    assert.deepEqual(sizes, ["small"]);
    assert.deepEqual(sent, ["naruto", "small:96"]);
    await coordinator.setMouseInteractionMode("click-through");
    assert.equal(preferencesStore.get().mouseInteractionMode, "click-through");
    const reloadedProfile = new DesktopUserProfileStore(join(directory, "profile.json"), {
      id: "default", characterId: "sasuke", behaviorMapping: {}
    });
    assert.equal((await reloadedProfile.load()).characterId, "naruto");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
