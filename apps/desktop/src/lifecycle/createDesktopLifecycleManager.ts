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
import { createDesktopWindow, createSettingsWindow, resizeDesktopWindow } from "../window.js";
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

export async function createDesktopLifecycleManager(
  mode: DesktopMode
): Promise<DesktopLifecycleManager<BrowserWindow>> {
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
    console.error("Persisted User Profile is invalid; default profile is used", error);
    await profileStore.save(validProfile);
  }
  configuration.userProfile = validProfile;
  configuration.runtimeConfig = {
    ...configuration.runtimeConfig,
    size: PET_SIZE_LAYOUT[preferences.petSize].viewer
  };

  const listenerManager = new ListenerManager();
  let lifecycleManager: DesktopLifecycleManager<BrowserWindow> | undefined;
  const windowManager = new WindowManager<BrowserWindow>({
    createWindow: (petSize) => createDesktopWindow(mode, petSize),
    createSettingsWindow,
    resizePetWindow: resizeDesktopWindow,
    isQuitting: () => lifecycleManager?.isQuitting ?? false,
    initialPetSize: preferences.petSize
  });
  const runtimeCoordinator = new RuntimeIpcCoordinator({
    ipcMain,
    loadConfiguration: async () => configuration
  });

  let batteryAvailable = false;
  if (process.platform === "darwin") {
    const provider = new MacBatteryStatusProvider();
    try {
      batteryAvailable = Boolean(await provider.sample());
    } catch (error) {
      console.error("Unable to detect macOS battery availability", error);
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
    batteryAvailable
  });
  const trayManager = new TrayManager({
    createTray: () => {
      const image = createTrayIcon();
      if (image.isEmpty()) throw new Error("Tray icon could not be loaded");
      return new Tray(image);
    },
    buildMenu: (template) => Menu.buildFromTemplate(template),
    actions: {
      showPet: () => lifecycleManager?.showPet(),
      hidePet: () => lifecycleManager?.hidePet(),
      openSettings: () => lifecycleManager?.showSettings(),
      requestQuit: () => lifecycleManager?.requestQuit()
    }
  });

  lifecycleManager = new DesktopLifecycleManager({
    application: app,
    windowManager,
    listenerManager,
    runtimeCoordinator,
    trayManager,
    settingsCoordinator
  });

  if (process.platform === "darwin") {
    const forwardExternalEvent = lifecycleManager.forwardExternalEvent.bind(lifecycleManager);
    const systemListener = new MacSystemListener();
    const batteryListener = new MacBatteryListener();
    systemListener.onEvent(forwardExternalEvent);
    batteryListener.onEvent(forwardExternalEvent);
    listenerManager.register(systemListener);
    listenerManager.register(batteryListener);
  }

  return lifecycleManager;
}
