import type { RawEventInput } from "../../core/events/EventNormalizer.js";
import type { ExternalEvent } from "./ExternalEvent.js";

export interface InternalEventTarget {
  readonly type: string;
  readonly name?: string;
}

export type ExternalEventMapping = Readonly<Record<string, InternalEventTarget>>;

export class ExternalEventMapper {
  readonly #mapping: ExternalEventMapping;

  constructor(mapping: ExternalEventMapping) {
    this.#mapping = Object.freeze({ ...mapping });
  }

  map(event: ExternalEvent): RawEventInput {
    const key = `${event.source}:${event.name}`;
    const target = this.#mapping[key];
    if (!target) throw new RangeError(`No Internal Event mapping for External Event "${key}"`);

    return {
      id: event.id,
      event: target.type,
      ...(target.name ? { name: target.name } : {}),
      source: {
        app: event.source,
        platform: "external-listener",
        collector: event.source
      },
      payload: { ...event.payload, externalEventName: event.name },
      timestamp: event.timestamp
    };
  }
}
