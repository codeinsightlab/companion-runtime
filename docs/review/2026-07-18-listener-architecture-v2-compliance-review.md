# Listener Architecture V1/V2 Compliance Review

审查日期：2026-07-18  
审查范围：当前工作区 `packages/listeners/`、Desktop Listener 接入、External Event Mapping 与进入 Runtime 后的调用链。  
审查方式：静态代码事实审查；本次未修改代码、未重构、未新增功能，也未重新执行测试。

## 1. 当前实现架构图

```text
macOS External World
├── CPU counters: node:os.cpus()
├── Memory: /usr/bin/memory_pressure -Q
└── Battery: /usr/bin/pmset -g batt
            ↓
Listener Layer
├── MacSystemListener (CPU + Memory)
└── MacBatteryListener (Battery)
            ↓ ExternalEvent
Electron Main: forwardExternalEvent()
            ↓ IPC: companion:external-event
Preload: onExternalEvent()
            ↓
Desktop Renderer: ExternalEventMapper.map()
            ↓ RawEventInput
EventNormalizer.normalize()
            ↓ CompanionEvent
CompanionRuntime.publish()
            ↓ EventBus
PetBehaviorEngine.handleEvent()
            ↓ BehaviorResolver → Behavior Slot
PetManager / ActionResolver
            ↓ Current Character Action
PetViewer → Asset
```

整体业务链路与目标 `External World → Listener → External Event → Mapping → Companion Event → Runtime → Current Character → Action / Asset` 一致。

## 2. Listener Layer 实现现状

### 2.1 公共抽象

`packages/listeners/core/Listener.ts` 定义：

- `id`
- `start(): Promise<void>`
- `stop(): Promise<void>`
- `destroy(): Promise<void>`
- `onEvent(handler)`

handler 只接收 `ExternalEvent`。`SystemListener` 只是对 `Listener` 的语义化扩展，没有加入 Runtime 或 Pet 能力。

### 2.2 MacSystemListener

文件：`packages/listeners/system/macos/MacSystemListener.ts`

职责：

- 通过 `MacSystemMetricsProvider.sample()` 获取 CPU 使用率。
- 通过注入的 `MemoryPressureAdapter.sample()` 获取 Memory pressure sample。
- 管理 CPU 持续时间、重复触发抑制与 Memory level 边沿。
- 输出 `cpu_high` 或 `memory_pressure` External Event。

输入：CPU counters、Memory Adapter sample、阈值、采样周期和时钟。  
输出：`source: "system"` 的 External Event。  
生命周期：`start()` 首次采样并创建 interval；`stop()` 清除 interval 和触发状态；`destroy()` 调用 stop、销毁 Memory Adapter、清空 handlers，并禁止重新启动。

### 2.3 MacBatteryListener

文件：`packages/listeners/system/macos/MacBatteryListener.ts`

职责：

- 通过 `MacBatteryStatusProvider.sample()` 读取电量和充电状态。
- 判断 `level < 20 && !charging`。
- 抑制低电量期间的重复事件，恢复或充电后重新布防。
- 输出 `battery_low` External Event。

输入：`pmset` 输出或注入的 Battery provider。  
输出：`source: "system"`、`name: "battery_low"` 的 External Event。  
生命周期：与 MacSystemListener 相同，具有 start、stop、destroy。

### 2.4 ListenerManager

文件：`packages/listeners/core/ListenerManager.ts`

- 使用 `Map<string, Listener>` 按 id 注册，拒绝重复 id。
- 运行期间禁止继续 register。
- `startAll()` 顺序启动；失败时 stop 已成功启动的 Listener。
- `stopAll()` 逆序并行 stop，并聚合错误。
- `destroyAll()` stop 后逆序 destroy，最后清空注册表。

ListenerManager 没有导入或调用 PetManager、Behavior、Action、Viewer。

## 3. 实际代码调用链

### 3.1 CPU 变化

