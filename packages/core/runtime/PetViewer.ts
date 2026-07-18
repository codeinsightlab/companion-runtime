import type { PetAction } from "../types/PetAction.js";
import type {
  PetPosition,
  PetViewerOptions
} from "../types/RuntimeTypes.js";

const POSITIONS = new Set<PetPosition>([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left"
]);

export class PetViewer extends EventTarget {
  readonly container: HTMLElement;
  readonly element: HTMLDivElement;
  readonly image: HTMLImageElement;
  currentSrc: string;
  transitionToken: number;

  constructor({
    container = document.body,
    position = "bottom-right",
    size = 128
  }: PetViewerOptions = {}) {
    super();
    this.container = container;
    this.currentSrc = "";
    this.transitionToken = 0;

    this.element = document.createElement("div");
    this.element.className = "ninja-pet";
    this.element.hidden = true;
    this.element.setAttribute("aria-live", "polite");

    this.image = document.createElement("img");
    this.image.className = "ninja-pet__image";
    this.image.alt = "";
    this.image.draggable = false;
    this.element.append(this.image);
    this.container.append(this.element);

    this.setPosition(position);
    this.setSize(size);
  }

  show(): void {
    this.element.hidden = false;
    requestAnimationFrame(() => this.element.classList.add("ninja-pet--visible"));
  }

  hide(): void {
    this.element.classList.remove("ninja-pet--visible");
    window.setTimeout(() => {
      if (!this.element.classList.contains("ninja-pet--visible")) this.element.hidden = true;
    }, 180);
  }

  async display(action: PetAction, characterName: string): Promise<void> {
    const token = ++this.transitionToken;
    const nextImage = await this.#preload(action.src);
    if (token !== this.transitionToken) return;

    this.element.classList.add("ninja-pet--switching");
    await this.#delay(130);
    if (token !== this.transitionToken) return;

    this.image.src = nextImage.src;
    this.image.alt = `${characterName} — ${action.id}`;
    this.currentSrc = action.src;
    this.element.dataset.action = action.id;
    this.element.classList.remove("ninja-pet--switching");
    this.dispatchEvent(new CustomEvent("render", { detail: { action, characterName } }));
  }

  setPosition(position: PetPosition): void {
    if (!POSITIONS.has(position)) throw new RangeError(`Unsupported position "${position}"`);
    this.element.dataset.position = position;
  }

  setSize(size: number | string): void {
    const pixels = Number(size);
    if (!Number.isFinite(pixels) || pixels < 48 || pixels > 512) {
      throw new RangeError("Pet size must be between 48 and 512 pixels");
    }
    this.element.style.setProperty("--pet-size", `${pixels}px`);
  }

  destroy(): void {
    this.transitionToken += 1;
    this.element.remove();
  }

  #preload(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load pet asset: ${src}`));
      image.src = src;
    });
  }

  #delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}
