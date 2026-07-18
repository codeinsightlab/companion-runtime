# Companion Runtime Architecture Compliance Review

## 审查范围与结论

审查日期：2026-07-18。

本报告审查当前工作区实现，包括尚未提交的 Profile Management V1；不是仅审查 `v0.5.0` Tag。审查为静态代码与配置事实核对，没有修改 Runtime、测试、Demo 或 Character Pack。

总体结论：主运行链路已经实现 `Event → Behavior Slot → Action → Asset`，Event、Collector、Behavior 和 Action 的职责边界基本正确；但 Character Pack 尚未达到“只增加新目录即可被发现”的独立性，而且 Event Contract 仍允许绕过 `CUSTOM_EVENT` 引入任意业务 Event type。因此不能判定为完全合规。

```text
ARCHITECTURE_STATUS:

NEEDS_ADJUSTMENT
```

## 1. 当前架构图

当前已实现的核心链路：

```text
External Source
  ↓
EventCollector
  ↓ onEvent
EventBus
  ↓ subscribe
CompanionEvent
  ↓
BehaviorResolver
  ↓
Behavior Slot / PetStateMachine
  ↓
ActionResolver
  ├─ User Profile override
  ├─ Character Manifest default
  └─ Runtime default
  ↓
PetCharacter / PetAction
  ↓
Character Asset
  ↓
PetViewer
```

Profile 链路：

```text
ProfileStore
  ↓
ProfileManager
  ↓
ProfileValidator
  ↓
UserProfileResolver
  ↓
PetManager / ActionResolver
```

需要注意：Collector、EventBus、Adapter、Behavior Engine 的完整装配当前只在 integration test 中显式建立；Browser Demo 分别直接调用 Event Adapter 和 Behavior Engine，并不是完整生产组合入口。

## 2. 设计目标

审查采用以下目标作为判定基线：

1. Event 与外部平台解耦，只描述外部事实。
2. Event 无生命周期状态，不携带 Character、Action 或 Asset 决策。
3. Runtime 不判断 Codex、VS Code、macOS 等事件来源。
4. Behavior Resolver 只执行 `Event → Behavior Slot`。
5. Action 由 User Profile、Character Manifest 和 Runtime Default 决定。
6. Character Pack 自描述且可独立扩展。
7. 外部程序通过 Collector / Adapter 进入 Runtime，不跨层调用 Viewer。
8. 状态只存在于职责所属层：Behavior 生命周期状态属于 Runtime，动画切换状态属于 Viewer，不能写回 Event。

## 3. 实现现状

### 3.1 Event Contract

`CompanionEvent` 只包含 `id`、`type`、可选 `name`、`source`、`payload` 和 `timestamp`，没有 Character、Action、Asset 或 PNG 字段。字段使用 `readonly`，EventNormalizer 返回冻结对象。

核心 Event 列表为 `TASK_START`、`TASK_RUNNING`、`TASK_SUCCESS`、`TASK_ERROR`、`IDLE`、`CUSTOM_EVENT`。但是 `EventType` 同时允许任意字符串，EventNormalizer 也会原样接受未知标准化名称。这意味着调用方仍可发送 `CODE_REVIEW` 等业务 type，而不使用 `CUSTOM_EVENT + name`。

### 3.2 Event Infrastructure

- EventBus 只维护 Handler 集合并提供 publish、subscribe、unsubscribe。
- EventCollector 接口只定义 start、stop、onEvent。
- MockEventCollector 只规范化并分发输入，没有导入或调用 PetManager、PetViewer、Behavior Engine。
- EventNormalizer 只处理 type、source、id、payload 和 timestamp。

Integration test 展示了 `Collector → EventBus → Adapter / Behavior Engine` 的可行装配。当前没有正式 Composition Root 自动建立该链路。

### 3.3 Behavior Layer

BehaviorResolver 从 Event type 或 `CUSTOM_EVENT:name` 查询 Behavior Slot。标准配置为：

```text
TASK_START   → THINKING
TASK_RUNNING → EXECUTING
TASK_SUCCESS → SUCCESS
TASK_ERROR   → ERROR
IDLE         → IDLE
```

该层没有引用 Character、Action 或 Asset。Behavior Engine 持有 priority、cooldown、duration、recovery 和 idle 调度状态，这是 Runtime 行为生命周期，不是 Event 状态。

### 3.4 Action Resolution

ActionResolver 的实际优先级正确：

```text
User Profile override
  ↓
Character behaviorMapping
  ↓
Runtime default mapping
```

解析完成后通过当前 PetCharacter 获取 Action。ActionResolver 和 Runtime TypeScript 源码没有硬编码 Naruto、Sasuke、Itachi 或具体 PNG 文件名。

### 3.5 Character Pack