```text
node:os.cpus()
→ MacSystemMetricsProvider.sample()
→ MacSystemListener.sampleNow()
→ #processCpu(usage)
→ usage >= 90 持续 >= 10,000ms
→ #emit("cpu_high", payload)
→ createExternalEvent()
→ Electron Main forwardExternalEvent()
→ webContents.send("companion:external-event")
→ Preload onExternalEvent()
→ Desktop ExternalEventMapper.map()
→ { event: "CUSTOM_EVENT", name: "CPU_HIGH" }
→ EventNormalizer.normalize()
→ CompanionRuntime.publish()
→ EventBus.publish()
→ PetBehaviorEngine.handleEvent()
→ BehaviorResolver: CUSTOM_EVENT:CPU_HIGH → EXECUTING
→ PetManager.changeBehavior(EXECUTING)
→ ActionResolver.resolve(currentCharacter, EXECUTING)
→ PetViewer.display(action)
```

CPU 第一次采样只建立 counters 基线。达到阈值时记录 `#cpuHighSince`；达到持续时间且 `#cpuEventEmitted` 为 false 才发布。低于阈值时清除 highSince 和 emitted 状态，因此之后可以重新触发。

### 3.2 Memory Pressure

```text
/usr/bin/memory_pressure -Q
→ MacMemoryPressureAdapter.sample()
→ regex 解析 System-wide memory free percentage
→ 项目阈值分类 normal / warning / critical
→ MacSystemListener.sampleNow()
→ 非 normal 且 level 发生变化
→ ExternalEvent name = memory_pressure
→ Desktop Mapping: CUSTOM_EVENT / MEMORY_PRESSURE
→ BehaviorResolver: ERROR
→ 当前 Character 的 ERROR Action
→ Viewer / Asset
```

Memory 数据来自 macOS 原生命令，但 `warning / critical` 是项目根据 free percentage 进行的分类，不是 macOS API 直接返回的 pressure level。因此它比普通 used-memory percentage 更贴近系统工具事实，但不能表述为完整的原生 memory pressure 状态。

### 3.3 Battery

```text
/usr/bin/pmset -g batt
→ MacBatteryStatusProvider.sample()
→ regex 解析 level，文本判断 charging
→ MacBatteryListener.sampleNow()
→ level < 20 且 charging = false
→ ExternalEvent name = battery_low
→ Desktop Mapping: CUSTOM_EVENT / BATTERY_LOW
→ BehaviorResolver: ERROR
→ 当前 Character 的 ERROR Action
→ Viewer / Asset
```

当前角色始终由 User Profile / PetManager 持有；Battery Listener 没有读取或切换角色。

## 4. ExternalEvent 设计审查

`ExternalEvent` 字段只有：

- `id`
- `source`
- `name`
- `timestamp`
- `payload`

`createExternalEvent()` 校验 source、name，补齐 id、timestamp，并冻结返回对象和第一层 payload。

当前生产 Listener 的输出事实：

- CPU：usage、threshold、durationMs、platform。
- Memory：level、freePercentage、platform。
- Battery：level、charging、threshold、platform。

未发现 Listener 输出 `TASK_ERROR`、Behavior Slot、Character、Action、Asset 或 Viewer 指令。未发现 Listener 依赖 PetManager、PetViewer、ActionResolver、Character 或 BehaviorEngine。

结论：ExternalEvent 边界符合预期。风险是冻结为浅冻结，payload 中未来若出现嵌套对象，嵌套值仍可变；当前三个 Listener payload 均为 primitive，不构成当前故障。

## 5. Event Mapping 边界

映射类定义在 `packages/listeners/core/ExternalEventMapper.ts`，根据 `source:name` 生成 Core `RawEventInput`。它不被任何 Listener 调用。

实际所有权：

- Listener：不拥有 Mapping，只发布 External Event。
- Desktop Host：在 `apps/desktop/src/runtime.ts` 创建 Mapping 配置、调用 `map()`、调用 `EventNormalizer.normalize()`，然后调用 `runtime.publish()`。
- Runtime Core：只定义 RawEventInput、CompanionEvent、Normalizer 和后续 Behavior 处理，不知道 macOS Listener。

