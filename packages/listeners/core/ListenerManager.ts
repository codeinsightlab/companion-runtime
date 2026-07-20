import type { Listener } from "./Listener.js";

export class ListenerManager {
  readonly #listeners = new Map<string, Listener>();
  #started = false;

  register(listener: Listener): void {
    if (this.#started) throw new Error("Cannot register a Listener while ListenerManager is running");
    if (!listener.id.trim()) throw new TypeError("Listener id must be non-empty");
    if (this.#listeners.has(listener.id)) {
      throw new Error(`Listener "${listener.id}" is already registered`);
    }
    this.#listeners.set(listener.id, listener);
  }

  async startAll(): Promise<void> {
    if (this.#started) return;
    const results = await Promise.allSettled(
      [...this.#listeners.values()].map((listener) => listener.start())
    );
    this.#started = [...this.#listeners.values()].some((listener) => listener.running);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(failures.map((failure) => failure.reason), "Unable to start all Listeners");
    }
  }

  async stopAll(): Promise<void> {
    if (!this.#started) return;
    const results = await Promise.allSettled(
      [...this.#listeners.values()].reverse().map((listener) => listener.stop())
    );
    this.#started = false;
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(failures.map((failure) => failure.reason), "Unable to stop all Listeners");
    }
  }

  async destroyAll(): Promise<void> {
    const stopResults = await Promise.allSettled(
      [...this.#listeners.values()].reverse().map((listener) => listener.stop())
    );
    this.#started = false;
    const destroyResults = await Promise.allSettled(
      [...this.#listeners.values()].reverse().map((listener) => listener.destroy())
    );
    this.#listeners.clear();
    const failures = [...stopResults, ...destroyResults]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(failures.map((failure) => failure.reason), "Unable to destroy all Listeners");
    }
  }

  get listeners(): readonly Listener[] {
    return Object.freeze([...this.#listeners.values()]);
  }

  get started(): boolean {
    return this.#started;
  }
}
