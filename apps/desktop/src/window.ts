import { BrowserWindow, screen } from "electron";
import type { Point } from "electron";
import { fileURLToPath } from "node:url";
import { PET_SIZE_LAYOUT } from "./preferences/DesktopPreferences.js";
import type { PetSize, PetWindowPosition } from "./preferences/DesktopPreferences.js";
import { serializeDesktopChannels } from "./ipc/channels.js";

const SCREEN_MARGIN = 16;
export type DesktopMode = "development" | "production";

export function createDesktopWindow(
  mode: DesktopMode,
  petSize: PetSize = "medium",
  savedPosition?: PetWindowPosition
): BrowserWindow {
  const layout = PET_SIZE_LAYOUT[petSize];
  const position = resolveDesktopWindowPosition(savedPosition, layout.windowWidth, layout.windowHeight);
  const window = new BrowserWindow({
    width: layout.windowWidth,
    height: layout.windowHeight,
    x: position.x,
    y: position.y,
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
  const [x, y] = window.getPosition();
  const position = resolveDesktopWindowPosition({ x, y }, layout.windowWidth, layout.windowHeight);
  window.setBounds({
    width: layout.windowWidth,
    height: layout.windowHeight,
    x: position.x,
    y: position.y
  }, true);
}

export function getDesktopWindowDisplayId(window: BrowserWindow): string {
  return String(screen.getDisplayMatching(window.getBounds()).id);
}

export function getPointDisplayWorkArea(
  point: Point
): { x: number; y: number; width: number; height: number } {
  const { workArea } = screen.getDisplayNearestPoint(point);
  return workArea;
}

export function getCursorScreenPoint(): Point {
  return screen.getCursorScreenPoint();
}

export function resolveDesktopWindowPosition(
  savedPosition: PetWindowPosition | undefined,
  width: number,
  height: number
): { x: number; y: number } {
  const displays = screen.getAllDisplays();
  const preferred = savedPosition?.displayId
    ? displays.find(({ id }) => String(id) === savedPosition.displayId)
    : undefined;
  const display = preferred
    ?? (savedPosition
      ? displays.find(({ workArea }) =>
        savedPosition.x < workArea.x + workArea.width
        && savedPosition.x + width > workArea.x
        && savedPosition.y < workArea.y + workArea.height
        && savedPosition.y + height > workArea.y)
      : undefined)
    ?? screen.getPrimaryDisplay();
  const { workArea } = display;
  if (!savedPosition || (!preferred && display === screen.getPrimaryDisplay()
    && !displays.some(({ workArea: area }) =>
      savedPosition.x < area.x + area.width && savedPosition.x + width > area.x
      && savedPosition.y < area.y + area.height && savedPosition.y + height > area.y))) {
    return {
      x: workArea.x + workArea.width - width - SCREEN_MARGIN,
      y: workArea.y + workArea.height - height - SCREEN_MARGIN
    };
  }
  return {
    x: Math.min(Math.max(savedPosition.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(savedPosition.y, workArea.y), workArea.y + workArea.height - height)
  };
}

export function createSettingsWindow(mode: DesktopMode = "development"): BrowserWindow {
  const window = new BrowserWindow({
    width: 460,
    height: 720,
    title: "Companion 控制面板",
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [
        "--companion-window=settings",
        `--companion-mode=${mode}`,
        serializeDesktopChannels()
      ]
    }
  });
  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setHiddenInMissionControl(true);
  window.loadFile(fileURLToPath(new URL("../settings.html", import.meta.url)));
  return window;
}
