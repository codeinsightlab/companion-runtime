import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import type { ListenerManager } from "../../../../packages/listeners/core/ListenerManager.js";
import type { UserProfile } from "../../../../packages/core/profile/UserProfile.js";
import {
  isUserCommandName
} from "../../../../packages/core/types/UserCommand.js";
import type { DesktopRuntimeConfiguration } from "../types.js";
import type { DesktopSettingsResult, DesktopSettingsSnapshot, ListenerDisplayState } from "../types.js";
import { DESKTOP_CHANNELS } from "../ipc/channels.js";
import {
  isMouseInteractionMode,
  isPetSize,
  PET_SIZE_LAYOUT
} from "../preferences/DesktopPreferences.js";
import type { PetSize } from "../preferences/DesktopPreferences.js";
import type { DesktopPreferencesStore } from "../preferences/DesktopPreferencesStore.js";
import type { DesktopUserProfileStore } from "../preferences/DesktopUserProfileStore.js";
import type { RuntimeIpcCoordinator } from "../runtime/RuntimeIpcCoordinator.js";
import type { WindowManager } from "../window/WindowManager.js";
import type { DesktopMode } from "../window.js";
import {
  createDevelopmentExternalEvent,
  isDevelopmentSystemEvent
} from "./DevelopmentEventSimulator.js";
import type { DesktopLoggerLike } from "../logging/DesktopLogger.js";

export interface SettingsIpcCoordinatorOptions {
  readonly ipcMain: IpcMain;
  readonly configuration: DesktopRuntimeConfiguration;
  readonly preferencesStore: DesktopPreferencesStore;
  readonly profileStore: DesktopUserProfileStore;
  readonly listenerManager: ListenerManager;
  readonly windowManager: WindowManager<BrowserWindow>;
  readonly runtimeCoordinator: RuntimeIpcCoordinator;
  readonly batteryAvailable: boolean;
  readonly mode: DesktopMode;
  readonly logger?: DesktopLoggerLike;
}

export class SettingsIpcCoordinator {
  readonly #ipcMain: IpcMain;
  readonly #configuration: DesktopRuntimeConfiguration;
  readonly #preferencesStore: DesktopPreferencesStore;
  readonly #profileStore: DesktopUserProfileStore;
  readonly #listenerManager: ListenerManager;
  readonly #windowManager: WindowManager<BrowserWindow>;
  readonly #runtimeCoordinator: RuntimeIpcCoordinator;
  readonly #batteryAvailable: boolean;
  readonly #mode: DesktopMode;
  readonly #logger?: DesktopLoggerLike;
  #registered = false;

  constructor(options: SettingsIpcCoordinatorOptions) {
    this.#ipcMain = options.ipcMain;
    this.#configuration = options.configuration;
    this.#preferencesStore = options.preferencesStore;
    this.#profileStore = options.profileStore;
    this.#listenerManager = options.listenerManager;
    this.#windowManager = options.windowManager;
    this.#runtimeCoordinator = options.runtimeCoordinator;
    this.#batteryAvailable = options.batteryAvailable;
    this.#mode = options.mode;
    this.#logger = options.logger;
  }

  register(): void {
    if (this.#registered) return;
    this.#registered = true;
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsGetSnapshot, (event) => this.#handle(event, () => this.snapshot()));
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsSetCharacter, (event, id: unknown) =>
      this.#handle(event, () => this.setCharacter(id)));
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsSetPetSize, (event, size: unknown) =>
      this.#handle(event, () => this.setPetSize(size)));
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsSetMouseMode, (event, mode: unknown) =>
      this.#handle(event, () => this.setMouseInteractionMode(mode)));
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsShowPet, (event) =>
      this.#handle(event, () => { this.#windowManager.showPetWindow(); this.#windowManager.focusPetWindow(); }));
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsHidePet, (event) =>
      this.#handle(event, () => this.#windowManager.hidePetWindow()));
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsSendUserCommand, (event, name: unknown) =>
      this.#handle(event, () => this.sendUserCommand(name)));
    this.#ipcMain.handle(DESKTOP_CHANNELS.settingsSimulateSystemEvent, (event, name: unknown) =>
      this.#handle(event, () => this.simulateSystemEvent(name)));
  }

  unregister(): void {
    if (!this.#registered) return;
    this.#registered = false;
    for (const channel of [
      DESKTOP_CHANNELS.settingsGetSnapshot,
      DESKTOP_CHANNELS.settingsSetCharacter,
      DESKTOP_CHANNELS.settingsSetPetSize,
      DESKTOP_CHANNELS.settingsSetMouseMode,
      DESKTOP_CHANNELS.settingsShowPet,
      DESKTOP_CHANNELS.settingsHidePet,
      DESKTOP_CHANNELS.settingsSendUserCommand,
      DESKTOP_CHANNELS.settingsSimulateSystemEvent
    ]) this.#ipcMain.removeHandler(channel);
  }

  snapshot(): DesktopSettingsSnapshot {
    const system = this.#listenerManager.listeners.find((listener) => listener.id === "macos-system");
    const battery = this.#listenerManager.listeners.find((listener) => listener.id === "macos-battery");
    const petWindow = this.#windowManager.getPetWindow();
    return Object.freeze({
      currentCharacterId: this.#profileStore.get().characterId,
      petSize: this.#preferencesStore.get().petSize,
      mouseInteractionMode: this.#preferencesStore.get().mouseInteractionMode,
      petVisible: petWindow?.isVisible() ?? false,
      runtimeConnected: this.#runtimeCoordinator.isReady(petWindow),
      characters: this.#configuration.characters.map((character) => {
        const previewUrl = this.#previewUrl(character);
        return Object.freeze({
          id: character.id,
          name: character.name,
          ...(previewUrl ? { previewUrl } : {})
        });
      }),
      listeners: Object.freeze({
        cpu: this.#listenerState(system?.state),
        memory: this.#listenerState(system?.state),
        battery: this.#batteryAvailable ? this.#listenerState(battery?.state) : "unavailable"
      })
    });
  }

