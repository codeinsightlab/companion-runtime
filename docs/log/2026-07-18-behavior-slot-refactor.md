# Behavior Slot 解耦重构

## 背景

旧链路允许 Event 映射直接携带角色、状态和具体 Action，导致外部事实与 Naruto Character Pack 的资源名称耦合。第三方 Character Pack 或用户替换动作时，需要修改 Runtime 配置，违背宿主、Runtime 与资源分层原则。

本次重构将稳定协议收敛为 `Event → Behavior Slot → Action → Asset`。Runtime 只处理 Event、Behavior Slot 与抽象 Action，PNG 路径仅由 Character Pack 自描述配置提供。

## 修改内容

- Event Contract 固定为 `TASK_START`、`TASK_RUNNING`、`TASK_SUCCESS`、`TASK_ERROR`、`IDLE`、`CUSTOM_EVENT`。
- 删除核心 Event `CODE_REVIEW`；业务扩展改用 `CUSTOM_EVENT` 的 `name` 字段。
- Behavior Slot 固定为 `IDLE`、`THINKING`、`EXECUTING`、`SUCCESS`、`ERROR`，删除 `REVIEWING`。
- 新增 `BehaviorResolver`，只负责将标准 Event 解析为 Behavior Slot。
- 新增 `ActionResolver`，根据 Behavior Slot、当前 Character 与 Behavior Mapping 解析 Action。
- 将 `character.states` 改为 Character Pack 内的 `character.json/actions`；资源文件名只存在于 Character Pack。
- `PetEventAdapter` 不再选择或切换角色，只提交 Behavior Slot。
- `PetBehaviorEngine` 保留 priority、cooldown、duration、recovery 生命周期逻辑，但不再携带角色或具体资源配置。
- Browser Demo 改为发送完整 `CompanionEvent`，并移除固定 Code Review 入口。

## 架构变化

旧链路：

```text
Event → Character / State / Action → PNG → Viewer
```

新链路：

```text
External Event
  → Event Contract
  → BehaviorResolver
  → Behavior Slot
  → ActionResolver + Current Character
  → Character Pack Action
  → Asset
  → Viewer
```

## 设计原因

### Event

Event 只表达外部事实，不包含角色选择、Action 名称或资源路径。业务专属事件通过以下形式扩展：

```json
{
  "type": "CUSTOM_EVENT",
  "name": "CODE_REVIEW"
}
```

是否支持该扩展由部署侧 Event Mapping 决定，核心 Event Contract 不增加业务枚举。

### Behavior Slot

Behavior Slot 是 Runtime 与 Character 表现之间的稳定协议。默认映射为：

```json
{
  "TASK_START": "THINKING",
  "TASK_RUNNING": "EXECUTING",
  "TASK_SUCCESS": "SUCCESS",
  "TASK_ERROR": "ERROR",
  "IDLE": "IDLE"
}
```

### Action 与 Character Pack

Behavior Mapping 将 Slot 映射为通用 Action id，例如 `SUCCESS → celebrate`。每个 Character Pack 的 `character.json` 再声明该 Action 使用的 Asset：

```json
{
  "id": "example-pet",
  "name": "Example Pet",
  "actions": {
    "celebrate": { "asset": "celebrate.png" },
    "danger": { "asset": "danger.png" }
  }
}
```

因此 Runtime 源码不知道 `susanoo`、`chidori`、`rasengan` 或任何 PNG 文件名。

### 用户配置预留

`ActionResolver` 接收独立 Behavior Mapping，未来可由用户 Profile 覆盖：

```json
{
  "character": "itachi",
  "behaviorMapping": {
    "SUCCESS": "celebrate",
    "ERROR": "danger",
    "EXECUTING": "working"
  }
}
```

本阶段只建立配置边界，不实现 UI 或 Profile 持久化。

## 风险

- 本次按要求不保留 `character.states`、`CODE_REVIEW` 核心 Event 或 `REVIEWING` 的兼容逻辑，旧调用方必须改用新 Contract。
- Character Pack 若缺少 Behavior Mapping 引用的 Action，`ActionResolver` 会明确抛错，避免静默使用错误资源。
- Viewer 动画与图片内容未修改；Behavior Engine 的生命周期算法保持不变。

## 验证

- `npm run typecheck`：通过。
- `npm test`：19/19 通过。
- Browser Demo：Sasuke、Naruto、Itachi 均可加载；`TASK_ERROR` 在 Itachi 下解析为 `ERROR/danger` 且保持 Itachi；Behavior Demo 的 `TASK_RUNNING` 解析为 `EXECUTING/working`；Personality Demo 可切换 Naruto；浏览器无 error 日志。
- 静态解耦检查：`packages/core/**/*.ts` 不包含 Naruto 具体 Action 名或 `.png`；运行配置与 Demo 不再包含 `REVIEWING`、固定 `CODE_REVIEW` 或 `character.states`。
- Git 工作区检查未发现 PNG 文件修改。

## 结果

Companion Runtime 已形成 `Event → Behavior Slot → Action → Asset` 的通用链路。Event 不知道角色，Behavior 生命周期不持有资源，Runtime 源码不依赖 PNG；Character Pack 可以通过自描述配置独立扩展。
