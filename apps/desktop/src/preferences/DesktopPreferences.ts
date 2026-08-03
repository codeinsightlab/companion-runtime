export const PET_SIZES = ["small", "medium", "large"] as const;
export type PetSize = typeof PET_SIZES[number];
export const MOUSE_INTERACTION_MODES = ["interactive", "click-through"] as const;
export type MouseInteractionMode = typeof MOUSE_INTERACTION_MODES[number];

export interface PetWindowPosition {
  readonly x: number;
  readonly y: number;
  readonly displayId?: string;
}

export interface DesktopPreferences {
  readonly version: 1;
  readonly petSize: PetSize;
  readonly mouseInteractionMode: MouseInteractionMode;
  readonly petPosition?: PetWindowPosition;
}

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = Object.freeze({
  version: 1,
  petSize: "medium",
  mouseInteractionMode: "interactive"
});

export const PET_SIZE_LAYOUT = Object.freeze({
  small: Object.freeze({ viewer: 96, windowWidth: 148, windowHeight: 164 }),
  medium: Object.freeze({ viewer: 128, windowWidth: 164, windowHeight: 196 }),
  large: Object.freeze({ viewer: 160, windowWidth: 184, windowHeight: 228 })
} satisfies Record<PetSize, { viewer: number; windowWidth: number; windowHeight: number }>);

export function isPetSize(value: unknown): value is PetSize {
  return typeof value === "string" && PET_SIZES.includes(value as PetSize);
}

export function isMouseInteractionMode(value: unknown): value is MouseInteractionMode {
  return typeof value === "string"
    && MOUSE_INTERACTION_MODES.includes(value as MouseInteractionMode);
}

export function validatePetWindowPosition(value: unknown): PetWindowPosition {
  if (!value || typeof value !== "object") throw new TypeError("Invalid Desktop Preferences petPosition");
  const candidate = value as Partial<PetWindowPosition>;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
    throw new TypeError("Invalid Desktop Preferences petPosition coordinates");
  }
  if (candidate.displayId !== undefined && typeof candidate.displayId !== "string") {
    throw new TypeError("Invalid Desktop Preferences petPosition displayId");
  }
  return Object.freeze({
    x: Math.round(candidate.x as number),
    y: Math.round(candidate.y as number),
    ...(candidate.displayId === undefined ? {} : { displayId: candidate.displayId })
  });
}

export function validateDesktopPreferences(value: unknown): DesktopPreferences {
  if (!value || typeof value !== "object") throw new TypeError("Desktop Preferences must be an object");
  const candidate = value as Partial<DesktopPreferences>;
  if (candidate.version !== 1) throw new TypeError("Unsupported Desktop Preferences version");
  if (!isPetSize(candidate.petSize)) throw new TypeError("Invalid Desktop Preferences petSize");
  const mouseInteractionMode = candidate.mouseInteractionMode ?? "interactive";
  if (!isMouseInteractionMode(mouseInteractionMode)) {
    throw new TypeError("Invalid Desktop Preferences mouseInteractionMode");
  }
  return Object.freeze({
    version: 1,
    petSize: candidate.petSize,
    mouseInteractionMode,
    ...(candidate.petPosition === undefined
      ? {}
      : { petPosition: validatePetWindowPosition(candidate.petPosition) })
  });
}