  notify(): void {
    this.#notifySettings();
  }

  #previewUrl(character: DesktopRuntimeConfiguration["characters"][number]): string | undefined {
    const idleAction = character.behaviorMapping?.IDLE ?? "idle";
    const asset = character.assets?.[idleAction]?.asset;
    if (!asset || !this.#configuration.assetBaseUrl) return undefined;
    return `${this.#configuration.assetBaseUrl}/${encodeURIComponent(character.id)}/${encodeURIComponent(asset)}`;
  }

  async setCharacter(value: unknown): Promise<void> {
    if (typeof value !== "string" || !this.#configuration.characters.some(({ id }) => id === value)) {
      throw new RangeError(`Unknown character "${String(value)}"`);
    }
    const current = this.#profileStore.get();
    const profile: UserProfile = { ...current, characterId: value, behaviorMapping: {} };
    await this.#profileStore.save(profile);
    this.#runtimeCoordinator.sendCharacterChanged(this.#windowManager.getPetWindow(), value);
    this.#notifySettings();
  }

  async setPetSize(value: unknown): Promise<void> {
    if (!isPetSize(value)) throw new RangeError(`Unknown pet size "${String(value)}"`);
    await this.#preferencesStore.updatePetSize(value);
    this.#windowManager.setPetSize(value);
    this.#runtimeCoordinator.sendPetSizeChanged(
      this.#windowManager.getPetWindow(),
      value,
      PET_SIZE_LAYOUT[value].viewer
    );
    this.#notifySettings();
  }

  async setMouseInteractionMode(value: unknown): Promise<void> {
    if (!isMouseInteractionMode(value)) {
      throw new RangeError(`Unknown mouse interaction mode "${String(value)}"`);
    }
    await this.#preferencesStore.updateMouseInteractionMode(value);
    this.#windowManager.setIgnoreMouseEvents(value === "click-through");
    this.#runtimeCoordinator.sendMouseInteractionModeChanged(
      this.#windowManager.getPetWindow(),
      value
    );
    this.#notifySettings();
  }

  sendUserCommand(value: unknown): void {
    if (!isUserCommandName(value)) {
      throw new RangeError(`Unknown User Command "${String(value)}"`);
    }
    const sent = this.#runtimeCoordinator.sendUserCommand(
      this.#windowManager.getPetWindow(),
      Object.freeze({ type: "USER_COMMAND", name: value })
    );
    if (!sent) throw new Error("Companion Runtime is unavailable");
    this.#logger?.info("input.user-command", { name: value });
  }

  simulateSystemEvent(value: unknown): void {
    if (this.#mode !== "development") {
      throw new Error("System Event Simulator is available only in Development Mode");
    }
    if (!isDevelopmentSystemEvent(value)) {
      throw new RangeError(`Unknown Development System Event "${String(value)}"`);
    }
    const sent = this.#runtimeCoordinator.sendExternalEvent(
      this.#windowManager.getPetWindow(),
      createDevelopmentExternalEvent(value)
    );
    if (!sent) throw new Error("Companion Runtime is unavailable");
    this.#logger?.info("input.external-event", { source: "system", name: value, simulated: true });
  }

  #listenerState(state: "CREATED" | "STARTED" | "STOPPED" | "DESTROYED" | undefined): ListenerDisplayState {
    if (!state) return "unavailable";
    if (state === "STARTED") return "running";
    if (state === "STOPPED" && this.#listenerManager.started) return "error";
    return "stopped";
  }

  async #handle(event: IpcMainInvokeEvent, operation: () => unknown | Promise<unknown>): Promise<DesktopSettingsResult> {
    if (!this.#isSettingsSender(event)) return { ok: false, error: "Settings IPC sender is not authorized" };
    try {
      await operation();
      return { ok: true, snapshot: this.snapshot() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  #isSettingsSender(event: IpcMainInvokeEvent): boolean {
    const settings = this.#windowManager.getSettingsWindow();
    return Boolean(settings && !settings.isDestroyed() && settings.webContents.id === event.sender.id);
  }

  #notifySettings(): void {
    const settings = this.#windowManager.getSettingsWindow();
    if (!settings || settings.isDestroyed() || settings.webContents.isDestroyed()) return;
    settings.webContents.send(DESKTOP_CHANNELS.settingsUpdated, this.snapshot());
  }
}
