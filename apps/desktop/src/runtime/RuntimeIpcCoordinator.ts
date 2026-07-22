import type {
  BrowserWindow,
  IpcMain,
  IpcMainEvent
} from "electron";
import type { ExternalEvent } from "../../../../packages/listeners/core/ExternalEvent.js";
import type { DesktopRuntimeConfiguration } from "../types.js";
import type { PetSize } from "../preferences/DesktopPreferences.js";
import { DESKTOP_CHANNELS } from "../ipc/channels.js";

interface Waiter {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export interface RuntimeIpcCoordinatorOptions {
  readonly ipcMain: IpcMain;
  readonly loadConfiguration: () => Promise<DesktopRuntimeConfiguration>;
  readonly reportError?: (message: string, error: unknown) => void;
}

export class RuntimeIpcCoordinator {
  readonly #ipcMain: IpcMain;
  readonly #loadConfiguration: () => Promise<DesktopRuntimeConfiguration>;
  readonly #reportError: (message: string, error: unknown) => void;
  readonly #ready = new Set<number>();
  readonly #readyWaiters = new Map<number, Waiter>();
  readonly #stopWaiters = new Map<number, Waiter>();
  #registered = false;

  constructor({ ipcMain, loadConfiguration, reportError = console.error }: RuntimeIpcCoordinatorOptions) {
    this.#ipcMain = ipcMain;
    this.#loadConfiguration = loadConfiguration;
    this.#reportError = reportError;
  }

  register(): void {
    if (this.#registered) return;
    this.#registered = true;
    this.#ipcMain.handle(DESKTOP_CHANNELS.loadRuntimeConfiguration, this.#loadConfiguration);
    this.#ipcMain.on(DESKTOP_CHANNELS.runtimeReady, this.#handleReady);
    this.#ipcMain.on(DESKTOP_CHANNELS.runtimeStopped, this.#handleStopped);
    this.#ipcMain.on(DESKTOP_CHANNELS.runtimeError, this.#handleError);
  }

  unregister(): void {
    if (!this.#registered) return;
    this.#registered = false;
    this.#ipcMain.removeHandler(DESKTOP_CHANNELS.loadRuntimeConfiguration);
    this.#ipcMain.removeListener(DESKTOP_CHANNELS.runtimeReady, this.#handleReady);
    this.#ipcMain.removeListener(DESKTOP_CHANNELS.runtimeStopped, this.#handleStopped);
    this.#ipcMain.removeListener(DESKTOP_CHANNELS.runtimeError, this.#handleError);
    this.#rejectWaiters(this.#readyWaiters, "Runtime IPC Coordinator was unregistered");
    this.#rejectWaiters(this.#stopWaiters, "Runtime IPC Coordinator was unregistered");
    this.#ready.clear();
  }

  waitForReady(window: BrowserWindow, timeoutMs = 5_000): Promise<void> {
    if (!this.#canSend(window)) return Promise.reject(new Error("Pet window is unavailable"));
    const id = window.webContents.id;
    if (this.#ready.has(id)) return Promise.resolve();
    return this.#createWaiter(this.#readyWaiters, id, timeoutMs, "Runtime ready timed out");
  }

  requestStop(window: BrowserWindow, timeoutMs = 2_000): Promise<void> {
    if (!this.#canSend(window)) return Promise.resolve();
    const id = window.webContents.id;
    const waiting = this.#createWaiter(this.#stopWaiters, id, timeoutMs, "Runtime stop timed out");
    window.webContents.send(DESKTOP_CHANNELS.runtimeStop);
    return waiting;
  }

  sendExternalEvent(window: BrowserWindow | undefined, event: ExternalEvent): boolean {
    if (!window || !this.#canSend(window)) return false;
    window.webContents.send(DESKTOP_CHANNELS.externalEvent, event);
    return true;
  }

  sendCharacterChanged(window: BrowserWindow | undefined, characterId: string): boolean {
    if (!window || !this.#canSend(window)) return false;
    window.webContents.send(DESKTOP_CHANNELS.characterChanged, characterId);
    return true;
  }

  sendPetSizeChanged(window: BrowserWindow | undefined, petSize: PetSize, pixels: number): boolean {
    if (!window || !this.#canSend(window)) return false;
    window.webContents.send(DESKTOP_CHANNELS.petSizeChanged, petSize, pixels);
    return true;
  }

  #handleReady = (event: IpcMainEvent): void => {
    this.#ready.add(event.sender.id);
    this.#resolveWaiter(this.#readyWaiters, event.sender.id);
  };

  #handleStopped = (event: IpcMainEvent): void => {
    this.#ready.delete(event.sender.id);
    this.#resolveWaiter(this.#stopWaiters, event.sender.id);
  };

  #handleError = (event: IpcMainEvent, error: unknown): void => {
    this.#reportError(`Renderer Runtime error from webContents ${event.sender.id}`, error);
  };

  #createWaiter(
    waiters: Map<number, Waiter>,
    id: number,
    timeoutMs: number,
    message: string
  ): Promise<void> {
    const existing = waiters.get(id);
    if (existing) return new Promise((resolve, reject) => {
      const originalResolve = existing.resolve;
      const originalReject = existing.reject;
      waiters.set(id, {
        ...existing,
        resolve: () => { originalResolve(); resolve(); },
        reject: (error) => { originalReject(error); reject(error); }
      });
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(message));
      }, timeoutMs);
      waiters.set(id, { resolve, reject, timeout });
    });
  }

  #resolveWaiter(waiters: Map<number, Waiter>, id: number): void {
    const waiter = waiters.get(id);
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    waiters.delete(id);
    waiter.resolve();
  }

  #rejectWaiters(waiters: Map<number, Waiter>, message: string): void {
    for (const waiter of waiters.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error(message));
    }
    waiters.clear();
  }

  #canSend(window: BrowserWindow): boolean {
    return !window.isDestroyed() && !window.webContents.isDestroyed();
  }
}
