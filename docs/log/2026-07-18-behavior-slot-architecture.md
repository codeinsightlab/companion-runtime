# Behavior Slot Architecture

日期：2026-07-18  
状态：方案审查，等待协议确认

## 背景

目标是把外部 Event、稳定行为语义和角色 Action 明确拆分为：

```text
Event
→ Behavior Slot
→ Character Mapping
→ Action
```

这样未来可以替换 Character Pack、用户动作配置和 Web 配置，而无需修改 Event 协议。

本轮开始实施前对当前 V1 代码、配置、测试和 Demo 记录进行了事实审查。由于目标定义与冻结行为存在协议冲突，本次暂未修改 Runtime 或配置。

## 当前事实

当前实现并不是 `Event → Action` 直连，而是：

```text
event-mapping.json
→ PetEventAdapter
→ PetStateMachine state
→ PetCharacter.actionForState()
→ pet-manifest.json characters.*.states
→ Action
```

例如 `task_success` 当前映射为 `SUCCESS`，再由不同角色选择：

- Sasuke：`SUCCESS → susanoo`
- Naruto：`SUCCESS → big-rasengan`
- Itachi：`SUCCESS → susanoo`

因此现有 `PetState` 与 `characters.*.states` 已经承担了大部分 Behavior Slot 职责。本次升级的主要价值不是消除直接 Action 映射，而是：

- 给稳定行为协议建立独立的 `BehaviorSlot` 类型。
- 把配置字段语义从状态实现细节明确为行为槽映射。
- 增加独立 Behavior Resolver。
- 决定 Event Mapping 是否继续允许选择角色。

## 架构冲突

### 1. Behavior Slot 缺少 REVIEWING

任务定义的固定槽为：

- `IDLE`
- `THINKING`
- `EXECUTING`
- `SUCCESS`
- `ERROR`

但 V1 冻结状态还包含 `REVIEWING`，并被以下路径实际使用：

- `CODE_REVIEW → code_review`
- `event-mapping.json → REVIEWING`
- `behavior-rules.json` 中优先级为 60
- Sasuke/Naruto/Itachi 均有 REVIEWING Action
- Demo 已验证 Itachi REVIEWING 行为

如果删除 `REVIEWING` 或把它映射到 `THINKING`，会改变状态、优先级、Action 和 Demo 文案，违反“已有行为一致”和“禁止修改 StateMachine 生命周期”。

推荐：Behavior Slot V1 包含六个槽，保留 `REVIEWING`。

### 2. Sasuke SUCCESS 示例与当前行为冲突

任务示例给出：

```text
Sasuke SUCCESS → chidori
```

当前配置与测试事实为：

```text
Sasuke EXECUTING → chidori
Sasuke SUCCESS → susanoo
```

修改为 `chidori` 会直接改变 V1 表现，也与“升级后最终表现一致”冲突。

推荐：示例仅视为说明，不修改现有角色映射；继续保持 Sasuke `SUCCESS → susanoo`。

### 3. Event Mapping 当前包含角色选择

当前配置：

```json
{
  "code_review": {
    "character": "itachi",
    "state": "REVIEWING"
  },
  "task_error": {
    "character": "itachi",
    "state": "ERROR"
  }
}
```

目标原则要求 Event 只决定 Behavior Slot，不关心当前宠物是谁。若严格执行，应改为：

```json
{
  "CODE_REVIEW": "REVIEWING",
  "TASK_ERROR": "ERROR"
}
```

这会取消 `code_review` 和 `task_error` 自动切换 Itachi 的现有行为。若继续保留角色字段，则 Event Mapping 仍然影响角色选择，不满足目标解耦原则。

推荐：以新架构为准，Event Mapping 只返回 Behavior Slot；当前角色保持不变。该选择属于有意的 V2 语义变化，不能同时宣称 V1 角色切换效果完全一致。

## 配置设计建议

在协议确认后，建议采用：

```json
{
  "events": {
    "TASK_START": "THINKING",
    "TASK_RUNNING": "EXECUTING",
    "TASK_SUCCESS": "SUCCESS",
    "TASK_ERROR": "ERROR",
    "CODE_REVIEW": "REVIEWING",
    "IDLE": "IDLE"
  }
}
```

角色配置采用：

```json
{
  "behaviorMapping": {
    "IDLE": "idle",
    "THINKING": "sharingan",
    "EXECUTING": "fireball",
    "REVIEWING": "code-review",
    "SUCCESS": "susanoo",
    "ERROR": "crow-dissolve"
  }
}
```

用户配置未来可以覆盖角色默认映射：

```json
{
  "character": "itachi",
  "behaviorMapping": {
    "SUCCESS": "susanoo",
    "ERROR": "crow-dissolve"
  }
}
```

本阶段只应定义配置数据结构和 Resolver 注入边界，不实现 UI 或持久化。

## 最小实施范围建议

确认协议后，最小修改为：

1. 新增 `BehaviorSlot.ts`，Behavior Slot 独立于 EventType。
2. 新增 `BehaviorResolver.ts`，只执行 `character + slot → action`。
3. 将 `EventMapping` 类型改为 `EventType → BehaviorSlot`。
4. `PetEventAdapter` 只解析和返回 Behavior Slot，并通过现有 PetManager 状态入口驱动 Runtime。
5. 将 manifest 的 `states` 明确迁移为 `behaviorMapping`；必要时只在加载边界提供旧字段兼容，不保留两套运行时真相源。
6. 保持 Behavior Engine priority、cooldown、duration、recovery 和 Personality 逻辑不变。
7. 增加 Event Mapping、Behavior Resolver、兼容性和 Demo 回归测试。

## 风险

- `BehaviorSlot` 与 `PetState` 若长期并存且集合不同，会形成两个协议真相源。
- Event Mapping 同时兼容大写新 EventType 和小写 V1 key 时，必须集中在 Normalizer/加载边界，不能在 Runtime 到处判断。
- Personality Engine 当前可能覆盖 slot 的默认 Action；Resolver 与 Personality 的优先顺序必须保持现有逻辑，否则 weighted selection 会变化。
- 移除 Event Mapping 的角色字段会改变 `CODE_REVIEW` 和 `TASK_ERROR` 的角色切换效果。
- 直接重命名 manifest 字段会影响 Demo 配置加载，必须经过完整浏览器回归验证。

## 验证

本轮仅执行只读代码事实审查，未运行迁移后的验证，因为协议尚未确认。

实施完成后必须执行：

```text
npm run typecheck
npm test
npm run demo + 浏览器交互验证
```

验收至少覆盖：

- `TASK_SUCCESS → SUCCESS`
- Sasuke/Naruto/Itachi 对同一 slot 解析为各自 Action
- `CODE_REVIEW → REVIEWING`
- Personality preference 仍可覆盖角色默认 Action
- 原有 priority、cooldown、recovery 测试全部通过

## 结果

当前无法在同时满足所有文字约束的情况下安全实施。需要先确认 Behavior Slot 集合、Sasuke SUCCESS 映射，以及是否保留 Event 驱动的 Itachi 自动切换。

