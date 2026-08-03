# Behavior Feedback Lifecycle V1

## 背景

Behavior Reason Visualization 初版以 `activeExecution` 是否存在直接控制气泡。这样职责方向正确，但展示时间被 Behavior duration、Action 加载和 recovery/handoff 内部步骤影响：短命令不足 2 秒，SYSTEM handoff 可能短暂隐藏，旧 recovery 也缺少状态写入前的 identity 防线。

本阶段把“宠物当前执行什么”与“用户应该知道刚刚发生什么”拆成两个并存模型。

## Behavior 与 Feedback 边界

```text
BehaviorExecution
        ├── ActiveBehaviorView → 当前执行状态
        ├── Action             → Character 展示
        └── BehaviorFeedback   → 用户事实解释
```

`ActiveBehaviorView` 保留，不改变 Behavior Ownership、Queue 或 ActionResolver。

新增 `BehaviorFeedback`：

- `id`
- `reason`
- `behaviorSlot`
- `source`
- `triggerName`
- `level`: INFO / SUCCESS / WARNING / ERROR
- `mode`: TEMPORARY / PERSISTENT
- `duration`
- `createdAt`

BehaviorEngine 维护唯一 `currentFeedback`，并发布 `feedbackchanged`。Renderer 只消费 Feedback，不推断原因、duration 或 hide 条件。

## Temporary / Persistent 模型

### Temporary

V1 统一固定显示 3000ms，从 Feedback 创建时开始计时，与 Action preload、Behavior duration 和 recovery 分离。

适用：

- 所有 UserCommand，包括映射为 IDLE 的 REST。
- TASK_SUCCESS / TASK_ERROR。
- CPU_HIGH / MEMORY_PRESSURE / BATTERY_LOW。
- 其他普通提醒。

Behavior 可以先恢复 IDLE，Feedback 仍显示到自己的 3000ms 到期。

### Persistent

TASK_START 和 TASK_RUNNING 使用 PERSISTENT，不创建 Feedback timer。它们持续到下一条实际执行的 Behavior 生成新 Feedback，或 Runtime stop。

queued behavior 不创建 Feedback，因此不会提前展示等待中的 UserCommand。

## Handoff

SYSTEM persistent handoff 仍可在内部清空旧 active execution，但不清空 current Feedback。下一 execution 启动时直接 replace：

```text
正在执行任务
      ↓ replace
任务执行成功
```

`feedbackchanged` 序列不包含中间 `undefined`，Renderer 不产生 hide/show 闪烁。

每次 replace 都取消旧 Feedback timer；即使过期 timer 迟到，Feedback id 校验也禁止它清除新 Feedback。

## Recovery Race

`#recover()` 现在在解析 Action 或写入 StateMachine / Viewer 前检查：

```text
activeExecution === recoveryExecution
```

过期 execution 的 recovery callback 会直接退出，不能把新 execution 改回 IDLE。Viewer 自身 transition token 继续作为资源展示的第二层保护。

## Renderer

Pet Renderer 改为监听 `feedbackchanged`，并通过无状态 `BehaviorFeedbackPresenter` 更新同一个气泡：

- 有 Feedback：更新文本、debug metadata 和 data attributes，显示。
- 无 Feedback：隐藏并清空文本。

Presenter 没有 timer、Queue、Event 或 Action 知识。

## 风险

- V1 Temporary duration 固定为 3000ms，尚未配置化。
- TASK_START 被视为 Persistent；未来如果 Host 把它建模为瞬时通知，需要在 Feedback policy 层调整。
- 当前 reason 文案仍为确定性中文映射，没有本地化机制。
- 真实运行中的 Companion 进程加载的是修改前构建，需要正常退出并重新启动后才能人工验收本次 UI 行为。

## 验证

新增自动验证：

- GREET Behavior 1200ms 恢复后，Feedback 继续到独立 3000ms。
- TASK_RUNNING Persistent Feedback 被 TASK_SUCCESS 直接替换，事件序列无空值。
- SYSTEM TASK_RUNNING 执行时，queued USER CELEBRATE 不改变 current Feedback。
- 模拟已无法取消的旧 recovery callback，确认其不能修改替换后的 GREET execution。
- Presenter 能更新和隐藏现有气泡，且不包含计时决策。

执行结果：

- `npm run typecheck`：PASS。
- `npm test`：PASS，86/86。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

## 实际验证

只读进程检查确认已有 production Companion 主进程及 Pet / Settings Renderer 正在运行。该进程在本轮 build 前启动，未加载当前修改。

为避免强制关闭用户正在运行的桌宠，本轮没有杀进程或启动第二实例。因此以下真实 macOS 项目仍需在用户正常退出并重新启动后验收：

- Temporary Feedback 是否稳定显示约 3 秒。
- TASK_RUNNING → TASK_SUCCESS 是否无视觉闪烁。
- 气泡与 Pet Action 是否自然同步。
- Panel、拖动、透明窗口是否无回归。

