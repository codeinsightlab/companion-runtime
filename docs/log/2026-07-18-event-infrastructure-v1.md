# Event Infrastructure V1

日期：2026-07-18  
状态：完成

## 背景

Companion Runtime V1 已完成 TypeScript 迁移，但外部事件仍直接进入 `PetEventAdapter` 或 `PetBehaviorEngine`。这种方式适合 Demo，不适合未来同时接入 Codex、VS Code、macOS 或 Windows，因为平台事件格式和生命周期不同，直接接入会让 Runtime 知道事件来源。

Event Infrastructure V1 增加统一事件入口，使平台采集、事件分发和 Runtime 行为保持解耦。本阶段只建立平台无关基础设施，不监听操作系统、编辑器、文件系统或任何真实应用。

## 修改内容

新增 `packages/core/events/`：

- `CompanionEvent.ts`：统一 Event Model。
- `EventType.ts`：基础事件类型及可扩展类型边界。
- `EventBus.ts`：异步 publish、subscribe、unsubscribe。
- `EventCollector.ts`：平台无关 Collector Interface。
- `EventNormalizer.ts`：来源标准化、事件名标准化及 V1 Runtime 兼容转换。

新增 `packages/collectors/mock/MockEventCollector.ts`：

- 支持 `start()` / `stop()` 生命周期。
- 支持 `onEvent()` 注册下游处理器。
- 支持手动 `emit()`。
- 不读取真实平台、文件系统或应用状态。

Phase 1 的 `packages/core/types/CompanionEvent.ts` 和 `EventType.ts` 改为重新导出 events 目录中的规范定义，避免存在两个 Event Model 真相源。

构建与测试范围增加：

- `packages/core/events/**/*.ts`
- `packages/collectors/**/*.ts`
- `packages/core/tests/events/*.test.ts`

## 架构

### 标准事件链路

```text
Event Source
→ Event Collector
→ CompanionEvent
→ Event Bus
→ Event Normalizer.toRuntimeMessage()
→ PetEventAdapter
→ PetBehaviorEngine
→ Runtime
```

Collector 不引用 `PetManager`、`PetViewer`、Behavior 或 Personality。EventBus 只处理 `CompanionEvent`，不知道订阅者是否属于 Runtime。

### Normalizer 双边界

`EventNormalizer` 提供两个纯转换边界：

1. `normalize()`：把 Collector 获得的原始名称和来源转换为 `CompanionEvent`。
2. `toRuntimeMessage()`：把标准大写 EventType 转换为 V1 已冻结的小写 Runtime event key。

例如：

```text
{ source: "mock", event: "running" }
→ { type: "TASK_RUNNING", source: { app: "mock" }, ... }
→ { event: "task_running", payload: {} }
```

双边界避免修改现有 `event-mapping.json`、Behavior 规则和 Runtime API，也避免把 Codex、VS Code 或操作系统判断写入 Runtime。

## Event Model

`CompanionEvent` 包含：

- `id`：事件唯一 ID。
- `type`：标准 EventType。
- `source`：至少包含 `app`，可选 `platform` 和 `collector`。
- `payload`：`Record<string, unknown>`，不允许公共边界退化为 `any`。
- `timestamp`：事件时间戳。

V1 基础 EventType：

- `TASK_START`
- `TASK_RUNNING`
- `TASK_SUCCESS`
- `TASK_ERROR`
- `CODE_REVIEW`
- `IDLE`

EventType 保留自定义字符串扩展能力。未知类型会统一转为大写下划线格式；进入 V1 Runtime 时转换为小写下划线格式，但不会引入平台特判。

## Collector Interface

Collector 统一实现：

```ts
interface EventCollector {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: EventCollectorHandler): void;
}
```

Collector 只负责获取和发出 Event，不负责：

- 行为优先级
- 状态切换
- Personality 选择
- Viewer 展示
- Character Pack 访问

Mock Collector 要求先 `start()` 再 `emit()`，用于验证未来真实 Collector 的生命周期约束。

## 扩展方式

### macOS Collector

在 `packages/collectors/macos/` 实现 `EventCollector`。平台 API、权限与监听生命周期必须封装在 Collector 内，输出 `CompanionEvent`，不得引用 Runtime。

### Windows Collector

在 `packages/collectors/windows/` 实现相同 Interface。Windows 原始事件通过 Normalizer 转换，不在 EventBus 或 Runtime 中增加平台分支。

### Codex Adapter

Codex 事件采集与 Runtime 适配应分层：

```text
Codex Collector
→ EventBus
→ EventNormalizer
→ Codex Adapter / PetEventAdapter
```

Collector 负责读取 Codex 事件，Adapter 负责把标准 Event 转换为 Runtime 消息。不得由 Collector 直接调用 `PetManager`。

## 设计原因

- EventBus 使用 handler 集合，避免重复订阅，并在 publish 时复制订阅快照，降低订阅过程中修改集合的状态竞争。
- `publish()` 等待同步或异步 Subscriber 完成，使测试、错误传播和后续真实 Collector 的背压行为可预测。
- `subscribe()` 返回取消函数，同时保留显式 `unsubscribe()`，满足组件生命周期与直接管理两种使用方式。
- CompanionEvent 与 source/payload 使用只读类型，并在标准化时冻结浅层对象，避免 Subscriber 意外改写公共事件。
- 不新增第三方依赖、全局单例或平台抽象基类，保持基础设施轻量。

## 风险

### 大写标准类型与 V1 小写规则不一致

通过 `toRuntimeMessage()` 集中转换。没有修改 Behavior 规则、Event Mapping 或 Runtime 方法。

### 异步 Subscriber 错误

EventBus 不吞掉错误；任一 Subscriber 失败会使 `publish()` reject。未来真实 Collector 应在宿主边界决定重试和日志策略，而不是由 EventBus 隐式忽略。

### 自定义事件未被 Runtime 支持

EventType 可以扩展，但 `PetEventAdapter` 和 Behavior Engine 仍会根据现有配置拒绝未知事件。这是预期边界：扩展 EventType 不等于自动扩展宠物行为。

### Mock 与真实平台差异

Mock Collector 只证明接口、生命周期和链路，不代表真实平台权限、断线恢复或事件去重已经完成。

## 验证

执行：

```text
npm run typecheck
PASS (0 errors)
```

执行：

```text
npm test
16 passed
0 failed
```

其中原有 Runtime 测试 8 项继续通过，新增 Event 测试 8 项：

- EventBus publish / subscribe。
- EventBus 显式 unsubscribe。
- subscribe 返回的取消函数。
- 原始事件标准化。
- 标准 Event 转 V1 Runtime 消息。
- Mock Collector 事件进入 EventBus。
- Mock Collector start 生命周期约束。
- `TASK_SUCCESS` 经 Mock Collector、EventBus、Normalizer、PetEventAdapter 和 PetBehaviorEngine 后进入 SUCCESS。

范围验证：

- 新增 Event 代码无显式 `any`。
- 无 CommonJS 或 `require()`。
- PetViewer、PetStateMachine、Behavior/Personality 配置、Demo、PNG 和 Character Pack 均未修改；关键文件哈希与实施前一致。

## 结果

Companion Runtime 已具备平台无关的统一事件入口、异步发布订阅、标准化边界和可测试的 Collector 生命周期。当前没有 macOS、Windows、Codex、VS Code 或文件系统实现。

下一阶段可在独立 feature 分支实现 macOS Collector，并首先审查权限、事件来源、生命周期和数据最小化策略，不应修改本阶段 EventBus 或 V1 Runtime 行为。