每个角色目录包含 `character.json` 和 PNG，Manifest 自描述 `id`、`name`、`version`、`actions`、`behaviorMapping` 和 `assets`。具体的 sharingan、rasengan、susanoo 等资源名只存在于 Character Pack。

但 Character Catalog 仍位于 `packages/core/config/pet-manifest.json`，其中固定了 `naruto-pack`、Sasuke、Naruto 和 Itachi；`packages/core/config/personality-profiles.json` 也固定登记了三个角色。PetManager 根据该 Catalog 批量加载角色。因此仅增加 `characters/new-pack` 不会让 Runtime 自动发现新角色，仍需修改或替换 Catalog 配置。

### 3.6 User Profile

User Profile 正确负责 `characterId` 和 Behavior Slot 覆盖。ProfileValidator 会检查 Character、Behavior Slot 和 Action 能力；ProfileManager 切换 Character 后保存配置并通知 PetManager 重建 ActionResolver。

Profile 层没有把 Asset 路径写入用户配置，职责边界正确。

### 3.7 State / Status

当前存在三类状态：

- Behavior 状态：PetStateMachine 的当前 Behavior Slot，以及 Behavior Engine 的 priority、cooldown、recovery、idle 生命周期。
- Character 状态：当前选中的 PetCharacter 和 User Profile 的 characterId；角色 Manifest 本身只描述能力，不包含事件状态机。
- Viewer 动画状态：`currentSrc`、`transitionToken` 和切换 CSS class，用于避免异步图片切换竞争。

这些状态均位于职责所属层，没有写入 CompanionEvent。Event Contract 本身没有 `status`、`state`、`character`、`action` 或 `asset` 字段。

### 3.8 UI Demo

Demo 同时提供 Character、Behavior Slot、直接 Action、Event Adapter、Behavior Engine 和 Personality 控件。这是调试展示面，因此“可以手动改变 Slot/Action”属于 UI 表达与测试入口，不表示外部生产调用必须绕过 Event。

Demo 的主要表达问题是：

- 没有展示 EventBus 和 Collector 的完整数据流。
- `Runtime state`、`Behavior state`、`Personality state` 三组文案容易让使用者误认为 Event 有多个状态。
- Event Adapter 和 Behavior Engine 使用独立按钮，容易被理解成两条竞争的生产入口。

这些属于 B：UI 表达和 Composition Demo 问题，不应通过修改 Runtime 状态模型解决。

## 4. 符合项

### PASS-1：Event 不携带表现决策

CompanionEvent 没有角色、Action、Asset 或 PNG 信息。禁止示例中的 `character:"itachi"`、`action:"danger"` 没有进入 Event Contract。

### PASS-2：Runtime 不判断事件来源

EventSource 可以记录 app、platform、collector，但 PetEventAdapter、BehaviorResolver 和 Behavior Engine 不基于这些字段分支决策。

### PASS-3：Collector 职责单一

MockEventCollector 不依赖 PetManager、Viewer 或 Behavior Engine，只负责输入规范化和事件输出。

### PASS-4：Behavior Resolver 边界清晰

BehaviorResolver 的输出只有 Behavior Slot，不输出 Character、Action 或 Asset。

### PASS-5：Action 优先级正确

User Profile 高于 Character Manifest，Character Manifest 高于 Runtime Default；无映射时明确报错，不猜测 Action。

### PASS-6：资源位于 Character Pack

具体 PNG 文件名和角色专属动作表现位于 `characters/naruto-pack/*/character.json`，不在 Runtime TypeScript 逻辑中。

### PASS-7：外部 Adapter 接入可行

PetEventAdapter 接收标准 CompanionEvent，经 BehaviorResolver 调用 PetManager 的 Behavior API。Integration test 已证明 Collector、EventBus、Adapter 和 Behavior Engine 可以组合。

## 5. 不符合项

### HIGH：Character Pack 尚未达到目录级独立发现

目标要求新增角色只增加 `characters/new-pack`，不修改 `packages/core`。当前 `packages/core/config/pet-manifest.json` 同时承担 Catalog 和 Naruto Pack 注册，新增角色需要更新该文件，启用完整 Personality 配置还需要更新核心目录下的 personality profiles。

这不表示 PetManager 类硬编码角色；问题位于 Catalog 所有权和发现机制。Character Pack 自描述已经完成，但 Pack 注册尚未从 Core 配置中移出。

### MEDIUM：Event Contract 允许任意业务 type 绕过 CUSTOM_EVENT

虽然存在固定核心 Event 和 CUSTOM_EVENT，但 `EventType` 联合任意 string，EventNormalizer 对未知 type 不拒绝。这允许业务方继续创建 `CODE_REVIEW`、`DEPLOYING` 等顶层 Event type，逐步侵蚀稳定 Contract。

