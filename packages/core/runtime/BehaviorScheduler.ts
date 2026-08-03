import type {
  SchedulerOptions,
  TimerHandle
} from "../types/RuntimeTypes.js";

export class BehaviorScheduler {
  readonly setTimer: (callback: () => void, delay: number) => TimerHandle;
  readonly clearTimer: (handle: TimerHandle) => void;
  readonly now: () => number;
  recoverTimer: TimerHandle | undefined;
  feedbackTimer: TimerHandle | undefined;
  idleTimer: TimerHandle | undefined;
  readonly cooldowns: Map<string, number>;

  constructor({
    setTimer = globalThis.setTimeout.bind(globalThis),
    clearTimer = (handle) => globalThis.clearTimeout(handle),
    now = Date.now
  }: SchedulerOptions = {}) {
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.recoverTimer = undefined;
    this.feedbackTimer = undefined;
    this.idleTimer = undefined;
    this.cooldowns = new Map();
  }

  scheduleRecovery(duration: number, callback: () => void): void {
    this.clearRecovery();
    if (!duration) return;
    this.recoverTimer = this.setTimer(callback, duration);
  }

  clearRecovery(): void {
    if (!this.recoverTimer) return;
    this.clearTimer(this.recoverTimer);
    this.recoverTimer = undefined;
  }

  scheduleFeedback(duration: number, callback: () => void): void {
    this.clearFeedback();
    if (!duration) return;
    this.feedbackTimer = this.setTimer(callback, duration);
  }

  clearFeedback(): void {
    if (!this.feedbackTimer) return;
    this.clearTimer(this.feedbackTimer);
    this.feedbackTimer = undefined;
  }

  scheduleIdle(timeout: number, callback: () => void): void {
    this.clearIdle();
    if (!timeout) return;
    this.idleTimer = this.setTimer(callback, timeout);
  }

  clearIdle(): void {
    if (!this.idleTimer) return;
    this.clearTimer(this.idleTimer);
    this.idleTimer = undefined;
  }

  markCooldown(key: string | undefined, duration: number): void {
    if (!key || !duration) return;
    this.cooldowns.set(key, this.now() + duration);
  }

  isCoolingDown(key: string | undefined): boolean {
    if (!key) return false;
    const expiresAt = this.cooldowns.get(key);
    if (!expiresAt) return false;
    if (expiresAt <= this.now()) {
      this.cooldowns.delete(key);
      return false;
    }
    return true;
  }

  stop(): void {
    this.clearRecovery();
    this.clearFeedback();
    this.clearIdle();
  }
}
