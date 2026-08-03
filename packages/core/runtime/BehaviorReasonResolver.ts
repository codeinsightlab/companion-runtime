import type {
  BehaviorExecutionSource,
  BehaviorFeedback,
  BehaviorFeedbackLevel,
  BehaviorFeedbackMode
} from "../types/RuntimeTypes.js";

const TEMPORARY_FEEDBACK_DURATION = 3000;
const SYSTEM_FEEDBACK_DURATIONS: Readonly<Record<string, number>> = Object.freeze({
  TASK_ERROR: 5000,
  MEMORY_PRESSURE: 5000,
  BATTERY_LOW: 5000
});

const SYSTEM_REASONS: Readonly<Record<string, string>> = Object.freeze({
  TASK_START: "任务已开始",
  TASK_RUNNING: "正在执行任务",
  TASK_SUCCESS: "任务执行成功",
  TASK_ERROR: "任务执行异常",
  CPU_HIGH: "系统 CPU 使用率过高",
  MEMORY_PRESSURE: "系统内存压力较高",
  BATTERY_LOW: "设备电量较低"
});

const USER_REASONS: Readonly<Record<string, string>> = Object.freeze({
  GREET: "用户请求打招呼",
  CELEBRATE: "用户请求庆祝",
  ENCOURAGE: "用户请求鼓励",
  REST: "用户请求休息"
});

export function resolveBehaviorReason(
  source: BehaviorExecutionSource,
  triggerName: string
): string {
  const reason = source === "USER"
    ? USER_REASONS[triggerName]
    : SYSTEM_REASONS[triggerName];
  return reason ?? (source === "USER" ? "用户发起了互动" : "收到系统状态更新");
}

function feedbackMode(source: BehaviorExecutionSource, triggerName: string): BehaviorFeedbackMode {
  return source === "SYSTEM" && (triggerName === "TASK_START" || triggerName === "TASK_RUNNING")
    ? "PERSISTENT"
    : "TEMPORARY";
}

function feedbackLevel(source: BehaviorExecutionSource, triggerName: string): BehaviorFeedbackLevel {
  if (triggerName === "TASK_ERROR") return "ERROR";
  if (["CPU_HIGH", "MEMORY_PRESSURE", "BATTERY_LOW"].includes(triggerName)) return "WARNING";
  if (triggerName === "TASK_SUCCESS" || (source === "USER" && triggerName === "CELEBRATE")) {
    return "SUCCESS";
  }
  return "INFO";
}

export function createBehaviorFeedback(
  executionId: number,
  source: BehaviorExecutionSource,
  triggerName: string,
  behaviorSlot: BehaviorFeedback["behaviorSlot"],
  createdAt: number
): BehaviorFeedback | undefined {
  if (source === "SYSTEM" && triggerName === "IDLE") return undefined;
  const mode = feedbackMode(source, triggerName);
  const duration = source === "SYSTEM"
    ? SYSTEM_FEEDBACK_DURATIONS[triggerName] ?? TEMPORARY_FEEDBACK_DURATION
    : TEMPORARY_FEEDBACK_DURATION;
  return {
    id: `behavior-feedback-${executionId}`,
    reason: resolveBehaviorReason(source, triggerName),
    behaviorSlot,
    source,
    triggerName,
    level: feedbackLevel(source, triggerName),
    mode,
    ...(mode === "TEMPORARY" ? { duration } : {}),
    createdAt
  };
}
