export interface ExternalEvent {
  readonly id: string;
  readonly source: string;
  readonly name: string;
  readonly timestamp: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type ExternalEventInput = Omit<ExternalEvent, "id" | "timestamp" | "payload"> & {
  readonly id?: string;
  readonly timestamp?: number;
  readonly payload?: Record<string, unknown>;
};

export function createExternalEvent(input: ExternalEventInput): ExternalEvent {
  const source = input.source.trim();
  const name = input.name.trim();
  if (!source) throw new TypeError("ExternalEvent source must be non-empty");
  if (!name) throw new TypeError("ExternalEvent name must be non-empty");

  return Object.freeze({
    id: input.id?.trim() || globalThis.crypto.randomUUID(),
    source,
    name,
    timestamp: input.timestamp ?? Date.now(),
    payload: Object.freeze({ ...(input.payload ?? {}) })
  });
}
