# UserCommand 快速切换行为审查

## 1. 审查目标

审查 Control Surface 连续发送：

```text
GREET → CELEBRATE → REST
```

时，最后一次 REST 为什么没有立即成为当前行为。本次只审查代码与运行规则，不修改 Runtime、Desktop 或配置。

## 2. 实际调用链

```text
Control Surface Button
  → SettingsIpcCoordinator.sendUserCommand()
  → RuntimeIpcCoordinator.sendUserCommand()
  → Pet Renderer onUserCommand()
  → UserCommandAdapter.toCompanionEvent()
  → CompanionRuntime.publish()
  → EventBus.publish()
  → PetBehaviorEngine.handleEvent()
  → BehaviorResolver
  → PetManager.changeBehavior()
  → PetStateMachine.transition()
  → ActionResolver
  → PetViewer.display()
```

UserCommand Contract 和 IPC 没有直接携带 Action、Character 或 Asset。UserCommandAdapter 将命令转换为 `CUSTOM_EVENT:USER_COMMAND:<NAME>`，该边界符合既有架构。

## 3. UserCommand 是否按普通 Event 处理

结论：**是。**

Desktop 为四个 UserCommand 注入普通 Event Mapping：

| UserCommand | Behavior Slot |
|---|---|
| GREET | THINKING |
| CELEBRATE | SUCCESS |
| ENCOURAGE | EXECUTING |
| REST | IDLE |

同时为它们注入空 Behavior Rule `{}`。`BehaviorRule` 对空规则使用以下默认值：

- `duration = 0`
- `recover = undefined`
- `priority = priorities[slot]`
- `cooldownKey = slot`

因此 UserCommand 会完整进入普通 Event 的：

- priority 检查；
- cooldown 检查；
- recovery 清理；
- Action/Viewer 异步应用。

只有当规则同时存在 `duration` 和 `recover` 时才会建立恢复 Timer。当前四个 UserCommand 都不会自动恢复。

## 4. Behavior Engine 当前切换规则

### 4.1 Priority

固定优先级：

| Behavior Slot | Priority |
|---|---:|
| IDLE | 0 |
| THINKING | 20 |
| EXECUTING | 40 |
| SUCCESS | 80 |
| ERROR | 100 |

新行为只有在：

```text
incoming.priority >= currentBehavior.priority
```

时才可接受。没有独立的 UserCommand 抢占策略。

对 UserCommand 的实际影响：

- GREET 可被 ENCOURAGE、CELEBRATE、ERROR 打断，但不能被 REST 打断。
- ENCOURAGE 可被 CELEBRATE、ERROR 打断，但不能被 GREET 或 REST 打断。
- CELEBRATE 进入 SUCCESS 后，只能被同级 SUCCESS 或 ERROR 打断。
- REST 映射到最低优先级 IDLE，不能打断 THINKING、EXECUTING、SUCCESS 或 ERROR。

### 4.2 Duration / Recovery

Duration 本身不是锁。真正阻止新行为的是 `currentBehavior.priority`。

标准 `TASK_SUCCESS` 配置了：

```text
duration = 3000
recover = IDLE
```

所以三秒后 priority 会回到 IDLE。

UserCommand CELEBRATE 的规则是空对象，没有继承 `TASK_SUCCESS` 的 duration/recover。它进入 SUCCESS 后不会自动回到 IDLE，`currentBehavior` 会持续保持 priority 80。

这是 `CELEBRATE → REST` 不生效的直接原因。

### 4.3 Cooldown

`BehaviorRule` 默认使用 Behavior Slot 作为 cooldownKey。Core 配置存在：

```text
SUCCESS = 5000ms
```

因此 UserCommand CELEBRATE 也会启动 SUCCESS cooldown。五秒内再次 CELEBRATE 会先因 cooldown 被忽略。

REST 没有 cooldown，但会被 SUCCESS priority 阻止。

### 4.4 Queue

当前没有 Event Queue、UserCommand Queue 或“最后一次命令优先”机制。

`EventBus.publish()` 只等待同一次 publish 的所有 Subscriber；不同 publish 调用之间没有串行化。Pet Renderer 收到 UserCommand 后也以独立 Promise 启动 `runtime.publish()`，没有等待前一条命令完成。

### 4.5 In-flight Race

`PetBehaviorEngine` 在 Viewer 完成异步 Action 应用之后才写入：

```text
currentBehavior = behavior
```

因此多条命令在约 130ms Viewer 切换窗口内并发进入时，后续命令可能仍读取旧 priority。极快点击可能全部通过；稍慢点击则会看到已经写入的 SUCCESS priority，并忽略 REST。

这会导致“点击速度不同，结果不同”。

## 5. 最小复现实验

使用当前构建产物、真实 BehaviorResolver 和 BehaviorEngine，以同步顺序执行三条命令，结果为：

```text
GREET      accepted=true   current=THINKING
CELEBRATE  accepted=true   current=SUCCESS
REST       accepted=false  reason=priority  current=SUCCESS
```

CELEBRATE 的运行时 Behavior 为：

```text
slot=SUCCESS
priority=80
duration=0
cooldownKey=SUCCESS
recover=undefined
```

该结果与人工现象一致。

## 6. ActionResolver 审查

结论：**不是根因。**

ActionResolver 只在 Behavior Slot 已经被接受后，根据 User Profile、Character Manifest 和 Runtime Default 解析 Action。它：

