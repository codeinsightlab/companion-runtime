import { BehaviorRule } from "./BehaviorRule.js";
import { BehaviorScheduler } from "./BehaviorScheduler.js";
import type { CompanionEvent } from "../events/CompanionEvent.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";
import type {
  Behavior,
  BehaviorIgnoreReason,
  BehaviorResolverLike,
  BehaviorResult,
  BehaviorRulesConfig,
  BehaviorSchedulerLike,
  IdleBehaviorTarget,
  PersonalityEngineLike,
  PersonalitySelection,
  PetBehaviorEngineCreateOptions,
  PetBehaviorEngineOptions,
  PetManagerLike
} from "../types/RuntimeTypes.js";

export class PetBehaviorEngine extends EventTarget {
  readonly petManager: PetManagerLike;
  readonly rules: BehaviorRulesConfig;
  readonly behaviorResolver: BehaviorResolverLike;
  readonly scheduler: BehaviorSchedulerLike;
  readonly personalityEngine?: PersonalityEngineLike;
  running: boolean;
  currentBehavior: Behavior;

  static async create({
    petManager,
    rulesUrl,
    behaviorResolver,
    scheduler,
    personalityEngine
  }: PetBehaviorEngineCreateOptions = {}): Promise<PetBehaviorEngine> {
    if (!petManager) throw new TypeError("PetBehaviorEngine.create requires petManager");
    if (!rulesUrl) throw new TypeError("PetBehaviorEngine.create requires rulesUrl");
    if (!behaviorResolver) throw new TypeError("PetBehaviorEngine.create requires behaviorResolver");

    const response = await fetch(rulesUrl);
    if (!response.ok) {
      throw new Error(`Unable to load behavior rules ${rulesUrl}: HTTP ${response.status}`);
    }

    const rules = await response.json() as BehaviorRulesConfig;
    return new PetBehaviorEngine({
      petManager,
      rules,
      behaviorResolver,
      scheduler,
      personalityEngine
    });
  }

  constructor({
    petManager,
    rules,
    behaviorResolver,
    scheduler = new BehaviorScheduler(),
    personalityEngine
  }: PetBehaviorEngineOptions = {}) {
    super();
    if (!petManager) throw new TypeError("PetBehaviorEngine requires petManager");
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      throw new TypeError("PetBehaviorEngine requires a behavior-rules object");
    }
    if (!behaviorResolver) throw new TypeError("PetBehaviorEngine requires behaviorResolver");

    this.petManager = petManager;
    this.rules = rules;
    this.behaviorResolver = behaviorResolver;
    this.scheduler = scheduler;
    this.personalityEngine = personalityEngine;
    this.running = false;
    this.currentBehavior = {
      event: "IDLE",
      slot: petManager.stateMachine.state,
      priority: this.#priorityFor("IDLE"),
      startedAt: Date.now()
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.#scheduleIdle();
  }

  stop(): void {
    this.running = false;
    this.scheduler.stop();
  }

  async handleEvent(event: CompanionEvent): Promise<BehaviorResult> {
    if (!event || typeof event !== "object") {
      throw new TypeError("Behavior event must be a CompanionEvent");
    }
    const eventKey = event.type === "CUSTOM_EVENT" && event.name
      ? `CUSTOM_EVENT:${event.name}`
      : event.type;
    const ruleDefinition = this.rules.events[eventKey];
    if (!ruleDefinition) throw new RangeError(`Unknown behavior event "${eventKey}"`);

    const slot = this.behaviorResolver.resolve(event);
    const rule = BehaviorRule.fromEvent(eventKey, ruleDefinition, slot, this.rules.priorities);
    const behavior = rule.toBehavior({ ...event.payload });
    const cooldownMs = behavior.cooldownKey
      ? this.rules.cooldown?.[behavior.cooldownKey] ?? 0
      : 0;

    if (this.scheduler.isCoolingDown(behavior.cooldownKey)) {
      return this.#ignore(behavior, "cooldown");
    }
    if (!this.#canInterrupt(behavior)) {
      return this.#ignore(behavior, "priority");
    }

    this.scheduler.clearRecovery();
    await this.#applyBehavior(behavior);
    this.scheduler.markCooldown(behavior.cooldownKey, cooldownMs);
    this.currentBehavior = behavior;

    const recover = behavior.recover;
    if (behavior.duration && recover) {
      this.scheduler.scheduleRecovery(behavior.duration, () => {
        this.#recover(recover, behavior).catch((error: unknown) => this.#emitError(error));
      });
    }

    this.#scheduleIdle();
    this.dispatchEvent(new CustomEvent("accepted", { detail: { behavior } }));
    return { accepted: true, behavior };
  }

