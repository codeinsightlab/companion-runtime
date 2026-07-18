import type { BehaviorSlot } from "../types/BehaviorSlot.js";
import type {
  Behavior,
  BehaviorRuleDefinition
} from "../types/RuntimeTypes.js";

export class BehaviorRule {
  readonly event: string;
  readonly slot: BehaviorSlot;
  readonly duration: number;
  readonly recover?: BehaviorSlot;
  readonly priority: number;
  readonly cooldownKey: string;

  static fromEvent(
    eventName: string,
    definition: BehaviorRuleDefinition,
    slot: BehaviorSlot,
    priorities: Record<string, number> = {}
  ): BehaviorRule {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      throw new TypeError(`Behavior rule "${eventName}" must be an object`);
    }
    return new BehaviorRule({ event: eventName, ...definition }, slot, priorities);
  }

  constructor(
    definition: BehaviorRuleDefinition,
    slot: BehaviorSlot,
    priorities: Record<string, number> = {}
  ) {
    const event = String(definition.event ?? "").trim();
    if (!event) throw new TypeError("BehaviorRule requires an event name");

    this.event = event;
    this.slot = slot;
    this.duration = Math.max(0, Number(definition.duration ?? 0));
    this.recover = definition.recover;
    this.priority = Number(definition.priority ?? priorities[slot] ?? priorities.IDLE ?? 0);
    this.cooldownKey = definition.cooldownKey ?? slot;
    Object.freeze(this);
  }

  toBehavior(payload: Record<string, unknown> = {}): Behavior {
    return {
      event: this.event,
      payload,
      slot: this.slot,
      priority: this.priority,
      duration: this.duration,
      recover: this.recover,
      cooldownKey: this.cooldownKey,
      startedAt: Date.now()
    };
  }
}
