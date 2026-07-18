# Composition Root 与 Runtime Bootstrap V1

## 背景

在本阶段之前，Browser Demo 和 integration test 分别创建 EventBus、Resolver、PetManager、Behavior Engine 与 Profile 组件。模块本身已经解耦，但初始化代码分散，未来 Browser、Desktop、Collector 宿主容易形成不同的依赖图、重复订阅或遗漏生命周期管理。

本阶段建立唯一官方 Runtime 创建入口 `createCompanionRuntime(config)`。Composition Root 只负责创建对象、注入已解析配置和组装依赖，不读取 JSON、文件系统或环境变量，也不包含 Event、Behavior、Action、UI 或平台监听逻辑。

## 架构变化

之前：

```text
Demo / Test / Future Host
  → new EventBus
  → new Resolver
  → new ProfileManager
  → new PetManager
  → new BehaviorEngine
```

之后：

```text
Application Entry
  → load external configuration
  → createCompanionRuntime(config)
  → CompanionRuntimeContext
  → runtime.start() / runtime.publish() / runtime.stop()
```

Runtime Event 管线由 `CompanionRuntime` facade 统一组装：

```text
runtime.publish(CompanionEvent)
  → EventBus
  → PetBehaviorEngine
  → BehaviorResolver
  → Behavior Slot
  → PetManager / ActionResolver
  → Character Action
  → Viewer
```

## 新增模块

### createCompanionRuntime

异步 Factory 接收：

- Profile id 与 ProfileStore
- CharacterRegistry
- Asset Base URL
- Event Mapping
- Behavior Mapping
- Behavior Rules
- 可选 Runtime Config
- 可选 Personality Profiles 与随机函数
- 可选 Behavior Scheduler 和 Viewer Container

所有配置均由上层注入。Factory 不调用 fetch，不解析路径，不读取环境变量。

### CompanionRuntimeContext

Context 明确暴露同一依赖图中的：

- EventBus
- EventNormalizer
- ProfileManager
- UserProfileResolver
- BehaviorResolver
- PetBehaviorEngine
- ActionResolver
- CharacterRegistry
- PetManager
- CompanionRuntime facade

Context 使用具体 TypeScript 类型，不使用 `any`。

### CompanionRuntime

提供 Runtime 生命周期与统一 Event 入口：

- `start()`：订阅 EventBus 并启动 Behavior Engine。
- `publish(event)`：把标准 CompanionEvent 发布到唯一 EventBus。
- `stop()`：取消订阅并停止 Behavior Engine。

重复 start 不会重复订阅；stop 后可以再次 start。

### CharacterRegistry

本阶段只定义同步读取接口：

```ts
interface CharacterRegistry {
  getCharacter(id: string): CharacterManifest | undefined;
  listCharacters(): CharacterManifest[];
}
```

Registry 的目录扫描、Marketplace、Remote API 或缓存实现属于宿主层，不进入 Core。Composition Root 只消费该接口。

## 职责边界

### Composition Root 负责

- 创建 EventBus、EventNormalizer、ProfileManager、UserProfileResolver、BehaviorResolver、ActionResolver、PetManager 和 Behavior Engine。
- 确保 Context 暴露的实例就是各模块实际引用的实例。
- 建立 EventBus 到 Behavior Engine 的唯一 Runtime 订阅。
- 等待 PetManager 初始 Viewer render 完成后返回 Context。

### Composition Root 不负责

- JSON、文件系统或环境变量读取。
- Event 规范化规则、Behavior 决策、Action 优先级或资源解析逻辑。
- Collector、Desktop、Marketplace 或 UI。
- Character Registry 的发现和持久化实现。

### Application Entry 负责

Browser Demo 作为上层应用读取 JSON，建立符合接口的 CharacterRegistry 与 JsonProfileStore，然后只调用 `createCompanionRuntime()` 创建完整 Runtime。生产 Event 按钮改为 `runtime.publish()`，不再自行构造 EventBus、Resolver、Manager 或 Behavior Engine。

单模块 unit test 仍直接构造被测类，以验证 EventBus、Resolver 等模块自身行为；完整 Runtime 与 integration test 统一通过 Factory 创建。

## 风险

- CharacterRegistry 当前只有接口，宿主必须提供实现；这符合本阶段边界，但下一阶段需要一个非 Core 的示例 Registry 实现。
- PetEventAdapter 和部分模块仍保留低层 Factory/API，供独立模块使用；它们不再是官方完整 Runtime 启动入口。
- CompanionRuntime 只消费已标准化 CompanionEvent；外部 Raw Event 应由 Collector/Adapter 使用 Context 中的 EventNormalizer 后再发布。
- Browser Demo 仍有调试用直接 Behavior Engine 控件，它不代表生产 Event 入口。

## 验证

- `npm run typecheck`：通过。
- `npm test`：35/35 通过。
- Composition Root test：完整 Context 创建成功。
- Dependency test：Behavior Engine、PetManager、ProfileManager、BehaviorResolver、ActionResolver 与 EventBus 使用同一 Context 实例。
- Integration test：`TASK_SUCCESS → SUCCESS → celebrate → current character` 通过。
- Browser Demo：Factory 创建默认 Sasuke Runtime；Event 按钮通过 `runtime.publish()` 进入 `SUCCESS/celebrate`；图片正常显示，浏览器无 error 日志。
- `git diff --check`：通过。

Demo 验证时本机 4173 端口已有 Python 静态服务；未终止该现有进程。最新 build 已完成，并复用该服务读取当前 `dist`。

## 结果

Companion Runtime 已拥有唯一官方完整启动入口。Browser、Desktop、Collector 宿主和 integration test 可以通过 `createCompanionRuntime()` 获得一致的 Runtime Context，而不再复制核心模块装配代码。
