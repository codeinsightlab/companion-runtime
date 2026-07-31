export interface PanelBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface PanelCloseEvent {
  preventDefault(): void;
}

export interface PanelWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  show(): void;
  hide(): void;
  focus(): void;
  restore(): void;
  destroy(): void;
  getBounds(): PanelBounds;
  setBounds(bounds: PanelBounds, animate?: boolean): void;
  on(
    event: "blur" | "close" | "closed",
    handler: ((event: PanelCloseEvent) => void) | (() => void)
  ): void;
}

export interface PanelControllerOptions<TWindow extends PanelWindow> {
  readonly createPanel: () => TWindow;
  readonly getDefaultAnchor: () => ScreenPoint;
  readonly getDisplayWorkArea: (anchor: ScreenPoint) => PanelBounds;
  readonly isQuitting: () => boolean;
  readonly activate?: () => void;
  readonly gap?: number;
  readonly margin?: number;
  readonly focusDelayMs?: number;
}

export function calculatePopoverBounds(
  anchor: ScreenPoint,
  panel: PanelBounds,
  workArea: PanelBounds,
  gap = 8,
  margin = 12
): PanelBounds {
  const left = workArea.x + margin;
  const right = workArea.x + workArea.width - margin;
  const top = workArea.y + margin;
  const bottom = workArea.y + workArea.height - margin;
  const width = Math.min(panel.width, Math.max(1, right - left));
  const height = Math.min(panel.height, Math.max(1, bottom - top));
  const centeredX = anchor.x - width / 2;
  const x = Math.round(Math.min(Math.max(centeredX, left), Math.max(left, right - width)));
  const belowY = Math.max(anchor.y + gap, top);
  const aboveY = anchor.y - height - gap;
  const preferredY = belowY + height <= bottom ? belowY : aboveY;
  const y = Math.min(Math.max(preferredY, top), Math.max(top, bottom - height));
  return {
    x,
    y: Math.round(y),
    width,
    height
  };
}

export class PanelController<TWindow extends PanelWindow> {
  readonly #createPanel: () => TWindow;
  readonly #getDefaultAnchor: () => ScreenPoint;
  readonly #getDisplayWorkArea: (anchor: ScreenPoint) => PanelBounds;
  readonly #isQuitting: () => boolean;
  readonly #activate: () => void;
  readonly #gap: number;
  readonly #margin: number;
  readonly #focusDelayMs: number;
  #panel?: TWindow;
  #focusTimer?: ReturnType<typeof setTimeout>;

  constructor({
    createPanel,
    getDefaultAnchor,
    getDisplayWorkArea,
    isQuitting,
    activate = () => undefined,
    gap = 8,
    margin = 12,
    focusDelayMs = 50
  }: PanelControllerOptions<TWindow>) {
    this.#createPanel = createPanel;
    this.#getDefaultAnchor = getDefaultAnchor;
    this.#getDisplayWorkArea = getDisplayWorkArea;
    this.#isQuitting = isQuitting;
    this.#activate = activate;
    this.#gap = gap;
    this.#margin = margin;
    this.#focusDelayMs = focusDelayMs;
  }

  create(): TWindow {
    const existing = this.get();
    if (existing) return existing;
    const panel = this.#createPanel();
    this.#panel = panel;
    panel.on("close", (event) => {
      if (this.#isQuitting()) return;
      event.preventDefault();
      this.hide();
    });
    panel.on("blur", () => {
      if (!this.#isQuitting() && panel.isVisible()) this.hide();
    });
    panel.on("closed", () => {
      if (this.#panel === panel) this.#panel = undefined;
    });
    return panel;
  }

  get(): TWindow | undefined {
    if (this.#panel?.isDestroyed()) this.#panel = undefined;
    return this.#panel;
  }

  has(): boolean {
    return Boolean(this.get());
  }

  show(trigger?: ScreenPoint): TWindow {
    const panel = this.create();
    const anchor = trigger ?? this.#getDefaultAnchor();
    panel.setBounds(
      calculatePopoverBounds(
        anchor,
        panel.getBounds(),
        this.#getDisplayWorkArea(anchor),
        this.#gap,
        this.#margin
      ),
      false
    );
    if (panel.isMinimized()) panel.restore();
    if (!panel.isVisible()) panel.show();
    this.#scheduleFocus(panel);
    return panel;
  }

  hide(): void {
    this.#clearFocusTimer();
    const panel = this.get();
    if (panel?.isVisible()) panel.hide();
  }

  destroy(): void {
    this.#clearFocusTimer();
    const panel = this.get();
    if (!panel) return;
    panel.destroy();
    if (this.#panel === panel) this.#panel = undefined;
  }

  #scheduleFocus(panel: TWindow): void {
    this.#clearFocusTimer();
    this.#focusTimer = setTimeout(() => {
      this.#focusTimer = undefined;
      if (this.#isQuitting() || panel.isDestroyed() || !panel.isVisible()) return;
      this.#activate();
      panel.focus();
    }, this.#focusDelayMs);
  }

  #clearFocusTimer(): void {
    if (this.#focusTimer) clearTimeout(this.#focusTimer);
    this.#focusTimer = undefined;
  }
}