- 不维护 active behavior；
- 不处理 priority；
- 不处理 cooldown；
- 不创建 Timer；
- 不决定 Event 是否被接受。

REST 在到达 ActionResolver 之前已被 BehaviorEngine 以 priority 原因忽略。

## 7. Action 与 Viewer 生命周期

### 7.1 Action 是否可取消

Viewer 没有 AbortController，但使用递增 `transitionToken` 实现逻辑取消：

1. 每次 `display()` 增加 Token。
2. Asset preload 后检查 Token。
3. 130ms 切换延迟后再次检查 Token。
4. 旧 Token 不再写入图片。

因此较新的 Action 通常能覆盖尚未完成的旧 Action。

### 7.2 是否存在 Action Queue

不存在。所有 Asset preload Promise 可以并发运行，只有最新 Token 可以最终写入 Viewer。

### 7.3 Animation Completion

当前 Viewer 展示静态 PNG，并用 CSS 切换类完成视觉过渡。它没有：

- Action 播放时长；
- animation completion 回调；
- Action 完成后自动切换 Behavior；
- 针对不同 Action 的生命周期状态机。

Behavior duration/recovery 完全由 BehaviorEngine 管理，不由 Viewer 决定。

### 7.4 Viewer 竞态风险

Viewer 的 Token 能阻止旧图片覆盖新图片，但不能取消已经发出的图片加载。

另有两个次要风险：

1. 旧 display 已添加 `ninja-pet--switching` 后被新 Token 淘汰时不会自行移除该 class；通常由最新 display 移除，但若最新 preload 失败，class 可能残留。
2. 已经开始执行的 recovery callback 没有 Behavior generation/token。若 recovery 与新 Event 并发，旧 recovery 理论上可能在稍后写回旧的恢复状态。

这两个风险不解释当前稳定复现的 `CELEBRATE → REST`，但属于相邻生命周期风险。

## 8. IPC 与反馈语义

Settings IPC 只确认 UserCommand 已发送到 Pet Renderer。`RuntimeIpcCoordinator.sendUserCommand()` 是单向 `webContents.send()`，不会返回 BehaviorEngine 的 `BehaviorResult`。

因此 Control Surface 会显示“互动已发送”，但不知道命令最终是：

- accepted；
- priority ignored；
- cooldown ignored。

这不是切换失败的根因，但会让用户把“已发送”理解为“已执行”。

## 9. 根因分级

| 问题 | 影响 | 结论 |
|---|---|---|
| UserCommand 复用普通 Event priority | REST 无法覆盖较高行为 | 主要设计不匹配 |
| CELEBRATE 空规则无 duration/recover | SUCCESS priority 长期保持 80 | 直接根因 |
| UserCommand 没有 latest-wins / queue | 点击速度改变结果 | 主要并发风险 |
| Engine 在异步 Viewer 完成后更新 currentBehavior | 存在约 130ms 判定竞态 | 次要实现风险 |
| IPC 不返回 BehaviorResult | UI 无法区分发送与执行 | 可观测性风险 |
| ActionResolver | 不参与接受/拒绝 | 非根因 |
| Viewer transition token | 能抑制旧图片覆盖 | 当前机制基本有效 |

## 10. 架构判断

当前 ExternalEvent 行为模型强调系统事件 priority、duration、cooldown，这是合理的。

UserCommand 的产品语义更接近“用户当前意图”。如果期望最后一次用户命令立即生效，则不能仅依赖普通 Event 的 Slot priority；至少需要明确区分：

```text
External Event arbitration
User Command arbitration
```

两者仍可在仲裁后进入同一 Behavior → Action → Character 链路，不需要让 Panel 直接控制 Action。

## 11. 推荐修复方向

本次不实施修改。后续方案审查建议优先回答以下产品语义：

1. UserCommand 是否统一拥有“用户可抢占”权限。
2. 快速连续命令是否采用 latest-wins，还是严格 FIFO。
3. CELEBRATE 等一次性互动是否应有独立 duration/recover。
4. REST 是否表示立即回到 IDLE，还是等待当前高优先级系统事件结束。
5. External ERROR 等安全/系统级行为是否允许被 UserCommand 抢占。

推荐保持边界：

```text
Panel
  → UserCommand
  → User Command Arbitration
  → CompanionEvent / Behavior
  → ActionResolver
  → Viewer
```

不要通过 Panel 直接调用 `PetManager.changeAction()`，也不要在 Viewer 中实现业务优先级。

## 12. 审查结论

```text
AUDIT_STATUS: NEEDS_ADJUSTMENT
```

问题主要属于 **UserCommand 与 BehaviorEngine 仲裁语义不匹配**，直接触发点是 UserCommand CELEBRATE 缺少 duration/recover 后长期占据 SUCCESS priority。ActionResolver 不是根因；Viewer 有取消令牌，能够避免多数旧资源覆盖，但 Runtime 仍缺少 UserCommand 的串行或 latest-wins 语义。

## 13. 2026-07-31 实施跟进

Behavior Ownership & Queue V1 已按本报告结论实施：

- BehaviorExecutionContext 区分 USER / SYSTEM。
- USER current 可被最新 USER 替换。
- SYSTEM current 保护自身，其他输入进入 Queue。
- Pending USER latest-wins。
- Pending SYSTEM FIFO。
- UserCommand 和 Desktop 系统提醒具有明确 duration/recovery。
- Runtime publish 内部返回 accepted / queued / replaced / rejected。

实施与验证详情见：

`docs/log/2026-07-31-behavior-ownership-queue-v1.md`