### MEDIUM：缺少正式 Event Pipeline Composition Root

EventBus、Collector、Adapter 和 Behavior Engine 的单体职责正确，但完整装配仅见于测试。Demo 直接调用 Adapter 或 Behavior Engine。未来平台 Collector 若各自复制装配代码，可能产生重复订阅、Adapter 与 Behavior Engine 双重处理或错误绕层。

### LOW：Event 不可变性只被部分强制

EventNormalizer 冻结顶层 Event、source 和 payload，但 payload 的嵌套对象仍可变；EventBus 只检查输入是对象，不强制事件由 Normalizer 创建。概念模型是无状态的，但运行时边界不能完全阻止发布后修改。

## 6. 风险

### 当前最大架构风险

最大风险是 Character Pack Catalog 仍归属于 Core 配置。随着第三方 Pack、Marketplace 或用户安装目录增加，Core 会重新变成所有角色的注册中心，并把角色发布周期与 Runtime 发布周期绑定。这直接影响通用 Runtime 的核心目标，优先级高于 Demo 优化和平台 Collector 开发。

### 次级风险

1. 开放字符串 Event type 会使业务语义逐步进入核心 Event 命名空间。
2. 缺少统一 Composition Root 会让真实 Collector 接入时出现多套不一致管线。
3. Personality 配置仍按具体角色集中在 Core config，第三方 Pack 的人格自描述边界不完整。
4. EventBus 没有 Contract validation 或不可变性边界，错误事件只能在下游才失败。

## 7. Review Questions

### Q1：当前架构是否符合 Event → Behavior → Action → Asset？

结论：**PASS**。

主执行链路和各 Resolver 的输入输出符合目标。Character Catalog 独立性问题不改变该链路本身，但影响整体架构最终合规状态。

### Q2：Event 是否保持无状态？

结论：**PASS**。

Event 是事实快照，没有生命周期状态或表现决策。需要后续加固运行时不可变性，但当前没有发现 Event 状态化设计。

### Q3：外部程序是否可以通过 Adapter 接入？

结论：**PASS**。

接口与测试链路已经支持；正式平台接入前建议补统一 Composition Root，避免每个宿主自行拼装。

### Q4：新增角色是否需要修改 Runtime？

结论：**FAIL**。

不需要修改 Runtime TypeScript 类，但若要被现有默认 Runtime Catalog 发现，仍需修改或替换 `packages/core/config/pet-manifest.json`；完整人格支持还涉及核心 personality config。因此未达到“只新增 Character Pack 目录”的目标。

### Q5：当前最大架构风险是什么？

Character Pack 注册和 Personality Catalog 仍集中在 Core 配置，可能让 Core 随角色生态增长而重新耦合具体角色。

### Q6：下一阶段应该做什么？

选择：**修复架构**。

在开始 Collector 或 Desktop App 前，先完成最小范围的 Character Pack Catalog 所有权调整和稳定 Event Contract 收口。Demo 优化可以随后进行，不应优先于架构边界修复。

## 8. 建议

### 优先级 1：移出 Core 的具体角色 Catalog

定义宿主提供的 Character Catalog / Pack Registry 契约，让 PetManager 接收 Catalog 或 Manifest Loader。示例 Naruto Catalog 应归 `characters/naruto-pack` 或 `examples`，Core 只保留接口和通用默认 Behavior Mapping。

验收标准：添加一个新 Pack 目录并通过外部 Catalog 注册时，不修改 `packages/core`；若目标坚持自动发现，则由宿主/桌面端负责目录扫描，Runtime 不直接依赖文件系统。

### 优先级 2：收紧 Event Contract

核心 Event type 应只接受固定集合和 CUSTOM_EVENT；业务名称放入 `name`。如果需要开放扩展字符串，应建立独立的 namespaced extension 类型并明确其兼容规则，而不是让任意字符串等同核心 Event。

### 优先级 3：增加统一 Composition Root

提供轻量的 Pipeline 组装模块，负责 `Collector → EventBus → Adapter / Behavior Engine` 的订阅与释放，但不要把具体平台 Collector 放入 Core。

### 优先级 4：调整示例表达

在不修改 Runtime 的前提下，让 Demo 明确区分：生产 Event Pipeline、调试用直接 Slot/Action 控件、Viewer 状态。补一条可视化的 Collector → Bus → Adapter 链路即可，不需要重构 Runtime。

## 9. 最终判定

当前实现已经具备通用 Companion Runtime 的主要骨架，核心行为链路合规，且不存在 Event 直接绑定角色资源的倒退。但 Character Pack 发现/注册与 Event Contract 扩展边界仍未满足原始目标。

```text
ARCHITECTURE_STATUS:

NEEDS_ADJUSTMENT
```
