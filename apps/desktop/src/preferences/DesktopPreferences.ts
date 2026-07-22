export const PET_SIZES = ["small", "medium", "large"] as const;
export type PetSize = typeof PET_SIZES[number];

export interface DesktopPreferences {
  readonly version: 1;
  readonly petSize: PetSize;
}

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = Object.freeze({
  version: 1,
  petSize: "medium"
});

export const PET_SIZE_LAYOUT = Object.freeze({
  small: Object.freeze({ viewer: 96, windowWidth: 248, windowHeight: 208 }),
  medium: Object.freeze({ viewer: 128, windowWidth: 280, windowHeight: 240 }),
  large: Object.freeze({ viewer: 160, windowWidth: 328, windowHeight: 288 })
} satisfies Record<PetSize, { viewer: number; windowWidth: number; windowHeight: number }>);

export function isPetSize(value: unknown): value is PetSize {
  return typeof value === "string" && PET_SIZES.includes(value as PetSize);
}

export function validateDesktopPreferences(value: unknown): DesktopPreferences {
  if (!value || typeof value !== "object") throw new TypeError("Desktop Preferences must be an object");
  const candidate = value as Partial<DesktopPreferences>;
  if (candidate.version !== 1) throw new TypeError("Unsupported Desktop Preferences version");
  if (!isPetSize(candidate.petSize)) throw new TypeError("Invalid Desktop Preferences petSize");
  return Object.freeze({ version: 1, petSize: candidate.petSize });
}
