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

export type PetWindowFactory<TWindow extends PetWindow = PetWindow> = () => TWindow;

export interface WindowManagerOptions<TWindow extends PetWindow = PetWindow> {
  readonly createWindow: PetWindowFactory<TWindow>;
  readonly isQuitting: () => boolean;
}

export class WindowManager<TWindow extends PetWindow = PetWindow> {
  readonly #createWindow: PetWindowFactory<TWindow>;
  readonly #isQuitting: () => boolean;
  #petWindow?: TWindow;

  constructor({ createWindow, isQuitting }: WindowManagerOptions<TWindow>) {
    this.#createWindow = createWindow;
    this.#isQuitting = isQuitting;
  }

  createPetWindow(): TWindow {
    const existing = this.getPetWindow();
    if (existing) return existing;

    const window = this.#createWindow();
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
}
