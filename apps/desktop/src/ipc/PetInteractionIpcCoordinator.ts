import type { BrowserWindow, IpcMain, IpcMainEvent } from "electron";
import { DESKTOP_CHANNELS } from "./channels.js";
import type { WindowManager } from "../window/WindowManager.js";

export class PetInteractionIpcCoordinator {
  readonly #ipcMain: IpcMain;
  readonly #windowManager: WindowManager<BrowserWindow>;
  #registered = false;

  constructor(ipcMain: IpcMain, windowManager: WindowManager<BrowserWindow>) {
    this.#ipcMain = ipcMain;
    this.#windowManager = windowManager;
  }

  register(): void {
    if (this.#registered) return;
    this.#registered = true;
    this.#ipcMain.on(DESKTOP_CHANNELS.petDrag, this.#handleDrag);
  }

  unregister(): void {
    if (!this.#registered) return;
    this.#registered = false;
    this.#ipcMain.removeListener(DESKTOP_CHANNELS.petDrag, this.#handleDrag);
  }

  #handleDrag = (event: IpcMainEvent, deltaX: unknown, deltaY: unknown): void => {
    const petWindow = this.#windowManager.getPetWindow();
    if (!petWindow || petWindow.isDestroyed() || petWindow.webContents.id !== event.sender.id) return;
    if (typeof deltaX !== "number" || typeof deltaY !== "number") return;
    this.#windowManager.movePetBy(deltaX, deltaY);
  };
}
