import type { CompanionEvent } from "../events/CompanionEvent.js";
import type { EventBus } from "../events/EventBus.js";
import type { PetBehaviorEngine } from "../runtime/PetBehaviorEngine.js";
import type { BehaviorResult } from "../types/RuntimeTypes.js";

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
    this.#unsubscribe = this.#eventBus.subscribe(
      (event) => this.#behaviorEngine.handleEvent(event)
    );
    this.#behaviorEngine.start();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#behaviorEngine.stop();
  }

  async publish(event: CompanionEvent): Promise<BehaviorResult | undefined> {
    const results = await this.#eventBus.publish(event);
    return results.find(this.#isBehaviorResult);
  }

  #isBehaviorResult(value: unknown): value is BehaviorResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<BehaviorResult>;
    return typeof candidate.accepted === "boolean"
      && typeof candidate.status === "string"
      && Boolean(candidate.behavior)
      && Boolean(candidate.execution);
  }
}
