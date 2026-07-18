import type { CompanionEvent } from "../events/CompanionEvent.js";
import type { EventBus } from "../events/EventBus.js";
import type { PetBehaviorEngine } from "../runtime/PetBehaviorEngine.js";

export class CompanionRuntime {
  readonly #eventBus: EventBus;
  readonly #behaviorEngine: PetBehaviorEngine;
  #unsubscribe?: () => void;

  constructor(eventBus: EventBus, behaviorEngine: PetBehaviorEngine) {
    this.#eventBus = eventBus;
    this.#behaviorEngine = behaviorEngine;
  }

  start(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#eventBus.subscribe(async (event) => {
      await this.#behaviorEngine.handleEvent(event);
    });
    this.#behaviorEngine.start();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#behaviorEngine.stop();
  }

  publish(event: CompanionEvent): Promise<void> {
    return this.#eventBus.publish(event);
  }
}
