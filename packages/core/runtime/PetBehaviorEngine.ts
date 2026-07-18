import { BehaviorRule } from "./BehaviorRule.js";
import { BehaviorScheduler } from "./BehaviorScheduler.js";
import type { PetState } from "../types/PetState.js";
import type {
  Behavior,
  BehaviorIgnoreReason,
  BehaviorResult,
  BehaviorRulesConfig,
  BehaviorSchedulerLike,
  IdleBehaviorTarget,
  PersonalityEngineLike,
  PersonalitySelection,
  PetBehaviorEngineCreateOptions,
  PetBehaviorEngineOptions,
  PetManagerLike,
  RuntimeEventMessage
} from "../types/RuntimeTypes.js";

export class PetBehaviorEngine extends EventTarget {
  readonly petManager: PetManagerLike;
  readonly rules: BehaviorRulesConfig;
  readonly scheduler: BehaviorSchedulerLike;
  readonly personalityEngine?: PersonalityEngineLike;
  running: boolean;
  currentBehavior: Behavior;

  static async create({
    petManager,
    rulesUrl,
    scheduler,
    personalityEngine
  }: PetBehaviorEngineCreateOptions = {}): Promise<PetBehaviorEngine> {
    if (!petManager) throw new TypeError("PetBehaviorEngine.create requires petManager");
    if (!rulesUrl) throw new TypeError("PetBehaviorEngine.create requires rulesUrl");

    const response = await fetch(rulesUrl);
    if (!response.ok) {
      throw new Error(`Unable to load behavior rules ${rulesUrl}: HTTP ${response.status}`);
    }

    const rules = await response.json() as BehaviorRulesConfig;
    return new PetBehaviorEngine({ petManager, rules, scheduler, personalityEngine });
  }

  constructor({
    petManager,
    rules,
    scheduler = new BehaviorScheduler(),
    personalityEngine
  }: PetBehaviorEngineOptions = {}) {
    super();
    if (!petManager) throw new TypeError("PetBehaviorEngine requires petManager");
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      throw new TypeError("PetBehaviorEngine requires a behavior-rules object");
    }

    this.petManager = petManager;
    this.rules = rules;
    this.scheduler = scheduler;
    this.personalityEngine = personalityEngine;
    this.running = false;
    this.currentBehavior = {
      event: "idle",
      state: petManager.stateMachine?.state ?? "IDLE",
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

  async handleEvent(message: RuntimeEventMessage): Promise<BehaviorResult> {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new TypeError("Behavior event must be an object");
    }

    const event = String(message.event ?? "").trim();
    if (!event) throw new TypeError("Behavior event requires a non-empty event name");

    const ruleDefinition = this.rules.events?.[event];
    if (!ruleDefinition) throw new RangeError(`Unknown behavior event "${event}"`);

    const rule = BehaviorRule.fromEvent(event, ruleDefinition, this.rules.priorities);
    const behavior = rule.toBehavior(message.payload ?? {});
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
    return Object.keys(this.rules.events ?? {});
  }

  supports(eventName: string): boolean {
    return Object.hasOwn(this.rules.events ?? {}, eventName);
  }

  #canInterrupt(behavior: Behavior): boolean {
    return behavior.priority >= (this.currentBehavior?.priority ?? 0);
  }

  async #applyBehavior(behavior: Behavior): Promise<void> {
    if (behavior.character && behavior.character !== this.petManager.character.id) {
      await this.petManager.changeCharacter(behavior.character);
    }
    const character = this.petManager.character;
    if (behavior.state) {
      const fallbackAction = character.actionForState(behavior.state).id;
      const selection = this.#selectPersonalityAction(character.id, behavior.state, fallbackAction);
      behavior.selectedAction = selection.selectedAction;
      behavior.mood = selection.mood;
      behavior.style = selection.style;
      behavior.usedPersonalityPreference = selection.usedPreference;
      await this.petManager.changeState(behavior.state);
      if (selection.usedPreference && selection.selectedAction) {
        await this.petManager.changeAction(selection.selectedAction);
        return;
      }
      return;
    }
    if (behavior.action) {
      behavior.selectedAction = behavior.action;
      await this.petManager.changeAction(behavior.action);
    }
  }

  async #recover(state: PetState, sourceBehavior: Behavior): Promise<void> {
    const character = this.petManager.character;
    const fallbackAction = character.actionForState(state).id;
    const selection = this.#selectPersonalityAction(character.id, state, fallbackAction);
    await this.petManager.changeState(state);
    if (selection.usedPreference && selection.selectedAction) {
      await this.petManager.changeAction(selection.selectedAction);
    }
    this.currentBehavior = {
      event: `${sourceBehavior.event}:recover`,
      state,
      priority: this.#priorityFor(state),
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
      event: "idle:auto",
      state: target.state,
      action: this.#resolveIdleAction(target),
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

  #resolveIdleAction(target: IdleBehaviorTarget): string | undefined {
    if (target.actionByCharacter) {
      return target.actionByCharacter[this.petManager.character.id] ?? target.action;
    }
    return target.action;
  }

  #scheduleIdle(): void {
    if (!this.running) return;
    this.scheduler.scheduleIdle(this.rules.idle?.timeout ?? 0, () => {
      this.#runIdleBehavior().catch((error: unknown) => this.#emitError(error));
    });
  }

  #priorityFor(state: PetState): number {
    return Number(this.rules.priorities?.[state] ?? 0);
  }

  #selectPersonalityAction(
    characterId: string,
    state: PetState,
    fallbackAction: string
  ): PersonalitySelection {
    if (!this.personalityEngine?.supports?.(characterId)) {
      return {
        characterId,
        state,
        selectedAction: fallbackAction,
        fallbackAction,
        mood: "normal",
        usedPreference: false
      };
    }

    return this.personalityEngine.selectAction({ characterId, state, fallbackAction });
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
