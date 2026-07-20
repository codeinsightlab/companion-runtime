import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { ListenerManager } from "../../../../packages/listeners/core/ListenerManager.js";
import { MacBatteryListener } from "../../../../packages/listeners/system/macos/MacBatteryListener.js";
import { MacSystemListener } from "../../../../packages/listeners/system/macos/MacSystemListener.js";
import { loadDesktopRuntimeConfiguration } from "../config.js";
import { createDesktopWindow } from "../window.js";
import type { DesktopMode } from "../window.js";
import { RuntimeIpcCoordinator } from "../runtime/RuntimeIpcCoordinator.js";
import { WindowManager } from "../window/WindowManager.js";
import { DesktopLifecycleManager } from "./DesktopLifecycleManager.js";

export function createDesktopLifecycleManager(
  mode: DesktopMode
): DesktopLifecycleManager<BrowserWindow> {
  const listenerManager = new ListenerManager();
  let lifecycleManager: DesktopLifecycleManager<BrowserWindow> | undefined;
  const windowManager = new WindowManager<BrowserWindow>({
    createWindow: () => createDesktopWindow(mode),
    isQuitting: () => lifecycleManager?.isQuitting ?? false
  });
  const runtimeCoordinator = new RuntimeIpcCoordinator({
    ipcMain,
    loadConfiguration: loadDesktopRuntimeConfiguration
  });

  lifecycleManager = new DesktopLifecycleManager({
    application: app,
    windowManager,
    listenerManager,
    runtimeCoordinator
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
