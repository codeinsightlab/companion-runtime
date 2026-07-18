import { cpus, freemem, totalmem } from "node:os";
import { createExternalEvent } from "../../core/ExternalEvent.js";
import type { ExternalEventHandler } from "../../core/Listener.js";
import type { SystemListener } from "../SystemListener.js";

export interface SystemMetrics {
  readonly cpuUsage: number;
  readonly memoryUsage: number;
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
    const totalMemory = totalmem();
    const memoryUsage = totalMemory > 0 ? ((totalMemory - freemem()) / totalMemory) * 100 : 0;
    return { cpuUsage, memoryUsage };
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
  readonly memoryThreshold?: number;
  readonly metricsProvider?: SystemMetricsProvider;
}

export class MacSystemListener implements SystemListener {
  readonly id = "macos-system";
  readonly #intervalMs: number;
  readonly #cpuThreshold: number;
  readonly #memoryThreshold: number;
  readonly #metricsProvider: SystemMetricsProvider;
  readonly #handlers = new Set<ExternalEventHandler>();
  #timer?: ReturnType<typeof setInterval>;
  #cpuHigh = false;
  #memoryHigh = false;

  constructor(options: MacSystemListenerOptions = {}) {
    this.#intervalMs = options.intervalMs ?? 5_000;
    this.#cpuThreshold = options.cpuThreshold ?? 90;
    this.#memoryThreshold = options.memoryThreshold ?? 90;
    this.#metricsProvider = options.metricsProvider ?? new MacSystemMetricsProvider();
    if (this.#intervalMs <= 0) throw new RangeError("MacSystemListener intervalMs must be positive");
    this.#validateThreshold(this.#cpuThreshold, "cpuThreshold");
    this.#validateThreshold(this.#memoryThreshold, "memoryThreshold");
  }

  async start(): Promise<void> {
    if (this.#timer) return;
    this.sampleNow();
    this.#timer = setInterval(() => this.sampleNow(), this.#intervalMs);
  }

  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#cpuHigh = false;
    this.#memoryHigh = false;
  }

  onEvent(handler: ExternalEventHandler): void {
    this.#handlers.add(handler);
  }

  sampleNow(): void {
    const metrics = this.#metricsProvider.sample();
    const cpuHigh = metrics.cpuUsage >= this.#cpuThreshold;
    const memoryHigh = metrics.memoryUsage >= this.#memoryThreshold;

    if (cpuHigh && !this.#cpuHigh) {
      this.#emit("cpu_high", { usage: metrics.cpuUsage, threshold: this.#cpuThreshold });
    }
    if (memoryHigh && !this.#memoryHigh) {
      this.#emit("memory_pressure", { usage: metrics.memoryUsage, threshold: this.#memoryThreshold });
    }
    this.#cpuHigh = cpuHigh;
    this.#memoryHigh = memoryHigh;
  }

  #emit(name: string, payload: Record<string, unknown>): void {
    const event = createExternalEvent({ source: "system", name, payload });
    for (const handler of this.#handlers) handler(event);
  }

  #validateThreshold(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`MacSystemListener ${name} must be between 0 and 100`);
    }
  }
}
