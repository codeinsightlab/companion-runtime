import type { ExternalEvent } from "./ExternalEvent.js";
import type {
  ExternalEventHandler,
  Listener,
  ListenerLifecycleState
} from "./Listener.js";

export abstract class BaseListener implements Listener {
  abstract readonly id: string;
  readonly #handlers = new Set<ExternalEventHandler>();
  #state: ListenerLifecycleState = "CREATED";
  #generation = 0;
  #startPromise?: Promise<void>;
  #samplePromise?: Promise<void>;

  get state(): ListenerLifecycleState {
    return this.#state;
  }

  get running(): boolean {
    return this.#state === "STARTED";
  }

  async start(): Promise<void> {
    if (this.#state === "DESTROYED") throw new Error(`${this.id} has been destroyed`);
    if (this.#state === "STARTED") return this.#startPromise;

    this.#state = "STARTED";
    const generation = ++this.#generation;
    const operation = this.onStart(generation).catch(async (error: unknown) => {
      if (this.isActive(generation)) {
        this.#state = "STOPPED";
        this.#generation += 1;
        await this.onStop();
      }
      throw error;
    }).finally(() => {
      if (this.#startPromise === operation) this.#startPromise = undefined;
    });
    this.#startPromise = operation;
    return operation;
  }

  async stop(): Promise<void> {
    if (this.#state === "DESTROYED" || this.#state === "STOPPED") return;
    this.#state = "STOPPED";
    this.#generation += 1;
    const results = await Promise.allSettled([
      this.onStop(),
      ...(this.#samplePromise ? [this.#samplePromise] : []),
      ...(this.#startPromise ? [this.#startPromise] : [])
    ]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(failures.map((failure) => failure.reason), `${this.id} failed to stop cleanly`);
    }
  }

  async destroy(): Promise<void> {
    if (this.#state === "DESTROYED") return;
    const failures: unknown[] = [];
    try {
      await this.stop();
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.onDestroy();
    } catch (error) {
      failures.push(error);
    } finally {
      this.#generation += 1;
      this.#state = "DESTROYED";
      this.#handlers.clear();
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `${this.id} failed to destroy cleanly`);
    }
  }

  onEvent(handler: ExternalEventHandler): void {
    if (this.#state === "DESTROYED") throw new Error(`${this.id} has been destroyed`);
    this.#handlers.add(handler);
  }

  protected isActive(generation: number): boolean {
    return this.#state === "STARTED" && this.#generation === generation;
  }

  protected get currentGeneration(): number {
    return this.#generation;
  }

  protected emitIfActive(event: ExternalEvent, generation: number): boolean {
    if (!this.isActive(generation)) return false;
    for (const handler of this.#handlers) handler(event);
    return true;
  }

  protected async sampleExclusive(
    generation: number,
    sample: () => Promise<void>
  ): Promise<boolean> {
    if (!this.isActive(generation) || this.#samplePromise) return false;
    const operation = sample();
    this.#samplePromise = operation;
    try {
      await operation;
      return true;
    } catch (error) {
      if (this.isActive(generation)) throw error;
      return false;
    } finally {
      if (this.#samplePromise === operation) this.#samplePromise = undefined;
    }
  }

  protected abstract onStart(generation: number): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract onDestroy(): Promise<void>;
}