逻辑边界符合目标。轻微物理边界偏差是 `ExternalEventMapper` 位于 `packages/listeners/core`，且 type-import Core 的 `RawEventInput`；它实际是 Listener 与 Core 之间的 Adapter/Host integration concern。当前只是单向类型依赖，没有造成 Listener 实现依赖 Runtime，但目录命名可能使职责归属不够直观。

## 6. 生命周期与可靠性审查

### 符合项

- start 对已有 timer 幂等返回，不重复注册 interval。
- stop 清理 timer 并重置 trigger state。
- destroy 幂等，清理 handler Set，并销毁注入的 Adapter/Provider。
- 同一个 handler function 放入 Set 不会重复保存。
- Preload 返回 unsubscribe，并在 Renderer `beforeunload` 时移除 IPC listener。
- ListenerManager 拒绝重复 id 和运行中注册。

### 不符合项

1. **在途子进程没有被跟踪或取消。** `runMacCommand()` 调用 `execFile()` 后只返回 Promise，没有保留 ChildProcess handle。stop/destroy 只能清 timer，无法终止已经运行的 `memory_pressure` 或 `pmset` process。这不满足 V2 “destroy 释放 process/native handle”的严格要求。

2. **异步采样可能重叠。** interval 每次直接调用异步 `sampleNow()`，没有 in-flight guard。如果原生命令执行时间超过 interval，可能同时存在多个子进程，返回顺序也可能使 Memory/Battery edge state 乱序。

3. **停止后的在途回调缺少 generation/running guard。** stop 清 timer 后，已经开始的 sample 仍可能完成并继续更新状态或发布 External Event。destroy 清 handlers 可以降低最终发布概率，但 stop 本身承诺可重启，旧 sample 与新周期可能交叉。

4. **Desktop 没有等待异步 destroy 完成再退出。** `before-quit` 中调用 `destroyAll().catch(...)`，但没有阻止退出并等待 Promise；Electron 可能在销毁链完成前结束进程。

5. **ListenerManager 的清理异常路径不完整。** `destroyAll()` 先 await `stopAll()`；若任一 stop 失败并抛出 AggregateError，后续 destroy 和 clear 不会执行。`startAll()` 失败时只 stop 已启动项，也不 destroy 失败项或可能已分配资源的当前项。

因此，接口层声明了完整生命周期，但进程级资源释放的实现保证尚不完整。

## 7. Runtime 解耦审查

生产 Listener 目录仅依赖：

- Listener / ExternalEvent contract
- `node:os`
- `node:child_process`
- macOS Adapter/Provider

没有依赖：

- PetManager
- PetViewer
- ActionResolver
- Character
- BehaviorEngine
- User Profile

Pet 的实际变化发生在 Runtime 内部：PetBehaviorEngine 根据 Desktop 注入的 Mapping 得到 Behavior Slot，再由 PetManager 使用当前 Character 和 ActionResolver 选择动作。Listener 没有参与这些决策。

新增 Codex、Git 或 VS Code Listener 不需要修改 Runtime Core；需要新增 Listener 实现，并由宿主注册、配置 External→Internal Mapping 和相应 Custom Event Behavior Rule。当前 `ListenerManager` 运行期间不支持热注册，因此这属于静态宿主装配扩展能力，不是运行时插件系统。

## 8. macOS 实现质量

### CPU

- 数据来源与差值计算合理。
- 持续时间和恢复重置符合需求。
- `#cpuEventEmitted` 防止持续高负载重复触发。
- 连续性是按采样点近似，不是操作系统连续监控；采样间隔内的波动不可见。

### Memory

- 使用 macOS `memory_pressure -Q`，比 used-memory ratio 更接近平台事实。
- regex 针对当前英文输出格式；系统工具输出格式变化或本地化可能导致解析失败。
- warning/critical 是项目阈值，不是系统直接返回的 pressure level。
- 只输出进入/切换压力等级，不输出 recovery External Event。

### Battery

- 使用 macOS `pmset -g batt`。
- 条件为低于阈值且未充电，edge state 防重复触发。
- 没有电量百分比时返回 null。
- charging 依赖英文文本片段，输出格式变化存在解析风险。
- stop/destroy 的在途 process 问题与 Memory 相同。

