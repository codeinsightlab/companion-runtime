import { BrowserWindow, screen } from "electron";
import { fileURLToPath } from "node:url";
import { PET_SIZE_LAYOUT } from "./preferences/DesktopPreferences.js";
import type { PetSize } from "./preferences/DesktopPreferences.js";
import { serializeDesktopChannels } from "./ipc/channels.js";

const SCREEN_MARGIN = 16;
export type DesktopMode = "development" | "production";

export function createDesktopWindow(mode: DesktopMode, petSize: PetSize = "medium"): BrowserWindow {
  const layout = PET_SIZE_LAYOUT[petSize];
  const { workArea } = screen.getPrimaryDisplay();
  const window = new BrowserWindow({
    width: layout.windowWidth,
    height: layout.windowHeight,
    x: workArea.x + workArea.width - layout.windowWidth - SCREEN_MARGIN,
    y: workArea.y + workArea.height - layout.windowHeight - SCREEN_MARGIN,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--companion-mode=${mode}`, serializeDesktopChannels()]
    }
  });

  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setHiddenInMissionControl(true);
  window.loadFile(fileURLToPath(new URL("../index.html", import.meta.url)));
  window.once("ready-to-show", () => window.showInactive());
  return window;
}

export function resizeDesktopWindow(window: BrowserWindow, petSize: PetSize): void {
  const layout = PET_SIZE_LAYOUT[petSize];
  const display = screen.getDisplayMatching(window.getBounds());
  const { workArea } = display;
  window.setBounds({
    width: layout.windowWidth,
    height: layout.windowHeight,
    x: workArea.x + workArea.width - layout.windowWidth - SCREEN_MARGIN,
    y: workArea.y + workArea.height - layout.windowHeight - SCREEN_MARGIN
  }, true);
}

export function createSettingsWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 460,
    height: 690,
    minWidth: 420,
    minHeight: 600,
    title: "Companion 设置",
    show: false,
    backgroundColor: "#f4f5f7",
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ["--companion-window=settings", serializeDesktopChannels()]
    }
  });
  window.loadFile(fileURLToPath(new URL("../settings.html", import.meta.url)));
  window.once("ready-to-show", () => window.show());
  return window;
}
