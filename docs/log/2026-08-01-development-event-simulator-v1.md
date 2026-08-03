# Development Event Simulator V1

## 背景

真实 macOS Listener 依赖 CPU 持续阈值、Memory Pressure 状态变化和 Battery 条件，无法稳定用于人工验收。此前 Pet Window Development 按钮直接生成 CompanionEvent，不能证明 ExternalEvent → Mapping 边界可用。

本阶段在 Control Surface 的 Developer Mode 中增加 System Event Simulator，用确定性输入验证完整链路。

## 修改内容

### Simulator 输入

支持：

- CPU_HIGH
- MEMORY_PRESSURE
- BATTERY_LOW
- TASK_RUNNING
- TASK_SUCCESS
- TASK_ERROR

`DevelopmentEventSimulator` 为每个按钮创建标准 `ExternalEvent`：

```text
Control Surface
→ Settings IPC
→ createDevelopmentExternalEvent
→ RuntimeIpcCoordinator.sendExternalEvent
→ Pet Renderer ExternalEventMapper
→ EventNormalizer
→ CompanionRuntime.publish
→ BehaviorEngine
→ Action + BehaviorFeedback
→ Presenter
```

没有直接调用 BehaviorEngine、PetManager、ActionResolver 或 Viewer。

### Event Mapping

系统指标继续使用现有 mapping：

- `system:cpu_high` → `CUSTOM_EVENT:CPU_HIGH`
- `system:memory_pressure` → `CUSTOM_EVENT:MEMORY_PRESSURE`
- `system:battery_low` → `CUSTOM_EVENT:BATTERY_LOW`

Simulator 为 TASK 输入补充显式 Host mapping：

- `system:task_running` → `TASK_RUNNING`
- `system:task_success` → `TASK_SUCCESS`
- `system:task_error` → `TASK_ERROR`

这些映射属于 Desktop Host，不修改 Listener 或 Event Contract。

### Development Mode 隔离

- Simulator 位于现有 Developer Mode 折叠区域。
- Production CSS 隐藏整个 Developer Mode。
- Main Process 保存 Desktop mode，并在 Production 对模拟 IPC 返回明确错误。
- IPC 校验 Settings Window sender 和固定事件白名单。

因此即使 Renderer 尝试绕过 UI，Production Main 也不会发送模拟事件。

## 设计原因

Simulator 模拟的是外部事实输入，不模拟最终 Behavior。这样测试失败时可以定位：

```text
ExternalEvent creation
→ IPC delivery
→ Mapping
→ Runtime publish
→ Behavior execution
→ Feedback rendering
```

测试数据带 `simulated: true`，避免与真实系统采样混淆。

## 风险

- Simulator 使用 `source: system` 以复用真实 macOS mapping；事件 payload 通过 `simulated: true` 标识测试来源。
- TASK_* 当前没有真实 macOS Listener，只是 Development Host 输入。
- 连续点击仍遵守 Behavior Ownership 与 SYSTEM FIFO，不保证每个按钮立即执行。
- 当前正在运行的 Electron 实例需要正常退出并重启，才能加载新 Simulator UI。

## 验证

自动测试覆盖：

- Simulator 只接受六个白名单事件。
- BATTERY_LOW 生成标准 system ExternalEvent 和事实 payload。
- Production Main 拒绝模拟请求。
- Settings 中存在六个按钮，并由 Production Developer Mode 隐藏。
- TASK_RUNNING 完整链路得到 EXECUTING Action 和“正在执行任务”Persistent Feedback。
- TASK_SUCCESS 替换为 SUCCESS Action 和“任务执行成功”Feedback。
- BATTERY_LOW 得到 ERROR Action 和“设备电量较低”Feedback。

执行结果：

- `npm run typecheck`：PASS。
- `npm test`：PASS，87/87。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

## 结果

Development Event Simulator 已建立真实 ExternalEvent 验证入口。Production 不显示且 Main Process 会拒绝调用，不影响 Runtime、Listener 或 Viewer 职责边界。
