import { runMacCommand } from "./MacCommandRunner.js";
import type { MacCommandRunner } from "./MacCommandRunner.js";

export type MemoryPressureLevel = "normal" | "warning" | "critical";

export interface MemoryPressureSample {
  readonly level: MemoryPressureLevel;
  readonly freePercentage: number;
}

export interface MemoryPressureAdapter {
  sample(): Promise<MemoryPressureSample>;
  cancel(): void;
  destroy(): Promise<void>;
}

export interface MacMemoryPressureAdapterOptions {
  readonly warningFreePercentage?: number;
  readonly criticalFreePercentage?: number;
  readonly commandRunner?: MacCommandRunner;
}

export class MacMemoryPressureAdapter implements MemoryPressureAdapter {
  readonly #warningFreePercentage: number;
  readonly #criticalFreePercentage: number;
  readonly #commandRunner: MacCommandRunner;
  #destroyed = false;
  readonly #executions = new Set<ReturnType<MacCommandRunner>>();

  constructor(options: MacMemoryPressureAdapterOptions = {}) {
    this.#warningFreePercentage = options.warningFreePercentage ?? 15;
    this.#criticalFreePercentage = options.criticalFreePercentage ?? 5;
    this.#commandRunner = options.commandRunner ?? runMacCommand;
    if (this.#criticalFreePercentage < 0
      || this.#warningFreePercentage > 100
      || this.#criticalFreePercentage > this.#warningFreePercentage) {
      throw new RangeError("Invalid macOS memory pressure thresholds");
    }
  }

  async sample(): Promise<MemoryPressureSample> {
    if (this.#destroyed) throw new Error("MacMemoryPressureAdapter has been destroyed");
    const execution = this.#commandRunner("/usr/bin/memory_pressure", ["-Q"]);
    this.#executions.add(execution);
    let output: string;
    try {
      output = await execution.result;
    } finally {
      this.#executions.delete(execution);
    }
    const match = output.match(/System-wide memory free percentage:\s*(\d+(?:\.\d+)?)%/i);
    if (!match) throw new Error("Unable to parse macOS memory pressure output");
    const freePercentage = Number(match[1]);
    const level: MemoryPressureLevel = freePercentage <= this.#criticalFreePercentage
      ? "critical"
      : freePercentage <= this.#warningFreePercentage
        ? "warning"
        : "normal";
    return Object.freeze({ level, freePercentage });
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
