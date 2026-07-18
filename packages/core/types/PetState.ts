export const PET_STATES = [
  "IDLE",
  "THINKING",
  "EXECUTING",
  "REVIEWING",
  "SUCCESS",
  "ERROR"
] as const;

export type PetState = (typeof PET_STATES)[number];
