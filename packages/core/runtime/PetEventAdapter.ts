import { BehaviorResolver } from "../behavior/BehaviorResolver.js";
import type { CompanionEvent } from "../events/CompanionEvent.js";
import type {
  EventAdapterHandledDetail,
  EventMapping,
  BehaviorResolverLike,
  PetEventAdapterCreateOptions,
  PetEventAdapterOptions,
  PetManagerLike
} from "../types/RuntimeTypes.js";

export class PetEventAdapter extends EventTarget {
  readonly petManager: PetManagerLike;
  readonly behaviorResolver: BehaviorResolverLike;

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
    return new PetEventAdapter({
      petManager,
      behaviorResolver: new BehaviorResolver(mapping)
    });
  }

  constructor({ petManager, behaviorResolver }: PetEventAdapterOptions) {
    super();
    if (!petManager) throw new TypeError("PetEventAdapter requires petManager");
    if (!behaviorResolver) throw new TypeError("PetEventAdapter requires behaviorResolver");
    this.petManager = petManager;
    this.behaviorResolver = behaviorResolver;
  }

  async handle(event: CompanionEvent): Promise<EventAdapterHandledDetail> {
    if (!event || typeof event !== "object") {
      throw new TypeError("Pet event must be a CompanionEvent");
    }
    const slot = this.behaviorResolver.resolve(event);
    await this.petManager.changeBehavior(slot);

    const detail: EventAdapterHandledDetail = {
      event: event.type,
      payload: event.payload,
      slot,
      character: this.petManager.character.id,
      behavior: this.petManager.stateMachine.state
    };
    this.dispatchEvent(new CustomEvent("handled", { detail }));
    return detail;
  }

  supports(eventType: string, name?: string): boolean {
    return this.behaviorResolver.supports(eventType, name);
  }
}
