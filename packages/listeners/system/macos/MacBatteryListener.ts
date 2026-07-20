import { createExternalEvent } from "../../core/ExternalEvent.js";
import { BaseListener } from "../../core/BaseListener.js";
import { runMacCommand } from "./MacCommandRunner.js";
import type { MacCommandRunner } from "./MacCommandRunner.js";

export interface BatteryStatus {
  readonly level: number;
  readonly charging: boolean;
}

export interface BatteryStatusProvider {
  sample(): Promise<BatteryStatus | null>;
  cancel(): void;
  destroy(): Promise<void>;
}

export class MacBatteryStatusProvider implements BatteryStatusProvider {
  readonly #commandRunner: MacCommandRunner;
  #destroyed = false;
  readonly #executions = new Set<ReturnType<MacCommandRunner>>();

  constructor(commandRunner: MacCommandRunner = runMacCommand) {
    this.#commandRunner = commandRunner;
  }

  async sample(): Promise<BatteryStatus | null> {
    if (this.#destroyed) throw new Error("MacBatteryStatusProvider has been destroyed");
    const execution = this.#commandRunner("/usr/bin/pmset", ["-g", "batt"]);
    this.#executions.add(execution);
    let output: string;
    try {
      output = await execution.result;
    } finally {
      this.#executions.delete(execution);
    }
    const levelMatch = output.match(/(\d+)%/);
    if (!levelMatch) return null;
    const normalized = output.toLowerCase();
    const charging = !normalized.includes("not charging")
      && (normalized.includes("; charging") || normalized.includes("; charged"));
    return Object.freeze({ level: Number(levelMatch[1]), charging });
  }

  cancel(): void {
    for (const execution of this.#executions) execution.cancel();
    this.#executions.clear();
  }

  async destroy(): Promise<void> {
    this.cancel();
    this.#destroyed = true;
  }
}

export interface MacBatteryListenerOptions {
  readonly intervalMs?: number;
  readonly lowThreshold?: number;
  readonly statusProvider?: BatteryStatusProvider;
}

export class MacBatteryListener extends BaseListener {
  readonly id = "macos-battery";
  readonly #intervalMs: number;
  readonly #lowThreshold: number;
  readonly #statusProvider: BatteryStatusProvider;
  #timer?: ReturnType<typeof setInterval>;
  #low = false;

  constructor(options: MacBatteryListenerOptions = {}) {
    super();
    this.#intervalMs = options.intervalMs ?? 30_000;
    this.#lowThreshold = options.lowThreshold ?? 20;
    this.#statusProvider = options.statusProvider ?? new MacBatteryStatusProvider();
    if (this.#intervalMs <= 0) throw new RangeError("MacBatteryListener intervalMs must be positive");
    if (this.#lowThreshold < 0 || this.#lowThreshold > 100) {
      throw new RangeError("MacBatteryListener lowThreshold must be between 0 and 100");
    }
  }

  protected async onStart(generation: number): Promise<void> {
    await this.sampleExclusive(generation, () => this.#collect(generation));
    if (!this.isActive(generation)) return;
    this.#timer = setInterval(() => {
      void this.sampleExclusive(generation, () => this.#collect(generation))
        .catch((error: unknown) => this.#reportError(error));
    }, this.#intervalMs);
  }

  protected async onStop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#statusProvider.cancel();
    this.#low = false;
  }

  protected async onDestroy(): Promise<void> {
    await this.#statusProvider.destroy();
  }

  sampleNow(): Promise<boolean> {
    const generation = this.currentGeneration;
    return this.sampleExclusive(generation, () => this.#collect(generation));
  }

  async #collect(generation: number): Promise<void> {
    if (!this.isActive(generation)) return;
    const status = await this.#statusProvider.sample();
    if (!this.isActive(generation)) return;
    if (!status) {
      this.#low = false;
      return;
    }
    const low = status.level < this.#lowThreshold && !status.charging;
    if (low && !this.#low) {
      const event = createExternalEvent({
        source: "system",
        name: "battery_low",
        payload: {
          platform: "macos",
          level: status.level,
          charging: status.charging,
          threshold: this.#lowThreshold
        }
      });
      this.emitIfActive(event, generation);
    }
    this.#low = low;
  }

  #reportError(error: unknown): void {
    console.error("MacBatteryListener sampling failed", error);
  }
}
