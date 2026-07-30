import type {
  MouseInteractionMode,
  PetSize,
  PetWindowPosition
} from "../preferences/DesktopPreferences.js";

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
  getPosition(): number[];
  setPosition(x: number, y: number, animate?: boolean): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
  on(
    event: "close" | "closed" | "move",
    handler: ((event: WindowCloseEvent) => void) | (() => void)
  ): void;
}

export type PetWindowFactory<TWindow extends PetWindow = PetWindow> = (
  petSize: PetSize,
  position?: PetWindowPosition
) => TWindow;

export interface WindowManagerOptions<TWindow extends PetWindow = PetWindow> {
  readonly createWindow: PetWindowFactory<TWindow>;
  readonly createSettingsWindow?: () => TWindow;
  readonly resizePetWindow?: (window: TWindow, petSize: PetSize) => void;
  readonly isQuitting: () => boolean;
  readonly initialPetSize?: PetSize;
  readonly initialPetPosition?: PetWindowPosition;
  readonly initialMouseInteractionMode?: MouseInteractionMode;
  readonly getDisplayId?: (window: TWindow) => string | undefined;
  readonly persistPetPosition?: (position: PetWindowPosition) => Promise<void>;
  readonly positionDebounceMs?: number;
}

export class WindowManager<TWindow extends PetWindow = PetWindow> {
  readonly #createWindow: PetWindowFactory<TWindow>;
  readonly #createSettingsWindow?: () => TWindow;
  readonly #resizePetWindow?: (window: TWindow, petSize: PetSize) => void;
  readonly #isQuitting: () => boolean;
  #petWindow?: TWindow;
  #settingsWindow?: TWindow;
  #petSize: PetSize;
  #petPosition?: PetWindowPosition;
  #mouseInteractionMode: MouseInteractionMode;
  readonly #getDisplayId?: (window: TWindow) => string | undefined;
  readonly #persistPetPosition?: (position: PetWindowPosition) => Promise<void>;
  readonly #positionDebounceMs: number;
  #positionTimer?: ReturnType<typeof setTimeout>;
  #pendingPosition?: PetWindowPosition;
  #positionSave?: Promise<void>;

  constructor({
    createWindow,
    createSettingsWindow,
    resizePetWindow,
    isQuitting,
    initialPetSize = "medium",
    initialPetPosition,
    initialMouseInteractionMode = "interactive",
    getDisplayId,
    persistPetPosition,
    positionDebounceMs = 250
  }: WindowManagerOptions<TWindow>) {
    this.#createWindow = createWindow;
    this.#createSettingsWindow = createSettingsWindow;
    this.#resizePetWindow = resizePetWindow;
    this.#isQuitting = isQuitting;
    this.#petSize = initialPetSize;
    this.#petPosition = initialPetPosition;
    this.#mouseInteractionMode = initialMouseInteractionMode;
    this.#getDisplayId = getDisplayId;
    this.#persistPetPosition = persistPetPosition;
    this.#positionDebounceMs = positionDebounceMs;
  }

  createPetWindow(): TWindow {
    const existing = this.getPetWindow();
    if (existing) return existing;

    const window = this.#createWindow(this.#petSize, this.#petPosition);
    this.#petWindow = window;
    window.setIgnoreMouseEvents(this.#mouseInteractionMode === "click-through", { forward: true });
    window.on("close", (event) => {
      if (this.#isQuitting()) return;
      event.preventDefault();
      window.hide();
    });
    window.on("closed", () => {
      if (this.#petWindow === window) this.#petWindow = undefined;
    });
    window.on("move", () => this.#schedulePositionSave(window));
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

  getPetPosition(): PetWindowPosition | undefined {
    const window = this.getPetWindow();
    if (!window) return this.#petPosition ? { ...this.#petPosition } : undefined;
    const [x = 0, y = 0] = window.getPosition();
    return { x, y, ...(this.#getDisplayId?.(window) ? { displayId: this.#getDisplayId?.(window) } : {}) };
  }

  setPetPosition(position: PetWindowPosition): void {
    this.#petPosition = { ...position };
    this.getPetWindow()?.setPosition(position.x, position.y, false);
  }

  movePetBy(deltaX: number, deltaY: number): void {
    const window = this.getPetWindow();
    if (!window || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    const [x = 0, y = 0] = window.getPosition();
    window.setPosition(Math.round(x + deltaX), Math.round(y + deltaY), false);
  }

  setIgnoreMouseEvents(ignore: boolean): void {
    this.#mouseInteractionMode = ignore ? "click-through" : "interactive";
    this.getPetWindow()?.setIgnoreMouseEvents(ignore, { forward: true });
  }

  get mouseInteractionMode(): MouseInteractionMode {
    return this.#mouseInteractionMode;
  }

  async flushPetPosition(): Promise<void> {
    if (this.#positionTimer) {
      clearTimeout(this.#positionTimer);
      this.#positionTimer = undefined;
      this.#writePendingPosition();
    }
    await this.#positionSave;
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

  #schedulePositionSave(window: TWindow): void {
    const [x = 0, y = 0] = window.getPosition();
    const displayId = this.#getDisplayId?.(window);
    this.#pendingPosition = { x, y, ...(displayId ? { displayId } : {}) };
    this.#petPosition = this.#pendingPosition;
    if (this.#positionTimer) clearTimeout(this.#positionTimer);
    this.#positionTimer = setTimeout(() => {
      this.#positionTimer = undefined;
      this.#writePendingPosition();
    }, this.#positionDebounceMs);
  }

  #writePendingPosition(): void {
    const position = this.#pendingPosition;
    this.#pendingPosition = undefined;
    if (!position || !this.#persistPetPosition) return;
    const previous = this.#positionSave ?? Promise.resolve();
    this.#positionSave = previous.catch(() => undefined).then(() => this.#persistPetPosition?.(position));
  }
}
