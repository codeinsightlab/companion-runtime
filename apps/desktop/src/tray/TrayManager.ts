import type { MenuItemConstructorOptions } from "electron";
import type { PanelBounds, ScreenPoint } from "../panel/PanelController.js";

export interface TrayHandle {
  destroy(): void;
  isDestroyed(): boolean;
  setContextMenu(menu: unknown): void;
  setToolTip(toolTip: string): void;
  getBounds(): PanelBounds;
}

export interface TrayManagerActions {
  readonly isPetVisible: () => boolean;
  readonly showPet: () => void | Promise<void>;
  readonly hidePet: () => void | Promise<void>;
  readonly openSettings: (trigger: ScreenPoint) => void | Promise<void>;
  readonly requestQuit: () => void | Promise<void>;
}

export interface TrayManagerOptions {
  readonly createTray: () => TrayHandle;
  readonly buildMenu: (template: MenuItemConstructorOptions[]) => unknown;
  readonly actions: TrayManagerActions;
  readonly reportError?: (message: string, error: unknown) => void;
}

export class TrayManager {
  readonly #createTray: () => TrayHandle;
  readonly #buildMenu: (template: MenuItemConstructorOptions[]) => unknown;
  readonly #actions: TrayManagerActions;
  readonly #reportError: (message: string, error: unknown) => void;
  #tray?: TrayHandle;

  constructor({ createTray, buildMenu, actions, reportError = console.error }: TrayManagerOptions) {
    this.#createTray = createTray;
    this.#buildMenu = buildMenu;
    this.#actions = actions;
    this.#reportError = reportError;
  }

  create(): boolean {
    if (this.isCreated()) return true;
    try {
      const tray = this.#createTray();
      this.#tray = tray;
      tray.setToolTip("Companion");
      this.refreshMenu();
      return true;
    } catch (error) {
      this.#tray = undefined;
      this.#reportError("Unable to create Companion Tray", error);
      return false;
    }
  }

  refreshMenu(): void {
    const tray = this.#tray;
    if (!tray || tray.isDestroyed()) return;
    try {
      tray.setContextMenu(this.#buildMenu([
        this.#actions.isPetVisible()
          ? { label: "隐藏宠物", click: () => this.#run("Unable to hide pet", this.#actions.hidePet) }
          : { label: "显示宠物", click: () => this.#run("Unable to show pet", this.#actions.showPet) },
        {
          label: "打开控制面板",
          click: () => {
            const bounds = tray.getBounds();
            const trigger = {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height
            };
            this.#run(
              "Unable to open Companion panel",
              () => this.#actions.openSettings(trigger)
            );
          }
        },
        { type: "separator" },
        { label: "退出 Companion", click: () => this.#run("Unable to quit Companion", this.#actions.requestQuit) }
      ]));
    } catch (error) {
      this.#reportError("Unable to refresh Companion Tray menu", error);
    }
  }

  destroy(): void {
    const tray = this.#tray;
    this.#tray = undefined;
    if (!tray || tray.isDestroyed()) return;
    try {
      tray.destroy();
    } catch (error) {
      this.#reportError("Unable to destroy Companion Tray", error);
    }
  }

  isCreated(): boolean {
    return Boolean(this.#tray && !this.#tray.isDestroyed());
  }

  #run(message: string, action: () => void | Promise<void>): void {
    try {
      Promise.resolve(action())
        .catch((error: unknown) => this.#reportError(message, error))
        .finally(() => this.refreshMenu());
    } catch (error) {
      this.#reportError(message, error);
    }
  }
}
