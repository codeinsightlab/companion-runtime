import type { PetState } from "../types/PetState.js";
import type {
  Behavior,
  BehaviorRuleDefinition
} from "../types/RuntimeTypes.js";

export class BehaviorRule {
  readonly event: string;
  readonly character?: string;
  readonly state?: PetState;
  readonly action?: string;
  readonly duration: number;
  readonly recover?: PetState;
  readonly priority: number;
  readonly cooldownKey: string;

  static fromEvent(
    eventName: string,
    definition: BehaviorRuleDefinition,
    priorities: Record<string, number> = {}
  ): BehaviorRule {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      throw new TypeError(`Behavior rule "${eventName}" must be an object`);
    }

    return new BehaviorRule({ event: eventName, ...definition }, priorities);
  }

  constructor(definition: BehaviorRuleDefinition, priorities: Record<string, number> = {}) {
    const event = String(definition.event ?? "").trim();
    if (!event) throw new TypeError("BehaviorRule requires an event name");
    if (!definition.state && !definition.action) {
      throw new TypeError(`Behavior rule "${event}" must define state or action`);
    }

    this.event = event;
    this.character = definition.character;
    this.state = definition.state
      ? String(definition.state).toUpperCase() as PetState
      : undefined;
    this.action = definition.action;
    this.duration = Math.max(0, Number(definition.duration ?? 0));
    this.recover = definition.recover
      ? String(definition.recover).toUpperCase() as PetState
      : undefined;
    this.priority = Number(
      definition.priority
        ?? (this.state ? priorities[this.state] : undefined)
        ?? priorities.IDLE
        ?? 0
    );
    this.cooldownKey = definition.cooldownKey ?? this.state ?? this.action ?? "";
    Object.freeze(this);
  }

  toBehavior(payload: Record<string, unknown> = {}): Behavior {
    return {
      event: this.event,
      payload,
      character: this.character,
      state: this.state,
      action: this.action,
      priority: this.priority,
      duration: this.duration,
      recover: this.recover,
      cooldownKey: this.cooldownKey,
      startedAt: Date.now()
    };
  }
}
