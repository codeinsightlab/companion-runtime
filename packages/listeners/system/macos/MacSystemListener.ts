import { cpus } from "node:os";
import { createExternalEvent } from "../../core/ExternalEvent.js";
import { BaseListener } from "../../core/BaseListener.js";
import { MacMemoryPressureAdapter } from "./MacMemoryPressureAdapter.js";
import type {
  MemoryPressureAdapter,
  MemoryPressureLevel
} from "./MacMemoryPressureAdapter.js";

export interface SystemMetrics {
  readonly cpuUsage: number;
}

export interface SystemMetricsProvider {
  sample(): SystemMetrics;
}

interface CpuTotals {
  idle: number;
  total: number;
}

export class MacSystemMetricsProvider implements SystemMetricsProvider {
  #previousCpu?: CpuTotals;

  sample(): SystemMetrics {
    const current = this.#readCpuTotals();
    const previous = this.#previousCpu;
    this.#previousCpu = current;
    const totalDelta = previous ? current.total - previous.total : 0;
    const idleDelta = previous ? current.idle - previous.idle : 0;
    const cpuUsage = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;
    return { cpuUsage };
  }

  #readCpuTotals(): CpuTotals {
    return cpus().reduce<CpuTotals>((totals, cpu) => {
      const times = Object.values(cpu.times);
      return {
        idle: totals.idle + cpu.times.idle,
        total: totals.total + times.reduce((sum, value) => sum + value, 0)
      };
    }, { idle: 0, total: 0 });
  }
}

export interface MacSystemListenerOptions {
  readonly intervalMs?: number;
  readonly cpuThreshold?: number;
  readonly cpuSustainMs?: number;
  readonly metricsProvider?: SystemMetricsProvider;
  readonly memoryPressureAdapter?: MemoryPressureAdapter;
  readonly now?: () => number;
}

export class MacSystemListener extends BaseListener {
  readonly id = "macos-system";
  readonly #intervalMs: number;
  readonly #cpuThreshold: number;
  readonly #cpuSustainMs: number;
  readonly #metricsProvider: SystemMetricsProvider;
  readonly #memoryPressureAdapter: MemoryPressureAdapter;
  readonly #now: () => number;
  #timer?: ReturnType<typeof setInterval>;
  #cpuHighSince?: number;
  #cpuEventEmitted = false;
  #memoryLevel: MemoryPressureLevel = "normal";

  constructor(options: MacSystemListenerOptions = {}) {
    super();
    this.#intervalMs = options.intervalMs ?? 5_000;
    this.#cpuThreshold = options.cpuThreshold ?? 90;
    this.#cpuSustainMs = options.cpuSustainMs ?? 10_000;
    this.#metricsProvider = options.metricsProvider ?? new MacSystemMetricsProvider();
    this.#memoryPressureAdapter = options.memoryPressureAdapter ?? new MacMemoryPressureAdapter();
    this.#now = options.now ?? Date.now;
    if (this.#intervalMs <= 0) throw new RangeError("MacSystemListener intervalMs must be positive");
    if (this.#cpuSustainMs < 0) throw new RangeError("MacSystemListener cpuSustainMs cannot be negative");
    this.#validateThreshold(this.#cpuThreshold, "cpuThreshold");
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
    this.#memoryPressureAdapter.cancel();
    this.#cpuHighSince = undefined;
    this.#cpuEventEmitted = false;
    this.#memoryLevel = "normal";
  }

  protected async onDestroy(): Promise<void> {
    await this.#memoryPressureAdapter.destroy();
  }

  sampleNow(): Promise<boolean> {
    const generation = this.currentGeneration;
    return this.sampleExclusive(generation, () => this.#collect(generation));
  }

  async #collect(generation: number): Promise<void> {
    if (!this.isActive(generation)) return;
    const metrics = this.#metricsProvider.sample();
    this.#processCpu(metrics.cpuUsage);
    const pressure = await this.#memoryPressureAdapter.sample();
    if (!this.isActive(generation)) return;
    if (pressure.level !== "normal" && pressure.level !== this.#memoryLevel) {
      this.#emit("memory_pressure", {
        platform: "macos",
        level: pressure.level,
        freePercentage: pressure.freePercentage
      }, generation);
    }
    this.#memoryLevel = pressure.level;
  }

  #processCpu(usage: number): void {
    if (usage < this.#cpuThreshold) {
      this.#cpuHighSince = undefined;
      this.#cpuEventEmitted = false;
      return;
    }

    const now = this.#now();
    this.#cpuHighSince ??= now;
    const durationMs = now - this.#cpuHighSince;
    if (!this.#cpuEventEmitted && durationMs >= this.#cpuSustainMs) {
      this.#emit("cpu_high", {
        platform: "macos",
        usage,
        threshold: this.#cpuThreshold,
        durationMs
      }, this.currentGeneration);
      this.#cpuEventEmitted = true;
    }
  }

  #emit(name: string, payload: Record<string, unknown>, generation: number): void {
    const event = createExternalEvent({ source: "system", name, payload });
    this.emitIfActive(event, generation);
  }

  #validateThreshold(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`MacSystemListener ${name} must be between 0 and 100`);
    }
  }

  #reportError(error: unknown): void {
    console.error("MacSystemListener sampling failed", error);
  }
}
