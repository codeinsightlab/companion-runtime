# Behavior Feedback Renderer Fix V1

## 背景

BehaviorEngine 已经生成独立 `BehaviorFeedback`，但 Development Pet Window 顶部还保留旧的 Runtime 状态输出。Behavior recovery 后，该区域长期显示 `RECOVERED: IDLE / <action>`；Feedback 气泡按自己的生命周期隐藏后，用户最终只看到内部状态，形成 Feedback 被覆盖的感知。

本轮只治理 `BehaviorFeedback → Pet Renderer` 的展示优先级，不修改 Listener、ExternalEvent、UserCommand、Behavior Ownership、Queue、ActionResolver 或 Character Pack。

## 根因与旧状态来源

旧状态由 `apps/desktop/src/runtime.ts` 的 `updateStatus()` 生成，写入 `apps/desktop/index.html` 的 `#runtime-status`。

触发来源包括：

- Runtime 初始化后的 `READY`；
- ExternalEvent 和 UserCommand publish 完成；
- Character 变化；
- BehaviorEngine 的 `recovered` 事件，其中 prefix 为 `RECOVERED`。

BehaviorFeedback 则由同一 Renderer 订阅 BehaviorEngine 的 `feedbackchanged`，交给 `BehaviorFeedbackPresenter` 写入独立的 `#behavior-reason`。两者不是同一 DOM 节点，但旧状态常驻，Feedback 会按 Temporary/Persistent 生命周期隐藏，因此旧状态在视觉上成为最终剩余内容。

## 修改内容

`BehaviorFeedbackPresenter` 接收可选的 Development internal status 元素，并统一执行展示优先级：

```text
BehaviorFeedback
>
Developer Runtime Status
>
Internal Lifecycle State
```

- 有 Feedback：展示 `#behavior-reason`，隐藏 `#runtime-status`。
- ActiveBehavior 或 recovery 在此期间仍可更新内部文本，但不能覆盖或遮挡 Feedback。
- Feedback 清除：恢复 Development internal status。
- Production：现有 `.development-only` 继续隐藏内部状态，只显示 BehaviorFeedback。

Renderer 不创建 Feedback、不决定 duration、不推断 reason，也不参与 Behavior 仲裁。

## 展示链路

```text
BehaviorEngine
→ feedbackchanged
→ Pet Renderer subscription
→ BehaviorFeedbackPresenter.render()
→ #behavior-reason-text
```

USER 与 SYSTEM Feedback 使用完全相同的事件订阅和 Presenter。

## 风险

- Development Mode 在 Feedback 生命周期结束后仍会恢复内部状态，这是调试信息而非用户反馈。
- 本轮没有改变 Feedback 的创建、替换、计时或 recovery 规则。
- 自动测试验证 Presenter 和事件派发；没有把实际 macOS 窗口观察伪装成人工验证。

## 验证

- Feedback 到达后更新用户文本并隐藏 internal status。
- recovery/internal status 更新不会改变当前 Feedback 文本或隐藏气泡。
- Feedback 生命周期结束后才恢复 Development status。
- USER 与 SYSTEM Feedback 通过同一个 Presenter。
- Production CSS 继续隐藏 `.development-only` internal status。

执行结果：

- `npm run typecheck`：PASS。
- `npm test`：PASS，88/88。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

## 结果

BehaviorFeedback 已成为 Pet Window 用户解释区域的最高展示优先级。`RECOVERED` 仅作为 Development internal status 存在，不能在 Feedback 有效期间覆盖用户原因。

## 2026-08-01 无原因动作代码审查

### 现象结论

当前代码确实存在“Action 已变化，但没有创建 BehaviorFeedback”的合法可达路径。主因不在 Renderer，而在自动 Idle 行为绕过了标准 Behavior execution。

### 主因：Idle 自动行为绕过 Feedback execution

Runtime 启动后会调度 Idle timer。当前配置每 30 秒抽样一次：75% 选择 `IDLE`，25% 通过 `TASK_START` 解析为 `THINKING`。

```text
BehaviorScheduler idle timer
→ PetBehaviorEngine.#runIdleBehavior()
→ #applyBehavior()
→ PetManager.changeBehavior()
→ Viewer.display()
```

这条路径直接构造 `event: IDLE:auto` 并调用 `#applyBehavior()`，没有调用 `#candidateFor()`、`#startExecution()` 或 `#replaceFeedback()`。因此：

- 25% 抽到 THINKING 时，宠物会自动切换 Action，但不会生成“任务已开始”等 Feedback；
- 75% 抽到 IDLE 时，即使 slot 没变，`PetManager.changeBehavior()` 仍会重新 render 当前 Action，产生淡出/切换视觉，但没有 Feedback；
- Idle 行为只发出 `idle` 事件，Desktop Renderer 没有订阅该事件作为用户解释。

这是当前“周期性、看似随机、无原因动作”的最直接解释。

### 次要可见运动来源