  getCurrentBehavior(): Behavior {
    return { ...this.currentBehavior };
  }

  listEvents(): string[] {
    return Object.keys(this.rules.events);
  }

  supports(eventType: string, name?: string): boolean {
    const key = eventType === "CUSTOM_EVENT" && name
      ? `CUSTOM_EVENT:${name}`
      : eventType;
    return Object.hasOwn(this.rules.events, key);
  }

  #canInterrupt(behavior: Behavior): boolean {
    return behavior.priority >= this.currentBehavior.priority;
  }

  async #applyBehavior(behavior: Behavior): Promise<void> {
    const fallbackAction = this.petManager.resolveAction(behavior.slot).id;
    const selection = this.#selectPersonalityAction(
      this.petManager.character.id,
      behavior.slot,
      fallbackAction
    );
    behavior.selectedAction = selection.selectedAction;
    behavior.mood = selection.mood;
    behavior.style = selection.style;
    behavior.usedPersonalityPreference = selection.usedPreference;
    await this.petManager.changeBehavior(behavior.slot);
    if (selection.usedPreference && selection.selectedAction) {
      await this.petManager.changeAction(selection.selectedAction);
    }
  }

  async #recover(slot: BehaviorSlot, sourceBehavior: Behavior): Promise<void> {
    const fallbackAction = this.petManager.resolveAction(slot).id;
    const selection = this.#selectPersonalityAction(
      this.petManager.character.id,
      slot,
      fallbackAction
    );
    await this.petManager.changeBehavior(slot);
    if (selection.usedPreference && selection.selectedAction) {
      await this.petManager.changeAction(selection.selectedAction);
    }
    this.currentBehavior = {
      event: `${sourceBehavior.event}:recover`,
      slot,
      priority: this.#priorityFor(slot),
      startedAt: Date.now(),
      recoveredFrom: sourceBehavior.event,
      selectedAction: selection.selectedAction,
      mood: selection.mood,
      style: selection.style,
      usedPersonalityPreference: selection.usedPreference
    };
    this.dispatchEvent(new CustomEvent("recovered", { detail: { behavior: this.getCurrentBehavior() } }));
    this.#scheduleIdle();
  }

  async #runIdleBehavior(): Promise<void> {
    if (!this.running) return;
    const target = this.#pickIdleTarget();
    if (!target) return;

    this.scheduler.clearRecovery();
    const behavior: Behavior = {
      event: "IDLE:auto",
      slot: target.slot,
      priority: this.#priorityFor("IDLE"),
      startedAt: Date.now()
    };
    await this.#applyBehavior(behavior);
    this.currentBehavior = behavior;
    this.dispatchEvent(new CustomEvent("idle", { detail: { behavior } }));
    this.#scheduleIdle();
  }

  #pickIdleTarget(): IdleBehaviorTarget | undefined {
    const idleConfig = this.rules.idle;
    const actions = idleConfig?.idleActions;
    if (!idleConfig?.enabled || !Array.isArray(actions) || actions.length === 0) return undefined;

    const weighted = actions
      .map((entry) => ({ entry, weight: Math.max(0, Number(entry.weight ?? 1)) }))
      .filter(({ weight }) => weight > 0);
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (!total) return undefined;

    let cursor = Math.random() * total;
    for (const item of weighted) {
      cursor -= item.weight;
      if (cursor <= 0) return item.entry;
    }
    return weighted.at(-1)?.entry;
  }

  #scheduleIdle(): void {
    if (!this.running) return;
    this.scheduler.scheduleIdle(this.rules.idle?.timeout ?? 0, () => {
      this.#runIdleBehavior().catch((error: unknown) => this.#emitError(error));
    });
  }

  #priorityFor(slot: BehaviorSlot): number {
    return Number(this.rules.priorities[slot] ?? 0);
  }

  #selectPersonalityAction(
    characterId: string,
    slot: BehaviorSlot,
    fallbackAction: string
  ): PersonalitySelection {
    if (!this.personalityEngine?.supports(characterId)) {
      return {
        characterId,
        slot,
        selectedAction: fallbackAction,
        fallbackAction,
        mood: "normal",
        usedPreference: false
      };
    }
    return this.personalityEngine.selectAction({ characterId, slot, fallbackAction });
  }

  #ignore(behavior: Behavior, reason: BehaviorIgnoreReason): BehaviorResult {
    const detail = { behavior, reason };
    this.dispatchEvent(new CustomEvent("ignored", { detail }));
    return { accepted: false, reason, behavior };
  }

  #emitError(error: unknown): void {
    this.dispatchEvent(new CustomEvent("error", { detail: { error } }));
  }
}
