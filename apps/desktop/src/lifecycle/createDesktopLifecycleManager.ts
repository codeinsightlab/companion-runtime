import { app, ipcMain, Menu, Tray } from "electron";
import type { BrowserWindow } from "electron";
import { join } from "node:path";
import { ListenerManager } from "../../../../packages/listeners/core/ListenerManager.js";
import { ProfileValidator } from "../../../../packages/core/profile/ProfileValidator.js";
import {
  MacBatteryListener,
  MacBatteryStatusProvider
} from "../../../../packages/listeners/system/macos/MacBatteryListener.js";
import { MacSystemListener } from "../../../../packages/listeners/system/macos/MacSystemListener.js";
import { loadDesktopRuntimeConfiguration } from "../config.js";
import {
  createDesktopWindow,
  createSettingsWindow,
  getCursorScreenPoint,
  getDesktopWindowDisplayId,
  getPointDisplayWorkArea,
  resizeDesktopWindow
} from "../window.js";
import type { DesktopMode } from "../window.js";
import { RuntimeIpcCoordinator } from "../runtime/RuntimeIpcCoordinator.js";
import { WindowManager } from "../window/WindowManager.js";
import { DesktopPreferencesStore } from "../preferences/DesktopPreferencesStore.js";
import { DesktopUserProfileStore } from "../preferences/DesktopUserProfileStore.js";
import { PET_SIZE_LAYOUT } from "../preferences/DesktopPreferences.js";
import { SettingsIpcCoordinator } from "../settings/SettingsIpcCoordinator.js";
import { TrayManager } from "../tray/TrayManager.js";
import { createTrayIcon } from "../tray/createTrayIcon.js";
import { DesktopLifecycleManager } from "./DesktopLifecycleManager.js";
import { PetInteractionIpcCoordinator } from "../ipc/PetInteractionIpcCoordinator.js";
import { PanelController } from "../panel/PanelController.js";
import type { DesktopLoggerLike } from "../logging/DesktopLogger.js";

export async function createDesktopLifecycleManager(
  mode: DesktopMode,
  logger?: DesktopLoggerLike
): Promise<DesktopLifecycleManager<BrowserWindow>> {
  const reportError = (message: string, error: unknown): void => {
    logger?.error("desktop.error", { message, detail: error instanceof Error ? error.message : String(error) });
    console.error(message, error);
  };
  const configuration = await loadDesktopRuntimeConfiguration();
  const preferencesStore = new DesktopPreferencesStore({
    filePath: join(app.getPath("userData"), "desktop-preferences.json")
  });
  const preferences = await preferencesStore.load();
  const profileStore = new DesktopUserProfileStore(
    join(app.getPath("userData"), "user-profile.json"),
    configuration.userProfile
  );
  const persistedProfile = await profileStore.load();
  let validProfile = configuration.userProfile;
  try {
    validProfile = new ProfileValidator(
      new Map(configuration.characters.map((character) => [character.id, character]))
    ).validate(persistedProfile);
  } catch (error) {
    reportError("Persisted User Profile is invalid; default profile is used", error);
    await profileStore.save(validProfile);
  }
  configuration.userProfile = validProfile;
  configuration.runtimeConfig = {
    ...configuration.runtimeConfig,
    size: PET_SIZE_LAYOUT[preferences.petSize].viewer
  };

  const listenerManager = new ListenerManager();
  let lifecycleManager: DesktopLifecycleManager<BrowserWindow> | undefined;
  let windowManager!: WindowManager<BrowserWindow>;
  const panelController = new PanelController<BrowserWindow>({
    createPanel: () => createSettingsWindow(mode),
    getDefaultAnchor: getCursorScreenPoint,
    getDisplayWorkArea: getPointDisplayWorkArea,
    isQuitting: () => lifecycleManager?.isQuitting ?? false,
    activate: () => app.focus({ steal: true })
  });
  windowManager = new WindowManager<BrowserWindow>({
    createWindow: (petSize, position) => {
      logger?.info("window.pet.create", { petSize });
      return createDesktopWindow(mode, petSize, position);
    },
    panelController,
    resizePetWindow: resizeDesktopWindow,
    isQuitting: () => lifecycleManager?.isQuitting ?? false,
    initialPetSize: preferences.petSize,
    initialPetPosition: preferences.petPosition,
    initialMouseInteractionMode: preferences.mouseInteractionMode,
    getDisplayId: getDesktopWindowDisplayId,
    persistPetPosition: async (position) => {
      await preferencesStore.updatePetPosition(position);
    }
  });
  const runtimeCoordinator = new RuntimeIpcCoordinator({
    ipcMain,
    loadConfiguration: async () => configuration,
    reportError,
    ...(logger ? { logger } : {})
  });
  const interactionCoordinator = new PetInteractionIpcCoordinator(ipcMain, windowManager);

  let batteryAvailable = false;
  if (process.platform === "darwin") {
    const provider = new MacBatteryStatusProvider();
    try {
      batteryAvailable = Boolean(await provider.sample());
    } catch (error) {
      reportError("Unable to detect macOS battery availability", error);
    } finally {
      await provider.destroy();
    }
  }

  const settingsCoordinator = new SettingsIpcCoordinator({
    ipcMain,
    configuration,
    preferencesStore,
    profileStore,
    listenerManager,
    windowManager,
    runtimeCoordinator,
    batteryAvailable,
    mode,
    ...(logger ? { logger } : {})
  });
  const trayManager = new TrayManager({
    createTray: () => {
      const image = createTrayIcon();
      if (image.isEmpty()) throw new Error("Tray icon could not be loaded");
      return new Tray(image);
    },
    buildMenu: (template) => Menu.buildFromTemplate(template),
    actions: {
      isPetVisible: () => windowManager.getPetWindow()?.isVisible() ?? false,
      showPet: () => { logger?.info("tray.show-pet"); return lifecycleManager?.showPet(); },
      hidePet: () => { logger?.info("tray.hide-pet"); return lifecycleManager?.hidePet(); },
      openSettings: (trigger) => { logger?.info("tray.open-panel"); return lifecycleManager?.showSettings(trigger); },
      requestQuit: () => { logger?.info("tray.quit"); return lifecycleManager?.requestQuit(); }
    },
    reportError
  });

  lifecycleManager = new DesktopLifecycleManager({
    application: app,
    windowManager,
    listenerManager,
    runtimeCoordinator,
    trayManager,
    settingsCoordinator,
    interactionCoordinator,
    ...(logger ? { logger } : {}),
    reportError
  });

  if (process.platform === "darwin") {
    const forwardExternalEvent = (event: Parameters<typeof lifecycleManager.forwardExternalEvent>[0]): boolean => {
      logger?.info("input.external-event", { source: event.source, name: event.name });
      return lifecycleManager!.forwardExternalEvent(event);
    };
    const systemListener = new MacSystemListener();
    const batteryListener = new MacBatteryListener();
    systemListener.onEvent(forwardExternalEvent);
    batteryListener.onEvent(forwardExternalEvent);
    listenerManager.register(systemListener);
    listenerManager.register(batteryListener);
  }

  return lifecycleManager;
}
