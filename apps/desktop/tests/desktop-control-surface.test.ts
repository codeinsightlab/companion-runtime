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
import { PET_SIZE_LAYOUT, validateDesktopPreferences } from "../src/preferences/DesktopPreferences.js";
import { SettingsIpcCoordinator } from "../src/settings/SettingsIpcCoordinator.js";
import type { DesktopRuntimeConfiguration } from "../src/types.js";
import type { RuntimeIpcCoordinator } from "../src/runtime/RuntimeIpcCoordinator.js";
import { TrayManager } from "../src/tray/TrayManager.js";
import type { TrayHandle } from "../src/tray/TrayManager.js";
import { WindowManager } from "../src/window/WindowManager.js";
import type { PetWindow, WindowCloseEvent } from "../src/window/WindowManager.js";

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
  isDestroyed(): boolean { return this.destroyed; }
  isVisible(): boolean { return this.visible; }
  isMinimized(): boolean { return this.minimized; }
  show(): void { this.visible = true; }
  showInactive(): void { this.show(); }
  hide(): void { this.visible = false; }
  focus(): void {}
  restore(): void { this.minimized = false; }
  destroy(): void { this.destroyed = true; for (const handler of this.closedHandlers) handler(); }
  on(event: "close" | "closed", handler: ((event: WindowCloseEvent) => void) | (() => void)): void {
    if (event === "close") this.closeHandlers.push(handler as (event: WindowCloseEvent) => void);
    else this.closedHandlers.push(handler as () => void);
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
    assert.equal(JSON.parse(await readFile(filePath, "utf8")).petSize, "large");
    const restarted = new DesktopPreferencesStore({ filePath });
    assert.equal((await restarted.load()).petSize, "large");
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
    await writeFile(filePath, "not json", "utf8");
    const store = new DesktopPreferencesStore({ filePath, reportError: (message) => errors.push(message) });
    assert.equal((await store.load()).petSize, "medium");
    assert.equal(errors.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
      setPetSize(size: string) { sizes.push(size); }
    } as unknown as WindowManager<BrowserWindow>;
    const runtimeCoordinator = {
      sendCharacterChanged: (_window: BrowserWindow | undefined, id: string) => { sent.push(id); return true; },
      sendPetSizeChanged: (_window: BrowserWindow | undefined, size: string, pixels: number) => {
        sent.push(`${size}:${pixels}`); return true;
      }
    } as unknown as RuntimeIpcCoordinator;
    const configuration = {
      characters: [
        { id: "sasuke", name: "宇智波佐助" },
        { id: "naruto", name: "漩涡鸣人" }
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
    await assert.rejects(coordinator.setCharacter("unknown"), /Unknown character/);
    await coordinator.setCharacter("naruto");
    assert.equal(profileStore.get().characterId, "naruto");
    assert.deepEqual(sent, ["naruto"]);
    await assert.rejects(coordinator.setPetSize("huge"), /Unknown pet size/);
    await coordinator.setPetSize("small");
    assert.deepEqual(sizes, ["small"]);
    assert.deepEqual(sent, ["naruto", "small:96"]);
    const reloadedProfile = new DesktopUserProfileStore(join(directory, "profile.json"), {
      id: "default", characterId: "sasuke", behaviorMapping: {}
    });
    assert.equal((await reloadedProfile.load()).characterId, "naruto");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