没有把自动测试结果记录为真实 UI 验证。

## 结果

Behavior 与 Feedback 生命周期已经在代码和自动测试层解耦。架构与自动回归达到 V1 Freeze 条件；最终冻结仍需完成上述真实 macOS 人工视觉验收。

---

## 2026-08-01 System Behavior Feedback Missing 审查

### 审查结论

本次只读对比 UserCommand 与 ExternalEvent 两条 Desktop 实际链路。结论是：**BehaviorEngine、BehaviorFeedback 和 Renderer Presenter 没有针对 SYSTEM 的缺失分支。只要 SYSTEM Behavior 真正进入 execution，Feedback 会被创建并展示。**

当前可确认的差异发生在 BehaviorEngine 之前和 execution 开始条件：

- UserCommand 有明确的 Control Surface 操作，每次点击都会发送已支持的命令。
- macOS Listener 只在真实阈值/状态变化满足条件时 emit。
- Desktop ExternalEventMapper 当前只注册 CPU_HIGH、MEMORY_PRESSURE、BATTERY_LOW 三项映射。
- TASK_START / TASK_RUNNING / TASK_SUCCESS / TASK_ERROR 不是当前 macOS Listener 的 ExternalEvent 输出，也没有对应 ExternalEventMapper entry；它们只能从已经是 CompanionEvent 的入口进入，例如 Development Event 按钮。
- queued / rejected SYSTEM candidate 不生成 Feedback；Feedback 只在 `#startExecution()` 时创建。

因此“宠物发生了非用户动作”不能直接证明收到 ExternalEvent：idle scheduler 也会改变宠物 Behavior，但它绕过 `#startExecution()`，当前不创建 Feedback。

### 两条实际链路对比

#### UserCommand

```text
Control Surface
→ SettingsIpcCoordinator.sendUserCommand
→ RuntimeIpcCoordinator.sendUserCommand
→ Pet Renderer preload bridge
→ UserCommandAdapter
→ CompanionEvent CUSTOM_EVENT:USER_COMMAND:*
→ runtime.publish
→ BehaviorEngine.handleEvent
→ source USER
→ execution start
→ BehaviorFeedback
→ feedbackchanged
→ BehaviorFeedbackPresenter
```

该路径的输入集合受 `isUserCommandName` 校验，并且 Desktop 显式配置了 GREET、CELEBRATE、ENCOURAGE、REST 的 Event mapping 与 Behavior rule，所以点击通常能稳定到达 execution。

#### ExternalEvent

```text
MacSystemListener / MacBatteryListener
→ ExternalEvent source=system
→ DesktopLifecycleManager.forwardExternalEvent
→ RuntimeIpcCoordinator.sendExternalEvent
→ Pet Renderer preload bridge
→ ExternalEventMapper
→ EventNormalizer
→ CompanionEvent CUSTOM_EVENT:CPU_HIGH|MEMORY_PRESSURE|BATTERY_LOW
→ runtime.publish
→ BehaviorEngine.handleEvent
→ source SYSTEM
→ execution start 或 queue
→ BehaviorFeedback（仅 execution start）
→ feedbackchanged
→ BehaviorFeedbackPresenter
```

Runtime ready 后才启动 Listener，因此正常启动顺序不存在 Listener 首次采样早于 Renderer 订阅的问题。

### 检查项

#### 1. ExternalEvent 是否进入 BehaviorExecutionContext

**PASS，有条件。**

ExternalEvent 必须先被 Desktop `ExternalEventMapper` 命中并由 `EventNormalizer` 转成 CompanionEvent。BehaviorEngine 对所有不是 `CUSTOM_EVENT:USER_COMMAND:*` 的输入标记 `source: SYSTEM`，并把 Behavior Slot、triggerName、reason 写入 candidate execution context。

映射缺失时会在 ExternalEventMapper 抛出 `No Internal Event mapping`，不会形成 BehaviorExecutionContext。

#### 2. SYSTEM Behavior 是否创建 BehaviorFeedback

**PASS，但只在 execution 真正开始时。**

`#startExecution()` 不区分 USER/SYSTEM，统一调用 `createBehaviorFeedback()` 和 `#replaceFeedback()`。

以下情况不会立即创建：

- SYSTEM candidate 仍在 pending queue。
- Event mapping / Behavior rule 不存在并抛错。
- candidate 被 cooldown 等规则 rejected。
- idle scheduler 通过 `#runIdleBehavior()` 直接改变 Behavior，而非 execution。

#### 3. BehaviorReasonResolver 是否支持 SYSTEM trigger

**PASS。**

显式支持：

- TASK_START
- TASK_RUNNING
- TASK_SUCCESS
- TASK_ERROR
- CPU_HIGH
- MEMORY_PRESSURE
- BATTERY_LOW

