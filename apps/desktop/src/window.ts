import { BrowserWindow, screen } from "electron";
import { fileURLToPath } from "node:url";

const WINDOW_WIDTH = 280;
const WINDOW_HEIGHT = 240;
const SCREEN_MARGIN = 16;
export type DesktopMode = "development" | "production";

export function createDesktopWindow(mode: DesktopMode): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: workArea.x + workArea.width - WINDOW_WIDTH - SCREEN_MARGIN,
    y: workArea.y + workArea.height - WINDOW_HEIGHT - SCREEN_MARGIN,
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
      additionalArguments: [`--companion-mode=${mode}`]
    }
  });

  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setHiddenInMissionControl(true);
  window.loadFile(fileURLToPath(new URL("../index.html", import.meta.url)));
  window.once("ready-to-show", () => window.showInactive());
  return window;
}
