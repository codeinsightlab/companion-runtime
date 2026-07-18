import { app, BrowserWindow, ipcMain } from "electron";
import { loadDesktopRuntimeConfiguration } from "./config.js";
import { createDesktopWindow } from "./window.js";
import { ListenerManager } from "../../../packages/listeners/core/ListenerManager.js";
import { MacSystemListener } from "../../../packages/listeners/system/macos/MacSystemListener.js";

const listenerManager = new ListenerManager();

if (process.platform === "darwin") {
  const systemListener = new MacSystemListener();
  systemListener.onEvent((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("companion:external-event", event);
    }
  });
  listenerManager.register(systemListener);
}

ipcMain.handle("companion:load-runtime-configuration", () => loadDesktopRuntimeConfiguration());

app.whenReady().then(() => {
  const window = createDesktopWindow();
  window.webContents.once("did-finish-load", () => {
    listenerManager.startAll().catch((error: unknown) => {
      console.error("Unable to start Desktop Listeners", error);
    });
  });
}).catch((error: unknown) => {
  console.error("Unable to start Companion Desktop", error);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createDesktopWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  listenerManager.stopAll().catch((error: unknown) => {
    console.error("Unable to stop Desktop Listeners", error);
  });
});