## 9. Architecture Score

| 项目 | 状态 |
|-|-|
| Listener 抽象 | PASS |
| ExternalEvent 边界 | PASS |
| Mapping 边界 | PASS |
| Runtime 解耦 | PASS |
| macOS 实现 | FAIL |
| 跨平台扩展能力 | PASS |

`macOS 实现` 标记 FAIL 的原因不是业务分层错误，而是 V2 明确要求的 process/native handle 释放、停止后不再回调尚无可靠保证。Memory pressure 等级也仍是原生命令 free percentage 的项目级解释。

## 10. PASS 项

- Listener 只感知和发布 External Event。
- ExternalEvent 与 CompanionEvent 是独立模型。
- Event Mapping 在 Listener 之后执行。
- Desktop Host 负责注册、IPC、Mapping 和 Runtime publish。
- Runtime Core 未出现 macOS、CPU、Memory 或 Battery 判断。
- 当前 Character 仍来自 User Profile。
- Action 仍由 Behavior Slot、当前 Character、Character Manifest 和 ActionResolver 决定。
- ListenerManager 提供统一静态生命周期和唯一 id 注册。
- CPU 持续判断、恢复重置以及 Battery edge trigger 的业务行为与需求一致。
- 新平台 Listener 不需要修改 Runtime Core。

## 11. FAIL 项

- destroy 不能取消在途 `execFile` process。
- 异步采样可能重叠。
- stop 后在途 sample 仍可能更新状态或发出事件。
- Desktop 退出没有等待 destroyAll 完成。
- Manager 清理失败路径不能保证继续执行 destroy。

以上 FAIL 均集中在 Listener 可靠性与生命周期，不是 Event→Behavior→Action 分层倒退。

## 12. 风险项

1. 长期运行时，慢命令或系统异常可能产生重叠 process、乱序回调和停止后的迟到事件。
2. `memory_pressure`、`pmset` 文本解析依赖当前输出格式。
3. Memory pressure level 可能被上层误解为操作系统原生等级；代码和文档必须继续保留其项目级分类语义。
4. `onEvent()` 没有单 Listener unsubscribe；当前通过 Set 与 destroy 管理，未来动态宿主或插件卸载时会受限。
5. ListenerManager 禁止运行中 register，支持新增 Listener，但不支持热插拔；这符合当前“非插件生态”范围。
6. ExternalEventMapper 的物理目录和 Core type dependency 略微模糊 Mapping 的独立层归属。
7. 当前三个 Desktop Mapping 和 Behavior Rules 在宿主源码中静态声明。它保持解耦，但每新增外部事件都要修改宿主装配。

没有发现明显过度设计。Metric Provider、Command Runner、Memory Adapter 和 Battery Provider 的注入点都直接服务于平台 I/O 隔离与确定性测试；ListenerManager 也保持轻量。唯一需要防止的是未来把当前静态装配过早扩展成插件市场或热加载框架。

## 13. 与目标架构差异

业务职责上没有关键差异：实际数据确实按目标链路流动。

实现层差异主要有三点：

1. Mapping 实现物理上位于 `packages/listeners/core`，而实际由 Desktop Host 所有和调用。
2. Memory “原生压力”通过系统命令 free percentage 再分类，而不是订阅系统原生 pressure observer。
3. 生命周期接口比底层 process 控制能力更强：API 声明 destroy，但无法取消在途原生命令。

## 14. 是否建议继续开发

建议继续开发，但下一阶段不应直接扩大到 Codex/Git/VS Code Listener 或插件生态。

理由：核心架构方向正确，Runtime 解耦已经成立；当前需要先把 Listener lifecycle 的实现保证补齐，使 stop/destroy 对 timer、在途 process、迟到回调和异常清理真正闭环。该调整属于 Listener 基础设施可靠性，不需要修改 Runtime、Behavior、Character 或 Profile。

最终结论：

```text
LISTENER_ARCHITECTURE_STATUS:
NEEDS_ADJUSTMENT
```

说明：业务架构 PASS，生命周期可靠性 NEEDS_ADJUSTMENT。
