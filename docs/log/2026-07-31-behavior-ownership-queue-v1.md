# Behavior Ownership & Queue V1

## 背景

Control Surface 引入 UserCommand 后，UserCommand 与 ExternalEvent 仍共用仅由 Behavior Slot priority 决定的仲裁。连续执行：

```text
GREET → CELEBRATE → REST
```

会让 CELEBRATE 长期占据 SUCCESS priority，导致 REST 被忽略。同时不同 `runtime.publish()` 可以并发进入，Engine 在 Viewer 异步切换结束后才更新 currentBehavior，点击速度会影响结果。

本轮在不改变 Input → CompanionEvent → Behavior → Action → Viewer 主链路的前提下，引入 Behavior Execution Ownership 和 Pending Queue。

## 修改内容

### BehaviorExecutionContext

新增执行上下文：

```ts
interface BehaviorExecutionContext {
  source: "USER" | "SYSTEM";
  behaviorSlot: BehaviorSlot;
  triggerName: string;
  startedAt: number;
  queuedAt?: number;
}
```

来源判断位于 BehaviorEngine：

- `CUSTOM_EVENT:USER_COMMAND:*` → USER。
- 其他 CompanionEvent → SYSTEM。

Character、ActionResolver 与 Viewer 不感知来源。

### currentExecution

BehaviorEngine 现在同时维护：

```text
currentExecution
pendingQueue
```

currentBehavior 继续保留，兼容现有状态、调试和 Personality 逻辑；执行所有权由 currentExecution 表达。

Engine 在开始应用 Viewer 前同步写入 currentExecution，关闭了原来“Viewer 完成后才更新 active behavior”的并发判定窗口。

### USER 仲裁

规则：

```text
USER current + USER incoming
→ replace
```

新 USER 立即成为 currentExecution，旧 Viewer 请求由既有 transitionToken 淘汰。

当 SYSTEM 正在执行时，USER 进入 pendingQueue。Pending USER 使用 latest-wins：

- 删除队列中旧 USER。
- 只保留最新 USER。
- 不删除或重排 SYSTEM Queue。

### SYSTEM 仲裁

规则：

```text
SYSTEM current + SYSTEM incoming
→ FIFO queue
```

临时 SYSTEM 等待 duration/recovery 完成后继续队列。

TASK_START、TASK_RUNNING 等无 duration 的持续 SYSTEM 状态，在下一条 SYSTEM 生命周期事件到达后先入队，再进行有序交接，避免永久阻塞 TASK_RUNNING/TASK_SUCCESS。

SYSTEM current + USER incoming 时，USER 等待；用户操作不会清除系统提醒。

Queue Drain 优先选择最早进入的 SYSTEM，保证 SYSTEM FIFO，USER latest-wins 在 SYSTEM Queue 完成后执行。

### Behavior Completion

所有 Control Surface UserCommand 均配置明确生命周期：

| UserCommand | Slot | Duration | Recovery |
|---|---|---:|---|
| GREET | THINKING | 1200ms | IDLE |
| CELEBRATE | SUCCESS | 3000ms | IDLE |
| ENCOURAGE | EXECUTING | 1800ms | IDLE |
| REST | IDLE | 600ms | IDLE |

UserCommand 使用独立 cooldownKey，避免继承 SUCCESS 的系统事件 cooldown。

Desktop 系统提醒也明确为临时 Behavior：

| Event | Duration | Recovery |
|---|---:|---|
| CPU_HIGH | 3000ms | IDLE |
| MEMORY_PRESSURE | 5000ms | IDLE |
| BATTERY_LOW | 5000ms | IDLE |

这样一次系统提醒不会永久占用 currentExecution。

### Priority

Priority 字段、配置和 Behavior 元数据继续保留。

V1 Ownership 规则优先于 priority：

1. 判断 current source。
2. 应用 USER replace / SYSTEM protection。
3. 进入 latest-wins 或 FIFO Queue。
4. priority 不得跨越 Ownership 直接抢占。

SYSTEM FIFO 与 USER replace 已明确覆盖 V1 的同来源策略。Priority 为未来 SYSTEM 合并、去重或队列容量策略保留，不再单独决定抢占。

### Runtime Result

BehaviorResult 新增：

```text
accepted
queued
replaced
rejected
```

BehaviorEngine 同时发出：

- `accepted`
- `queued`
- `replaced`
- `rejected`

Runtime `publish()` 返回内部 BehaviorResult。Desktop Debug Status 可以观察 UserCommand 的处理状态。

当前 Control Surface IPC 仍为单向发送，没有把结果回传给 Panel；这是明确的 V1 边界，而不是 Panel 自行判断。

## 设计原因

Ownership 将“谁可以替换谁”从 Behavior Slot priority 中分离：

```text
Source Ownership
      ↓
Queue Strategy
      ↓
Behavior Lifecycle
      ↓
ActionResolver / Viewer
```

这样 USER 能表达最新意图，同时 SYSTEM 提醒不会被按钮点击直接清除。Viewer 继续只负责展示与 Token 取消，不承担调度规则。

## 风险

- SYSTEM Queue 当前为 FIFO，尚未实现事件合并、去重和容量上限；高频 Collector 仍需要未来 Queue Policy。
- 持续 SYSTEM 状态只有在下一条 SYSTEM 生命周期事件到达时完成交接；如果某类平台事件缺少结束事件，应将其建模为有 duration/recover 的临时 Behavior。
- Runtime 已返回 BehaviorResult，但 Panel IPC 尚未返回 queued/rejected 文案。
- Priority 在 V1 Ownership 模型中不再触发跨来源抢占，属于有意的语义变化。

## 验证

执行：

- `npm run typecheck`
- `npm test`
- `npm run desktop:build`
- `git diff --check`

新增验证：

- 并发提交 GREET、CELEBRATE、REST，最终 currentExecution 为 REST。
- USER 替换 USER 返回 `replaced`。
- SYSTEM ERROR 不被 USER CELEBRATE 打断，USER latest-wins 等待。
- SYSTEM A/B 使用 FIFO。
- CELEBRATE duration 完成后恢复 IDLE。
- Runtime publish 返回 BehaviorResult。
- Viewer 最终 Asset 与 REST/IDLE 一致，旧请求不覆盖最新行为。

## 结果

- `npm run typecheck`：PASS。
- `npm test`：PASS，78/78。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

快速切换集成验证结果：

```text
GREET      → accepted
CELEBRATE  → replaced
REST       → replaced
最终执行    → REST
最终状态    → IDLE
最终资源    → 当前角色的 idle Asset
```

SYSTEM 保护、SYSTEM FIFO、USER Queue latest-wins、临时行为 recovery 均通过自动测试。未进行新的 macOS 人工界面验证；本轮变更集中在 Runtime 调度与测试链路。
