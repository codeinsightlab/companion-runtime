import { BehaviorRule } from "./BehaviorRule.js";
import { BehaviorScheduler } from "./BehaviorScheduler.js";
import type { CompanionEvent } from "../events/CompanionEvent.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";
import type {
  Behavior,
  BehaviorExecutionContext,
  BehaviorExecutionSource,
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

interface PendingBehaviorExecution {
  behavior: Behavior;
  context: BehaviorExecutionContext;
}

interface ActiveBehaviorExecution extends PendingBehaviorExecution {
  readonly id: number;
  applyPromise: Promise<void>;
  handoffRequested: boolean;
}

export class PetBehaviorEngine extends EventTarget {
  readonly petManager: PetManagerLike;
  readonly rules: BehaviorRulesConfig;
  readonly behaviorResolver: BehaviorResolverLike;
  readonly scheduler: BehaviorSchedulerLike;
  readonly personalityEngine?: PersonalityEngineLike;
  running: boolean;
  currentBehavior: Behavior;
  #activeExecution?: ActiveBehaviorExecution;
  readonly #pendingExecutions: PendingBehaviorExecution[] = [];
  #executionSequence = 0;
  #draining = false;

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
    this.#activeExecution = undefined;
    this.#pendingExecutions.length = 0;
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
    const candidate = this.#candidateFor(eventKey, behavior);
    if (candidate.context.source === "USER" && !this.#isTemporary(behavior)) {
      return this.#ignore(candidate, "lifecycle");
    }

    const active = this.#activeExecution;
    if (!active) {
      if (this.scheduler.isCoolingDown(behavior.cooldownKey)) {
        return this.#ignore(candidate, "cooldown");
      }
      return this.#startExecution(candidate, "accepted");
    }

    if (active.context.source === "USER" && candidate.context.source === "USER") {
      return this.#startExecution(candidate, "replaced", active);
    }

    this.#enqueue(candidate);
    if (
      active.context.source === "SYSTEM"
      && candidate.context.source === "SYSTEM"
      && !this.#isTemporary(active.behavior)
    ) {
      this.#requestSystemHandoff(active);
    }
    const result: BehaviorResult = {
      accepted: true,
      status: "queued",
      behavior,
      execution: { ...candidate.context }
    };
    this.dispatchEvent(new CustomEvent("queued", { detail: result }));
    return result;
  }

  getCurrentBehavior(): Behavior {
    return { ...this.currentBehavior };
  }

  get currentExecution(): BehaviorExecutionContext | undefined {
    return this.#activeExecution
      ? { ...this.#activeExecution.context }
      : undefined;
  }

  get pendingQueue(): BehaviorExecutionContext[] {
    return this.#pendingExecutions.map(({ context }) => ({ ...context }));
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

  async #recover(
    slot: BehaviorSlot,
    sourceBehavior: Behavior,
    execution: ActiveBehaviorExecution
  ): Promise<void> {
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
    if (this.#activeExecution !== execution) return;
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
    this.#activeExecution = undefined;
    this.#scheduleIdle();
    this.#drainQueue();
  }

  async #runIdleBehavior(): Promise<void> {
    if (!this.running) return;
    if (this.#activeExecution) {
      this.#scheduleIdle();
      return;
    }
    const target = this.#pickIdleTarget();
    if (!target) return;

    this.scheduler.clearRecovery();
    const slot = target.event
      ? this.behaviorResolver.resolve({
        id: `idle-${Date.now()}`,
        type: target.event,
        source: { app: "companion-runtime" },
        payload: {},
        timestamp: Date.now()
      })
      : target.slot;
    const behavior: Behavior = {
      event: "IDLE:auto",
      slot,
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

  #candidateFor(eventKey: string, behavior: Behavior): PendingBehaviorExecution {
    const source: BehaviorExecutionSource = eventKey.startsWith("CUSTOM_EVENT:USER_COMMAND:")
      ? "USER"
      : "SYSTEM";
    return {
      behavior,
      context: {
        source,
        behaviorSlot: behavior.slot,
        triggerName: eventKey,
        startedAt: 0,
        queuedAt: Date.now()
      }
    };
  }

  async #startExecution(
    candidate: PendingBehaviorExecution,
    status: "accepted" | "replaced",
    replaced?: ActiveBehaviorExecution
  ): Promise<BehaviorResult> {
    this.scheduler.clearRecovery();
    const startedAt = Date.now();
    candidate.behavior.startedAt = startedAt;
    const execution: ActiveBehaviorExecution = {
      id: ++this.#executionSequence,
      behavior: candidate.behavior,
      context: {
        ...candidate.context,
        startedAt
      },
      applyPromise: Promise.resolve(),
      handoffRequested: false
    };
    this.#activeExecution = execution;
    this.currentBehavior = candidate.behavior;
    execution.applyPromise = this.#applyBehavior(candidate.behavior);

    if (status === "replaced") {
      this.dispatchEvent(new CustomEvent("replaced", {
        detail: {
          previous: replaced ? { ...replaced.context } : undefined,
          execution: { ...execution.context }
        }
      }));
    }

    try {
      await execution.applyPromise;
    } catch (error) {
      if (this.#activeExecution === execution) {
        this.#activeExecution = undefined;
        this.#drainQueue();
      }
      throw error;
    }

    if (this.#activeExecution === execution) {
      const cooldownMs = candidate.behavior.cooldownKey
        ? this.rules.cooldown?.[candidate.behavior.cooldownKey] ?? 0
        : 0;
      this.scheduler.markCooldown(candidate.behavior.cooldownKey, cooldownMs);
      const recover = candidate.behavior.recover;
      if (candidate.behavior.duration && recover) {
        this.scheduler.scheduleRecovery(candidate.behavior.duration, () => {
          this.#recover(recover, candidate.behavior, execution)
            .catch((error: unknown) => this.#emitError(error));
        });
      } else if (
        execution.context.source === "SYSTEM"
        && this.#pendingExecutions.some(({ context }) => context.source === "SYSTEM")
      ) {
        this.#requestSystemHandoff(execution);
      }
      this.#scheduleIdle();
    }

    const result: BehaviorResult = {
      accepted: true,
      status,
      behavior: candidate.behavior,
      execution: { ...execution.context }
    };
    this.dispatchEvent(new CustomEvent("accepted", { detail: result }));
    return result;
  }

  #enqueue(candidate: PendingBehaviorExecution): void {
    if (candidate.context.source === "USER") {
      for (let index = this.#pendingExecutions.length - 1; index >= 0; index -= 1) {
        if (this.#pendingExecutions[index]?.context.source === "USER") {
          this.#pendingExecutions.splice(index, 1);
        }
      }
    }
    this.#pendingExecutions.push(candidate);
  }

  #requestSystemHandoff(execution: ActiveBehaviorExecution): void {
    if (execution.handoffRequested) return;
    execution.handoffRequested = true;
    void execution.applyPromise.then(() => {
      if (this.#activeExecution !== execution) return;
      this.#activeExecution = undefined;
      this.#drainQueue();
    }).catch((error: unknown) => this.#emitError(error));
  }

  #drainQueue(): void {
    if (this.#draining || this.#activeExecution) return;
    this.#draining = true;
    try {
      while (!this.#activeExecution && this.#pendingExecutions.length > 0) {
        const systemIndex = this.#pendingExecutions.findIndex(
          ({ context }) => context.source === "SYSTEM"
        );
        const index = systemIndex >= 0 ? systemIndex : 0;
        const [candidate] = this.#pendingExecutions.splice(index, 1);
        if (!candidate) continue;
        if (this.scheduler.isCoolingDown(candidate.behavior.cooldownKey)) {
          this.#ignore(candidate, "cooldown");
          continue;
        }
        void this.#startExecution(candidate, "accepted")
          .catch((error: unknown) => this.#emitError(error));
      }
    } finally {
      this.#draining = false;
    }
  }

  #isTemporary(behavior: Behavior): boolean {
    return Boolean(behavior.duration && behavior.recover);
  }

  #ignore(
    candidate: PendingBehaviorExecution,
    reason: BehaviorIgnoreReason
  ): BehaviorResult {
    const result: BehaviorResult = {
      accepted: false,
      status: "rejected",
      reason,
      behavior: candidate.behavior,
      execution: { ...candidate.context }
    };
    this.dispatchEvent(new CustomEvent("ignored", { detail: result }));
    this.dispatchEvent(new CustomEvent("rejected", { detail: result }));
    return result;
  }

  #emitError(error: unknown): void {
    this.dispatchEvent(new CustomEvent("error", { detail: { error } }));
  }
}