1. **Recovery 返回 IDLE。** 临时 Behavior 到期后，`#recover()` 会直接调用 `PetManager.changeBehavior(IDLE)`。这是同一 Behavior 的生命周期收尾，不创建新 Feedback。尤其 `TASK_ERROR` Action 持续 5 秒，而 Temporary Feedback 固定 3 秒，最后 2 秒及恢复切换阶段没有提示。
2. **同槽重绘。** `PetManager.changeBehavior()` 在状态未变化时仍调用 `#renderBehavior()`；Viewer 会执行 130ms switching 淡出再写入同一资源，视觉上像一次动作。
3. **持续呼吸动画。** `.ninja-pet__image` 固定执行 3.2 秒缩放/透明度动画。这是 Viewer ambient animation，不是 Behavior，因此没有 Feedback。
4. **初始化和角色切换。** PetManager 初始化、Profile/Character 切换会直接 render 当前 Action，不经过 Behavior execution；它们通常有明确用户上下文，但同样不会产生 BehaviorFeedback。

### 已排除项

- PersonalityEngine 不会自行定时触发行为；它只在 `#applyBehavior()` 或 recovery 中为既定 Behavior 选择具体 Action。
- 正常 ExternalEvent/UserCommand 一旦进入 `handleEvent()` 并被 `#startExecution()` 接受，会同步调用 `#replaceFeedback(createBehaviorFeedback(...))`，其 Feedback 生成链路完整。
- queued Event 在真正成为 active execution 前不显示 Feedback，这是 Queue 设计要求，不是本现象的缺失。
- Renderer 已订阅同一 BehaviorEngine 的 `feedbackchanged`；它无法展示一个从未被 Idle 路径创建的 Feedback。

### 根因分类

| 路径 | 是否改变可见内容 | 是否生成 Feedback | 判断 |
|-|-|-|-|
| ExternalEvent / UserCommand accepted | 是 | 是 | 正常 |
| Idle auto → THINKING | 是 | 否 | 主要架构缺口 |
| Idle auto → IDLE 同槽重绘 | 可能 | 否 | 无意义视觉切换 |
| Temporary recovery → IDLE | 是 | 不创建新 Feedback | 生命周期边界问题 |
| Viewer breathing | 是 | 否 | 预期 ambient animation |
| Character/Profile change | 是 | 否 | 配置操作，不是 Behavior |

### 最小修复方向（本次未实施）

优先统一 Idle auto 的语义，而不是在 Renderer 猜原因：

1. 自动 Idle 若代表一个真实 Behavior，应进入标准 execution/Feedback 输出，使用独立 trigger（例如 `IDLE_ACTIVITY`），避免伪装成外部 `TASK_START`；
2. 如果 IDLE 只是环境动画，则不应切到 THINKING，也应避免同一 IDLE Action 重绘；
3. recovery 是否需要延续原 Feedback 到 Action 真正完成，应由 Behavior/Feedback 生命周期定义，不能由 Renderer推断；
4. 呼吸动画保持无 Feedback，否则产品会变成持续状态提示器。

本节为只读代码审查，没有实施上述修复，也没有修改 Runtime 行为。

## 产品优化建议

### 核心原则：区分生命感与语义行为

不应为每一次视觉变化都显示原因。桌宠需要两类表现：

1. **Ambient Motion（环境生命感）**：呼吸、轻微晃动、眨眼等，不表达外部事实，不显示 Feedback。
2. **Meaningful Behavior（有语义行为）**：工作、成功、异常、用户互动等，必须有明确 trigger，并显示 Feedback。

当前自动 Idle 抽到 `TASK_START → THINKING` 混淆了两类语义：用户没有任务开始，宠物却表现为思考。这会降低用户对 Companion 反馈的信任。

### V1 推荐收口

- 保留呼吸等细微 Ambient Motion，不显示气泡。
- 移除 Idle auto 对 `TASK_START/THINKING` 的模拟；无真实输入时保持 IDLE。
- 同一 IDLE Action 不重复切图，避免被误认为新行为。
- ExternalEvent 和 UserCommand 触发的 Meaningful Behavior 必须同时产生 Action 与 Feedback。
- 临时 Feedback 至少覆盖主要 Action 感知阶段；Recovery 回 IDLE 不额外提示。

### 反馈体验分层

| 类型 | 示例 | Action | Feedback |
|-|-|-|-|
| Ambient | 呼吸、眨眼 | 轻微 | 不显示 |
| User Intent | 打招呼、庆祝、休息 | 明显 | 固定 2–3 秒 |
| System Notice | 成功、低电量、内存压力 | 明显 | 固定 3–5 秒 |
| Persistent State | 正在执行任务 | 持续 | 持续到状态结束 |
| Recovery | 返回 IDLE | 平滑收尾 | 不新增提示 |

### 产品验收标准

用户看到明显 Action 时，应能回答：

- 是我主动触发的吗？
- 是系统发生了什么吗？
- 如果都不是，它是否只是自然的生命感动画？

任何无法归入这三类的动作，都不应进入 V1。
