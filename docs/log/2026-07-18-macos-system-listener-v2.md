# macOS System Listener Capability V2

## 背景

Listener V1 建立了 `Listener → ExternalEvent → Mapping → Runtime` 边界，但 Memory 仅使用 `totalmem()` 与 `freemem()` 的简单占用率，CPU 瞬时越过 90% 就会触发，也没有电池感知。V2 在不修改 Runtime Core、Event Contract、Behavior Slot、Action Resolver、Character System 和 User Profile 的前提下增强 macOS 真实感知能力。

## 修改内容

### Memory Pressure

新增 `MacMemoryPressureAdapter`，通过 macOS 原生命令：

```text
/usr/bin/memory_pressure -Q
```

读取 `System-wide memory free percentage`，并转换为稳定等级：

- free percentage 大于 15%：`normal`
- free percentage 小于或等于 15%：`warning`
- free percentage 小于或等于 5%：`critical`

`MacSystemListener` 只在进入非 normal 等级或压力等级继续升降时发出：

```json
{
  "source": "system",
  "name": "memory_pressure",
  "payload": {
    "platform": "macos",
    "level": "warning",
    "freePercentage": 10
  }
}
```

这里的 level 是对 macOS 原生命令公开 free percentage 的项目级分类，不声称是 macOS 私有 API 返回的原生 pressure level。

### CPU

CPU 仍通过两次 `node:os.cpus()` 累积时间差计算，但增加持续时间条件：

- 默认阈值：90%
- 默认持续时间：10 秒
- 默认采样周期：5 秒
- 瞬时峰值不触发
- 持续高于阈值达到 10 秒后只触发一次
- CPU 回落后重置，再次持续高负载可以重新触发

输出仍是纯 External Event：

```json
{
  "source": "system",
  "name": "cpu_high",
  "payload": {
    "platform": "macos",
    "usage": 95,
    "threshold": 90,
    "durationMs": 10000
  }
}
```

### Battery

新增 `MacBatteryStatusProvider` 和 `MacBatteryListener`。Provider 使用：

```text
/usr/bin/pmset -g batt
```

解析当前电量和是否正在充电。默认每 30 秒采样，电量低于 20% 且未充电时发出一次 `battery_low`；电量恢复或开始充电后会重新布防。

```json
{
  "source": "system",
  "name": "battery_low",
  "payload": {
    "platform": "macos",
    "level": 15,
    "charging": false,
    "threshold": 20
  }
}
```

没有内置电池或 `pmset` 不返回电量时不发出事件。

### Lifecycle

所有 Listener 现在统一支持：

- `start()`：幂等启动采样。
- `stop()`：清理 timer 并重置触发状态，允许重新启动。
- `destroy()`：清理 timer、Adapter、Provider、handler，之后禁止重新启动或注册 handler。

`ListenerManager` 新增 `destroyAll()`，Desktop 在退出时统一销毁 System 与 Battery Listener。重复调用 destroy 不会重复释放资源。

## 架构影响

架构边界没有变化：

```text
MacSystemListener / MacBatteryListener
        ↓ ExternalEvent
Desktop IPC
        ↓
ExternalEventMapper
        ↓ CUSTOM_EVENT
EventNormalizer / runtime.publish()
        ↓
Behavior → Current Character → Action / Asset
```

Desktop 增加：

```text
system:battery_low → CUSTOM_EVENT / BATTERY_LOW
```

并在宿主注入 Mapping 中把 `BATTERY_LOW` 映射到现有 `ERROR` Behavior Slot。该决定不在 Battery Listener 中，Listener 不知道 Runtime Event、Behavior、当前角色或 Action。

## 风险

- 每次 Memory 和 Battery 采样都会启动一个短生命周期 macOS 原生命令；当前周期较低，但长期运行仍需观察能耗。
- Memory level 是基于 `memory_pressure -Q` free percentage 的明确分类，不等价于未公开的系统私有 pressure level。
- 默认阈值是原型值，尚未经过长期设备数据校准。
- 本次 Desktop 实际启动时 Chromium 输出过一条 Service Worker storage database 清理错误；Listener、Runtime 和 Viewer 均正常启动，该日志与两个原生命令 Adapter 无直接关联，后续 Desktop 打包阶段应单独跟踪 Electron user-data 健康状态。

## Mock Verification

确定性注入测试覆盖：

- Memory warning 输出 `memory_pressure` External Event。
- CPU 9,999ms 不触发，10,000ms 触发；恢复后再次持续 10,000ms 可再次触发。
- Battery 15% 且未充电触发；充电时不触发；恢复后可以再次触发。
- ListenerManager start、stop、destroy 生命周期和资源释放。
- `memory_pressure → CUSTOM_EVENT:MEMORY_PRESSURE → ERROR → 当前 Sasuke → danger` 完整 Runtime 闭环。

## Real Device Verification

2026-07-18 在当前 macOS 设备执行：

- `/usr/bin/memory_pressure -Q`：成功，Adapter 解析为 `normal`，free percentage 79%。
- `/usr/bin/pmset -g batt`：成功，Provider 解析为电量 80%、未充电。
- Companion Desktop 实际启动：System Listener 与 Battery Listener 初始化，当前宠物正常显示为 `READY: IDLE / idle`。
- 当前设备没有真实 Memory Pressure、持续 CPU 高负载或低电量，因此没有声称产生真实告警 External Event；告警链路由 Mock 注入验证。

## 验证结果

- `npm run typecheck`：通过。
- `npm test`：通过，43/43；原有 39 个测试继续通过，新增 V2 测试通过。
- `npm run desktop:build`：通过。
- macOS 原生命令 Adapter 实测：通过。
- Desktop 实际启动与当前宠物显示：通过。

## 结果

Companion Desktop 已具备 macOS 原生命令支持的 Memory Pressure 感知、持续高 CPU 感知和低电量感知。所有输出仍为 External Event，Event Mapping 与 Runtime 行为决策继续留在 Desktop 宿主和既有 Runtime 层，未扩展插件生态或修改核心架构。
