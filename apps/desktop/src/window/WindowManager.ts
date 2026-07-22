import type { PetSize } from "../preferences/DesktopPreferences.js";

export interface WindowCloseEvent {
  preventDefault(): void;
}

export interface PetWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  show(): void;
  showInactive(): void;
  hide(): void;
  focus(): void;
  restore(): void;
  destroy(): void;
  on(event: "close", handler: (event: WindowCloseEvent) => void): void;
  on(event: "closed", handler: () => void): void;
}

export type PetWindowFactory<TWindow extends PetWindow = PetWindow> = (petSize: PetSize) => TWindow;

export interface WindowManagerOptions<TWindow extends PetWindow = PetWindow> {
  readonly createWindow: PetWindowFactory<TWindow>;
  readonly createSettingsWindow?: () => TWindow;
  readonly resizePetWindow?: (window: TWindow, petSize: PetSize) => void;
  readonly isQuitting: () => boolean;
  readonly initialPetSize?: PetSize;
}

export class WindowManager<TWindow extends PetWindow = PetWindow> {
  readonly #createWindow: PetWindowFactory<TWindow>;
  readonly #createSettingsWindow?: () => TWindow;
  readonly #resizePetWindow?: (window: TWindow, petSize: PetSize) => void;
  readonly #isQuitting: () => boolean;
  #petWindow?: TWindow;
  #settingsWindow?: TWindow;
  #petSize: PetSize;

  constructor({
    createWindow,
    createSettingsWindow,
    resizePetWindow,
    isQuitting,
    initialPetSize = "medium"
  }: WindowManagerOptions<TWindow>) {
    this.#createWindow = createWindow;
    this.#createSettingsWindow = createSettingsWindow;
    this.#resizePetWindow = resizePetWindow;
    this.#isQuitting = isQuitting;
    this.#petSize = initialPetSize;
  }

  createPetWindow(): TWindow {
    const existing = this.getPetWindow();
    if (existing) return existing;

    const window = this.#createWindow(this.#petSize);
    this.#petWindow = window;
    window.on("close", (event) => {
      if (this.#isQuitting()) return;
      event.preventDefault();
      window.hide();
    });
    window.on("closed", () => {
      if (this.#petWindow === window) this.#petWindow = undefined;
    });
    return window;
  }

  getPetWindow(): TWindow | undefined {
    if (this.#petWindow?.isDestroyed()) this.#petWindow = undefined;
    return this.#petWindow;
  }

  hasPetWindow(): boolean {
    return Boolean(this.getPetWindow());
  }

  showPetWindow(): TWindow {
    const window = this.createPetWindow();
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    return window;
  }

  hidePetWindow(): void {
    const window = this.getPetWindow();
    if (window?.isVisible()) window.hide();
  }

  focusPetWindow(): TWindow {
    const window = this.showPetWindow();
    window.focus();
    return window;
  }

  destroyPetWindow(): void {
    const window = this.getPetWindow();
    if (!window) return;
    window.destroy();
    if (this.#petWindow === window) this.#petWindow = undefined;
  }

  setPetSize(petSize: PetSize): void {
    this.#petSize = petSize;
    const window = this.getPetWindow();
    if (window) this.#resizePetWindow?.(window, petSize);
  }

  get petSize(): PetSize {
    return this.#petSize;
  }

  createSettingsWindow(): TWindow {
    const existing = this.getSettingsWindow();
    if (existing) return existing;
    if (!this.#createSettingsWindow) throw new Error("Settings Window factory is not configured");
    const window = this.#createSettingsWindow();
    this.#settingsWindow = window;
    window.on("closed", () => {
      if (this.#settingsWindow === window) this.#settingsWindow = undefined;
    });
    return window;
  }

  getSettingsWindow(): TWindow | undefined {
    if (this.#settingsWindow?.isDestroyed()) this.#settingsWindow = undefined;
    return this.#settingsWindow;
  }

  hasSettingsWindow(): boolean {
    return Boolean(this.getSettingsWindow());
  }

  showSettingsWindow(): TWindow {
    const window = this.createSettingsWindow();
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    return window;
  }

  focusSettingsWindow(): TWindow {
    const window = this.showSettingsWindow();
    window.focus();
    return window;
  }

  destroySettingsWindow(): void {
    const window = this.getSettingsWindow();
    if (!window) return;
    window.destroy();
    if (this.#settingsWindow === window) this.#settingsWindow = undefined;
  }

  destroyAllWindows(): void {
    this.destroySettingsWindow();
    this.destroyPetWindow();
  }
}
