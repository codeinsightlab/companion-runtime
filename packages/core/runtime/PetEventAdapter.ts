import type {
  EventAdapterHandledDetail,
  EventMapping,
  PetEventAdapterCreateOptions,
  PetEventAdapterOptions,
  PetManagerLike,
  RuntimeEventMessage
} from "../types/RuntimeTypes.js";

export class PetEventAdapter extends EventTarget {
  readonly petManager: PetManagerLike;
  readonly mapping: Readonly<EventMapping>;

  static async create({
    petManager,
    mappingUrl
  }: PetEventAdapterCreateOptions = {}): Promise<PetEventAdapter> {
    if (!petManager) throw new TypeError("PetEventAdapter.create requires petManager");
    if (!mappingUrl) throw new TypeError("PetEventAdapter.create requires mappingUrl");

    const response = await fetch(mappingUrl);
    if (!response.ok) {
      throw new Error(`Unable to load event mapping ${mappingUrl}: HTTP ${response.status}`);
    }

    const mapping = await response.json() as EventMapping;
    return new PetEventAdapter({ petManager, mapping });
  }

  constructor({ petManager, mapping }: PetEventAdapterOptions) {
    super();
    if (!petManager) throw new TypeError("PetEventAdapter requires petManager");
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      throw new TypeError("PetEventAdapter requires an event mapping object");
    }

    this.petManager = petManager;
    this.mapping = Object.freeze(
      Object.fromEntries(
        Object.entries(mapping).map(([eventName, target]) => [eventName, Object.freeze({ ...target })])
      )
    );
  }

  async handle(message: RuntimeEventMessage): Promise<EventAdapterHandledDetail> {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new TypeError("Pet event must be an object");
    }

    const event = String(message.event ?? "").trim();
    if (!event) throw new TypeError("Pet event requires a non-empty event name");

    const target = this.mapping[event];
    if (!target) {
      throw new RangeError(`Unknown pet event "${event}"`);
    }
    if (!target.character && !target.state) {
      throw new TypeError(`Pet event mapping "${event}" must define character or state`);
    }

    if (target.character && target.character !== this.petManager.character.id) {
      await this.petManager.changeCharacter(target.character);
    }
    if (target.state) {
      await this.petManager.changeState(target.state);
    }

    const detail: EventAdapterHandledDetail = {
      event,
      payload: message.payload ?? {},
      mapping: target,
      character: this.petManager.character.id,
      state: this.petManager.stateMachine.state
    };
    this.dispatchEvent(new CustomEvent("handled", { detail }));
    return detail;
  }

  supports(eventName: string): boolean {
    return Object.hasOwn(this.mapping, eventName);
  }

  listEvents(): string[] {
    return Object.keys(this.mapping);
  }
}
