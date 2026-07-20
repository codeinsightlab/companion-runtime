import type { ListenerManager } from "../../../../packages/listeners/core/ListenerManager.js";
import type { ExternalEvent } from "../../../../packages/listeners/core/ExternalEvent.js";
import type { PetWindow, WindowManager } from "../window/WindowManager.js";

export interface BeforeQuitEvent {
  preventDefault(): void;
}

export interface DesktopApplication {
  whenReady(): Promise<void>;
  on(event: "activate" | "second-instance", handler: () => void): void;
  on(event: "before-quit", handler: (event: BeforeQuitEvent) => void): void;
  off(event: "activate" | "second-instance", handler: () => void): void;
  off(event: "before-quit", handler: (event: BeforeQuitEvent) => void): void;
  quit(): void;
}

export interface RuntimeCoordinator<TWindow extends PetWindow> {
  register(): void;
  unregister(): void;
  waitForReady(window: TWindow, timeoutMs?: number): Promise<void>;
  requestStop(window: TWindow, timeoutMs?: number): Promise<void>;
  sendExternalEvent(window: TWindow | undefined, event: ExternalEvent): boolean;
}

export interface DesktopLifecycleManagerOptions<TWindow extends PetWindow> {
  readonly application: DesktopApplication;
  readonly windowManager: WindowManager<TWindow>;
  readonly listenerManager: ListenerManager;
  readonly runtimeCoordinator: RuntimeCoordinator<TWindow>;
  readonly runtimeReadyTimeoutMs?: number;
  readonly runtimeStopTimeoutMs?: number;
  readonly reportError?: (message: string, error: unknown) => void;
}

export class DesktopLifecycleManager<TWindow extends PetWindow> {
  readonly #application: DesktopApplication;
  readonly #windowManager: WindowManager<TWindow>;
  readonly #listenerManager: ListenerManager;
  readonly #runtimeCoordinator: RuntimeCoordinator<TWindow>;
  readonly #runtimeReadyTimeoutMs: number;
  readonly #runtimeStopTimeoutMs: number;
  readonly #reportError: (message: string, error: unknown) => void;
  #started = false;
  #shutdownComplete = false;
  #shutdownPromise?: Promise<void>;

  constructor({
    application,
    windowManager,
    listenerManager,
    runtimeCoordinator,
    runtimeReadyTimeoutMs = 5_000,
    runtimeStopTimeoutMs = 2_000,
    reportError = console.error
  }: DesktopLifecycleManagerOptions<TWindow>) {
    this.#application = application;
    this.#windowManager = windowManager;
    this.#listenerManager = listenerManager;
    this.#runtimeCoordinator = runtimeCoordinator;
    this.#runtimeReadyTimeoutMs = runtimeReadyTimeoutMs;
    this.#runtimeStopTimeoutMs = runtimeStopTimeoutMs;
    this.#reportError = reportError;
  }

  get isQuitting(): boolean {
    return Boolean(this.#shutdownPromise) || this.#shutdownComplete;
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    this.#registerApplicationEvents();
    this.#runtimeCoordinator.register();
    await this.#application.whenReady();
    if (this.isQuitting) return;

    const window = this.#windowManager.createPetWindow();
    await this.#runtimeCoordinator.waitForReady(window, this.#runtimeReadyTimeoutMs);
    try {
      await this.#listenerManager.startAll();
    } catch (error) {
      this.#reportError("One or more Desktop Listeners failed to start", error);
    }
  }

  showPet(): void {
    if (this.isQuitting) return;
    this.#windowManager.showPetWindow();
    this.#windowManager.focusPetWindow();
  }

  hidePet(): void {
    if (this.isQuitting) return;
    this.#windowManager.hidePetWindow();
  }

  forwardExternalEvent(event: ExternalEvent): boolean {
    if (this.isQuitting) return false;
    return this.#runtimeCoordinator.sendExternalEvent(this.#windowManager.getPetWindow(), event);
  }

  requestQuit(): Promise<void> {
    if (this.#shutdownPromise) return this.#shutdownPromise;
    this.#shutdownPromise = this.#shutdown();
    return this.#shutdownPromise;
  }

  async #shutdown(): Promise<void> {
    const window = this.#windowManager.getPetWindow();
    try {
      await this.#listenerManager.destroyAll();
    } catch (error) {
      this.#reportError("Unable to destroy all Desktop Listeners", error);
    }

    if (window) {
      try {
        await this.#runtimeCoordinator.requestStop(window, this.#runtimeStopTimeoutMs);
      } catch (error) {
        this.#reportError("Unable to confirm Renderer Runtime stop", error);
      }
    }

    try {
      this.#windowManager.destroyPetWindow();
    } catch (error) {
      this.#reportError("Unable to destroy pet window", error);
    }
    this.#runtimeCoordinator.unregister();
    this.#unregisterApplicationEvents();
    this.#shutdownComplete = true;
    this.#application.quit();
  }

  #handleShowRequest = (): void => this.showPet();

  #handleBeforeQuit = (event: BeforeQuitEvent): void => {
    if (this.#shutdownComplete) return;
    event.preventDefault();
    void this.requestQuit();
  };

  #registerApplicationEvents(): void {
    this.#application.on("activate", this.#handleShowRequest);
    this.#application.on("second-instance", this.#handleShowRequest);
    this.#application.on("before-quit", this.#handleBeforeQuit);
  }

  #unregisterApplicationEvents(): void {
    this.#application.off("activate", this.#handleShowRequest);
    this.#application.off("second-instance", this.#handleShowRequest);
    this.#application.off("before-quit", this.#handleBeforeQuit);
  }
}
