# V1 Ambient Behavior Polish

## 背景

人工观察发现宠物会在没有 ExternalEvent 或 UserCommand 时突然切换 Action，并且没有原因提示。代码审查确认，自动 Idle 配置每 30 秒抽样一次，其中 25% 使用 `TASK_START` 切到 THINKING；该路径绕过标准 Behavior execution，因此不会创建 BehaviorFeedback。

本轮按产品语义区分：

- Ambient Motion：呼吸等生命感动画，不显示 Feedback。
- Meaningful Behavior：用户意图或系统事实触发的行为，必须通过标准 execution 同步产生 Action 与 Feedback。

## 修改内容

### 1. 停用伪任务 Idle 行为

默认 `behavior-rules.json` 关闭自动 Idle scheduler，不再在没有真实任务时随机生成 `TASK_START/THINKING`。

Viewer 的呼吸动画保留，宠物在无输入时仍具备轻微生命感。

### 2. 避免相同 Behavior 重绘

`PetManager.changeBehavior()` 遇到当前相同 Behavior Slot 时直接复用现有 render promise，不再重新加载并淡出/淡入同一 Action。

这只消除无意义视觉切换，不改变真实状态流转、ActionResolver 或 Character mapping。

### 3. 对齐系统告警 Feedback

Temporary Feedback 仍独立于 Behavior duration，但按 trigger 使用固定产品时长：

- 常规操作与成功：3 秒。
- `TASK_ERROR`：5 秒。
- `MEMORY_PRESSURE`：5 秒。
- `BATTERY_LOW`：5 秒。

Persistent `TASK_START/TASK_RUNNING` 规则不变。Recovery 返回 IDLE 不创建额外提示。

## 设计原因

Idle 不应伪装成外部任务。用户看到明显 Action 时，应能归因于 UserCommand 或系统事实；没有业务输入时只保留非语义 Ambient Motion。

同槽行为不重绘还能减少图片 preload 与 130ms switching 动画，避免把资源刷新误认为新动作。

## 风险

- 默认配置不再自动展示 THINKING，只有真实 `TASK_START` 才会进入该 Behavior。
- `PetBehaviorEngine` 的可配置 Idle 能力仍保留，测试和未来 Character Pack 可以显式启用；本轮只关闭默认产品配置。
- Feedback 时长调整不改变 Behavior duration，二者继续保持独立生命周期。

## 验证

自动测试覆盖：

- 重复设置当前 IDLE 不触发 Viewer render。
- SYSTEM `TASK_ERROR` Feedback 固定保持 5 秒。
- 原有可配置 Idle scheduler 能力仍然通过测试。

- `npm run typecheck`：PASS。
- `npm test`：PASS，90/90。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

## 结果

默认产品配置不再产生无来源的 THINKING Action；相同 IDLE 不再触发 Viewer 切换。Meaningful Behavior 与 Feedback 链路保持不变，Ambient breathing 保留。