未知 SYSTEM trigger 使用“收到系统状态更新”作为事实 fallback。

#### 4. TASK_* 是否有 reason

**PASS。**

| Trigger | Reason |
|-|-|
| TASK_START | 任务已开始 |
| TASK_RUNNING | 正在执行任务 |
| TASK_SUCCESS | 任务执行成功 |
| TASK_ERROR | 任务执行异常 |

但这些 reason 存在于 Feedback policy，不等于当前 Listener 会产生相应事件。macOS Listener 当前只产生 cpu_high、memory_pressure、battery_low。

#### 5. Persistent Feedback 是否发送 feedbackchanged

**PASS。**

TASK_START / TASK_RUNNING 被定义为 PERSISTENT。execution 开始时 `#replaceFeedback()` 无条件发出一次 `feedbackchanged`；Persistent 不创建 hide timer。SYSTEM handoff 保留旧 Feedback，下一 execution 直接发新 Feedback 替换，不发送中间空值。

queued TASK_RUNNING 不会提前发送，符合 active-only 规则。

#### 6. Renderer Presenter 是否处理 SYSTEM Feedback

**PASS。**

Renderer 监听统一 `feedbackchanged`，Presenter 不检查 source。USER 与 SYSTEM 使用完全相同的 render 分支：写 reason/debug metadata、level/mode 并显示；undefined 时隐藏。

### UserCommand 为什么正常

1. 用户点击是确定性输入，不依赖系统阈值。
2. IPC channel、UserCommandAdapter、Event mapping 和 Behavior rules 都有完整显式配置。
3. 当前没有 SYSTEM execution 时，USER command 会立即开始 execution 并创建 Feedback。
4. Presenter 对 USER/SYSTEM 没有分支，用户看到的是 execution 已开始的直接结果。

### SYSTEM 为什么可能没有显示

按当前代码，不能归因于 SYSTEM Feedback 创建或 Presenter 缺失。可确认的候选原因按链路顺序为：

1. Listener 没有真正 emit：CPU 需要超过阈值并持续 10 秒；Memory 只在进入新的非 normal pressure level 时 emit；Battery 只在低于阈值且未充电、并由非 low 转为 low 时 emit。
2. ExternalEvent key 没有 Desktop mapping：当前只支持 `system:cpu_high`、`system:memory_pressure`、`system:battery_low`。
3. TASK_* 被误认为当前 Listener ExternalEvent：现有 macOS Listener 不产生 TASK_*。
4. SYSTEM candidate 处于 queue，尚未开始 execution，因此不应提前显示 Feedback。
5. 观察到的是 idle scheduler 行为，而非 ExternalEvent execution；idle scheduler 当前没有 Feedback。
6. 映射或 Runtime publish 异常只通过 `notifyRuntimeError/console.error` 报告，Production UI 没有输入链路诊断信息，用户侧表现可能只是“没有气泡”。

当前代码证据不足以在不复现、不注入事件的只读审查中，把现象唯一归因到上述某一项。

### 缺失模块

核心 Feedback 模型没有缺失模块。当前缺失的是：

- Desktop Host 级 ExternalEvent → Renderer → Feedback 的确定性集成测试。
- ExternalEvent 接收、mapping、publish result、feedbackchanged 四个边界的可观测证据。
- 如果产品要求外部来源发送 TASK_*，则缺少对应 Listener/Adapter source 与 Desktop ExternalEvent mapping；不能只依赖 Reason 表。
- idle scheduler 是否需要 Feedback 的产品定义；当前实现明确不产生。

### 推荐最小修复方案

在编码前先用可控 ExternalEvent 复现并确认失败边界。最小顺序：

1. 增加一条 Desktop Host 集成测试，注入 `system:memory_pressure`，断言映射后的 CompanionEvent、SYSTEM execution、Feedback 和 Presenter 文本。
2. 在 Development Mode 增加最小链路状态记录：ExternalEvent received、mapped key、publish status、Feedback id；Production 不展示原始技术信息。
3. 如果失败发生在 TASK_* 外部输入，按真实 source 增加显式 ExternalEvent mapping；不修改 FeedbackEngine。
4. 如果失败只是 pending SYSTEM，保持 active-only 语义，在 Developer Mode 展示 queued 状态，而不是提前展示 Feedback。
5. 如果观察到的是 idle scheduler，先确认产品是否希望解释自动 idle 行为；不要把它伪装成 SYSTEM ExternalEvent。

不建议先修改 BehaviorReasonResolver、BehaviorFeedbackPresenter 或 Feedback duration，因为当前代码已经覆盖 SYSTEM 且两条输入在 `runtime.publish()` 后使用同一实现。

### 审查状态

```text
SYSTEM_FEEDBACK_CORE: PASS
SYSTEM_FEEDBACK_HOST_EVIDENCE: INSUFFICIENT
ROOT_CAUSE: NOT_UNIQUELY_PROVEN
```
