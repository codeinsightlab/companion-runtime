import type { MenuItemConstructorOptions } from "electron";

export interface TrayHandle {
  destroy(): void;
  isDestroyed(): boolean;
  setContextMenu(menu: unknown): void;
  setToolTip(toolTip: string): void;
}

export interface TrayManagerActions {
  readonly showPet: () => void | Promise<void>;
  readonly hidePet: () => void | Promise<void>;
  readonly openSettings: () => void | Promise<void>;
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
        { label: "显示宠物", click: () => this.#run("Unable to show pet", this.#actions.showPet) },
        { label: "隐藏宠物", click: () => this.#run("Unable to hide pet", this.#actions.hidePet) },
        { label: "打开设置", click: () => this.#run("Unable to open Settings", this.#actions.openSettings) },
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
      Promise.resolve(action()).catch((error: unknown) => this.#reportError(message, error));
    } catch (error) {
      this.#reportError(message, error);
    }
  }
}
