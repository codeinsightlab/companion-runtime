# Companion V1 Release Readiness Review

审查日期：2026-07-31

审查范围：

- `packages/core`
- `packages/listeners`
- `apps/desktop`
- `characters`
- `examples`
- `docs`
- `AGENTS.md`
- 根目录及 Desktop README

审查性质：V1 Freeze 前只读审查。除本报告外，未修改代码、配置、UI 或资源。

## 1. 当前版本概述

当前仓库已经形成一条完整、可测试的桌面伙伴链路：

```text
macOS System
  → Listener
  → ExternalEvent
  → Desktop ExternalEventMapper
  → CompanionEvent
  → EventBus
  → BehaviorResolver / PetBehaviorEngine
  → BehaviorSlot
  → ActionResolver
  → Character Manifest / Asset
  → PetViewer
```

Desktop 具备单实例、应用身份、Application Menu、Tray、Pet Window、Settings Window、偏好持久化及统一退出编排。自动化回归覆盖 Runtime、Profile、Character、Event、Listener、Desktop 生命周期和控制面，共 68 项测试。

当前 Git 工作区在审查开始时干净。根包版本为 `1.0.0`，Desktop 子包版本仍为 `0.1.0`；当前最新架构 Tag 是 `v0.5.0`，尚不存在 V1 Freeze Tag。当前本地 `main` 比 `origin/main` 多一个提交，近期提交信息多为 `s`，可追溯性不足。

## 2. 产品定位审查

### 2.1 已符合项

- Pet Window 是透明、无边框、置顶的宠物展示，而不是指标 Dashboard。
- Settings 将当前伙伴、感知能力、外观、角色和控制作为主要信息层级。
- CPU、Memory、Battery 等原始技术状态没有成为生产模式主视觉。
- Git、VS Code、Codex 等未实现能力明确显示为未连接或即将支持，没有制造假数据。
- Developer Mode 默认隐藏；生产模式不展示 Event、Runtime、Listener 原始调试信息。
- Tray 提供显示宠物、隐藏宠物、打开设置和退出的稳定入口。

### 2.2 不足

- 根 `README.md` 仍描述早期 Browser Runtime、旧状态和旧扩展方式，与当前 Desktop 产品不一致。新用户从仓库首页无法准确理解当前产品、启动入口和退出方式。
- `docs/architecture.md`、`docs/extension-guide.md`、`docs/v1-freeze.md` 仍保留早期架构语义，不能作为 V1 的权威契约。
- 当前没有安装包或可分发的 `.app`。首次使用仍要求 Node/npm/Electron 开发环境，因此只适合作为源码基线或开发预览，不是普通 macOS 用户可安装的 V1 产品。
- 没有首次启动引导。拖动、点击反馈、点击穿透、Settings 与退出入口主要依靠用户自行发现。

### 2.3 产品结论

产品视觉方向已经从 Demo/监控面板转向“桌面伙伴”，Settings、Pet Window、Tray 的表达基本统一。当前主要 Demo 感来自启动和交付方式、文档入口及首次使用说明，而不是 Settings 视觉本身。

状态：`NEEDS_ADJUSTMENT`

## 3. 架构审查

### 3.1 Event

`CompanionEvent` 只包含事件标识、类型、可选名称、来源、Payload 和时间戳，不包含 Character、Action、Asset 或 Runtime 状态。Event 本身没有生命周期状态，是外部事实的值对象。

`EventType` 同时允许已知核心类型和任意字符串。该设计具有扩展性，但与“核心类型固定、业务扩展统一走 `CUSTOM_EVENT + name`”的历史设计目标存在契约歧义。`EventNormalizer` 也会保留未知顶层类型。冻结前必须明确哪一种是 V1 公共契约，否则 Adapter 可能形成两种不兼容扩展方式。

### 3.2 Listener

- `BaseListener` 统一处理 CREATED、STARTED、STOPPED、DESTROYED 状态。
- 重复 start/stop 安全，destroy 后不能再次启动。
- generation token 和独占采样避免 stop 后迟到事件与异步采样重入。
- macOS 原生命令保留可取消句柄，stop/destroy 会释放进程和 Timer。
- `ListenerManager` 通过独立结算隔离单个 Listener 的 start/stop/destroy 失败。
- Listener 生产代码不依赖 `PetManager`、`PetViewer`、`ActionResolver`、Character 或 `BehaviorEngine`。

新增 Git、VS Code 或 Codex Listener 只需实现 Listener 契约并在宿主注册，不需要修改 Runtime。当前注册为静态启动期注册，不支持热插拔插件；这符合本轮冻结范围。

### 3.3 Mapping

`ExternalEventMapper` 位于 Listener 包的公共边界中，但由 Desktop Renderer 宿主调用。Listener 只产生 `ExternalEvent`，不会决定 `CompanionEvent`、Behavior 或 Action。

实际链路为：

```text
MacSystemListener / MacBatteryListener
  → emit ExternalEvent
  → Desktop Runtime ExternalEventMapper.map()
  → EventNormalizer.normalize()
  → runtime.publish()
```

Mapping 没有写入具体 Listener，也没有隐藏在 Runtime Core 中，边界符合目标。

### 3.4 Runtime

- `createCompanionRuntime()` 是官方 Composition Root。
- `CompanionRuntime` 统一管理 EventBus 订阅和 Behavior Engine 生命周期。
- BehaviorResolver 只完成 Event → BehaviorSlot。
- ActionResolver 按 User Profile、Character 默认映射、Runtime 默认映射解析 Action。
- PetManager 管理当前 Character、StateMachine 与 Viewer。
- Desktop 外部系统事件必须通过 Runtime publish 链路；没有由 Listener 直接操作 Pet 的路径。

Desktop 的显示/隐藏、拖动和窗口尺寸属于宿主窗口控制，不是 Behavior 绕过。Settings 的角色和尺寸修改属于显式用户配置命令，通过受限 IPC 进入 Pet Renderer；它们不伪装成外部 Event。

### 3.5 Character

Runtime TypeScript 代码未硬编码 Naruto、Sasuke、Itachi 或 PNG 文件名。Character Manifest 自描述 Actions、Behavior Mapping 和 Assets。新增 Character 可通过新的 Character Pack 和注入 Registry/Catalog 完成，不需要修改 Runtime 算法。

但默认 `pet-manifest.json` 和 `personality-profiles.json` 仍位于 `packages/core/config`，内容包含当前 Naruto Pack Catalog。代码边界已解耦，默认数据的物理归属仍不完全中立。这不是当前运行链路的错误，但应在冻结契约中明确它是示例默认配置还是 Core 内建配置。

### 3.6 架构结论

核心数据流、职责分层和依赖方向符合：

```text
External Source → Listener → ExternalEvent → Mapping
→ CompanionEvent → Behavior → Action → Character Asset → Viewer
```

架构状态：`PASS`

冻结保留项：

1. 明确未知 Event 是合法顶层 type，还是必须统一使用 `CUSTOM_EVENT`。
2. 明确默认 Character Catalog 的归属和扩展契约。

## 4. Desktop 审查

### 4.1 启动链路

```text
npm run desktop:start
  → Electron Main
  → requestSingleInstanceLock()
  → macOS Application Identity / Menu
  → DesktopLifecycleManager.start()
  → app ready
  → TrayManager.create()
  → WindowManager.createPetWindow()
  → Pet Renderer createCompanionRuntime()
  → Runtime ready IPC
  → ListenerManager.startAll()
```

第二实例在创建窗口、Runtime 和 Listener 之前退出；已有实例收到 `second-instance` 后恢复并聚焦 Pet Window。

### 4.2 退出链路

Application Menu 和 Tray Quit 都进入 `DesktopLifecycleManager.requestQuit()`：

```text
requestQuit
  → Tray destroy
  → ListenerManager.destroyAll()
  → flush Pet position
  → Runtime stop IPC / acknowledgement
  → Window destroy
  → IPC and app event cleanup
  → app.quit()
```

各阶段使用失败隔离，单个 Listener 或 Runtime stop 失败不会阻止其余资源释放。窗口普通 close/Cmd+W 转为 hide，应用继续运行。

### 4.3 重复与泄漏风险

自动测试证明：

- 单实例锁阻止第二套 Desktop 初始化。
- WindowManager 复用唯一 Pet 和 Settings Window。
- Runtime 在 Pet Renderer 中创建一次。
- ListenerManager 在 Desktop Composition Root 中创建一次。
- Timer、ChildProcess 和 Listener Handler 有明确释放路径。

仍存在的长期运行风险：

- 未发现 Pet Renderer `render-process-gone` 后的 Runtime 重建或应用降级策略。Renderer 崩溃后，Main 和 Listener 可能继续存在，但 Runtime 链路不可用。
- Desktop Preferences 的原子写使用固定临时文件名，但未见写队列。位置持久化与 Settings 更新并发时可能产生覆盖、rename 冲突或最后写入丢失。

Desktop 架构状态：`PASS_WITH_RISKS`

## 5. UI 审查

### 5.1 Settings

Settings 已采用深色玻璃卡片、紫蓝 Accent、伙伴预览、能力状态、大小卡片、角色卡和控制入口。生产模式隐藏 Developer Mode，未实现能力不伪造数据。

结论：符合 V1 产品定位，当前不需要为了冻结继续视觉扩展。

### 5.2 Pet Window

Pet Window 具备透明背景、无边框、置顶、呼吸动画、拖动、点击反馈、大小调整和位置持久化，基本呈现为桌宠。

不足：

- 点击穿透模式下依赖 Settings 恢复交互，用户需要知道入口。
- 多显示器、显示器热插拔、不同缩放比例下的真实位置恢复尚缺当前轮次的实机证据。
- 没有 Renderer 崩溃后的用户可见恢复提示。

### 5.3 Tray

Tray 提供隐藏后找回、Settings 和明确退出，入口完整。Tray 创建失败会被隔离，但在没有正式 App Bundle 的开发模式中，图标和系统身份仍不能代表最终交付质量。

## 6. 用户体验审查

新用户源码体验：

```text
克隆仓库
  → 安装依赖
  → npm run desktop:start
  → 看到 Pet
  → 从 Tray/Application Menu 打开 Settings
  → 切换 Character / Size
  → Hide / Show
  → Tray 或 Cmd+Q 退出
```

不自然点：

1. 仓库首页仍把用户引向旧 Browser Runtime，而不是 Desktop 快速开始。
2. 普通用户没有安装入口，必须理解 npm 命令。
3. 首次启动没有说明 Pet 可以拖动、点击或切换点击穿透。
4. “隐藏后从哪里找回”和“如何彻底退出”虽有 Tray 能力，但缺少首次说明。
5. 缺少当前版本可支持平台、权限和数据采集边界的集中说明。

## 7. 工程质量审查

### 7.1 TypeScript

- `strict` 开启，`skipLibCheck` 未关闭项目检查。
- 生产 TypeScript 未发现公共代码使用 `any`。
- Event、Listener、Profile、Character、Runtime Context、IPC Payload 均有类型边界。
- Electron preload 使用 `.cts` 和 TypeScript `import = require()` 以输出 CommonJS preload；不是业务层动态 require。

状态：`PASS`

### 7.2 Electron Security

Pet 和 Settings Window 均配置：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- CSP
- 受限、冻结的 preload bridge

Settings 与 Pet Interaction IPC 会校验来源 WebContents。部分 Runtime 初始化 IPC Handler 没有同等级 sender 校验，但相关通道没有暴露给 Settings bridge，当前攻击面有限。冻结前应记录为 IPC hardening 风险。

状态：`PASS_WITH_RISKS`

### 7.3 Persistence

优点：

- Preferences 有版本字段和严格验证。
- 写入采用临时文件加 rename。
- 损坏 JSON 会回退到默认值。
- User Profile 在进入 Runtime 前经过 Character、BehaviorSlot 和 Action 校验。

风险：

- 没有串行化写入，同一路径并发写存在竞争。
- 只接受 version 1，尚无迁移机制；未来版本会回退默认值而不是迁移。
- 损坏文件会被回退，但没有隔离原文件或面向用户的恢复说明。

状态：`NEEDS_ADJUSTMENT`

### 7.4 Error Handling

优点：

- Listener 生命周期错误隔离完整。
- Tray 创建失败不会阻断 Runtime。
- Runtime startup/stop 有 IPC acknowledgement 和 timeout。
- Desktop shutdown 会继续执行剩余清理。

风险：

- Renderer 运行期崩溃缺少恢复闭环。
- Listener Event 进入已失效 Renderer 时主要依赖日志和发送失败，没有面向用户的降级状态。
- 启动期配置失败会退出应用，缺少可操作的错误界面。

状态：`NEEDS_ADJUSTMENT`

## 8. V1 缺失能力分类

### 8.1 必须补充后才能冻结

1. 形成唯一、当前有效的 V1 文档契约：更新根 README、Architecture、Extension Guide、Freeze Scope，消除旧 Event/Character/Browser 描述。
2. 明确并冻结 Event 扩展规则：任意顶层 type 与 `CUSTOM_EVENT + name` 二选一或规定清晰边界。
3. 解决或明确阻断 Preferences 并发写竞争，保证长期运行时位置与 Settings 保存一致。
4. 为 Pet Renderer 运行期崩溃定义最小 V1 行为：恢复、重启或明确退出，不能静默留下“有 Tray/Listener、无 Runtime”的半存活状态。
5. 完成 V1 版本一致性和基线治理：根包、Desktop 包、Freeze 文档、Commit 与 Tag 必须对应同一版本，提交信息可追溯。

### 8.2 可以在 V1 冻结后、正式分发前补充

- macOS `.app` 打包和安装入口。
- App icon、Bundle Identifier。
- Developer ID 签名与 Apple 公证。
- 安装/升级/卸载说明。
- 真实 macOS 首次安装、Dock、Cmd+Tab、Tray、Cmd+W、Cmd+Q、重启回归。
- 多显示器与缩放比例实机验证。
- 自动更新和崩溃报告。

如果“V1”定义为面向普通用户公开下载的正式版本，则以上打包、签名、公证和实机验收会升级为发布阻断项；如果“V1”定义为源码架构基线，它们不阻断架构冻结。

### 8.3 明确不做

- Marketplace
- 第三方 Plugin 市场
- Account / Cloud Sync
- Windows Listener 和 Windows Desktop 发行
- Git、VS Code、Codex Listener
- 复杂 Settings 或系统监控 Dashboard
- 虚假 AI 状态、等级、能量和活跃度

## 9. 技术债

| 问题 | 影响 | 严重程度 | 建议 | 阶段 |
|---|---|---:|---|---|
| 根 README 与架构/扩展文档陈旧 | 用户和扩展开发者得到错误契约 | 高 | V1 Freeze 前统一权威文档 | 影响 V1 |
| Event type 可任意扩展且同时存在 CUSTOM_EVENT | Adapter 形成两套扩展协议 | 高 | Freeze 前明确唯一规则 | 影响 V1 |
| Preferences 写入未串行化 | 并发更新可能丢失或失败 | 高 | Freeze 前关闭竞态 | 影响 V1 |
| Renderer 崩溃后无恢复闭环 | 长期运行可能进入半存活状态 | 高 | Freeze 前定义最小恢复策略 | 影响 V1 |
| 根包 1.0.0、Desktop 0.1.0、Tag v0.5.0 | 版本身份不一致 | 中 | Freeze 时统一版本和 Tag | 影响 V1 |
| 默认 Character Catalog 位于 Core config | Core 数据归属不够中立 | 中 | 明确其为默认示例或迁出策略 | 契约债 |
| Runtime 初始化 IPC sender 校验不完全一致 | Renderer 被攻破后的 IPC 面增加 | 中 | 后续统一 sender allowlist | 发布加固 |
| Preferences 只有 version 1 且无迁移 | 后续 Schema 升级可能重置配置 | 中 | 增加版本迁移策略 | V1 后可补 |
| 无打包、签名、公证 | 普通用户无法安全安装 | 高 | 正式分发前完成 | 影响正式发布 |
| 无自动更新、崩溃报告 | 维护和故障定位能力不足 | 中 | 发布节奏确定后补充 | V1 后可补 |
| 最近提交信息多为 `s` | 变更不可追溯 | 中 | Freeze Commit 使用明确范围与验证信息 | 治理债 |
| Browser Example 仍保留直接调试入口 | 容易被误认为正式宿主方式 | 低 | 文档标记为开发示例 | 文档债 |

## 10. 自动化验证

2026-07-31 在当前工作区执行：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS，68/68 |
| `npm run desktop:build` | PASS |
| `git diff --check` | PASS |

本轮没有启动真实 Electron UI，也没有执行真实安装、Dock、Cmd+Tab、Tray 点击、Cmd+W、Cmd+Q、多显示器或长时间运行测试。因此不能把自动测试描述为真实 macOS 验收。

## 11. 风险汇总

### 已受控

- Listener 与 Runtime 解耦。
- ExternalEvent 与 CompanionEvent 分离。
- Event 不绑定 Character、Action 或 Asset。
- Runtime 通过单一 Composition Root 创建。
- Desktop 单实例和退出顺序有自动测试。
- Listener Timer、异步采样和 ChildProcess 有释放机制。
- Electron Renderer 使用隔离和 Sandbox。
- Developer 信息未污染生产 Settings 主界面。

### 未关闭

- V1 公共 Event 扩展契约不唯一。
- 权威文档与实现漂移。
- Preferences 并发持久化风险。
- Renderer 崩溃后的 Runtime 连续性。
- 版本、Tag 和分发身份不一致。
- 尚无本轮真实 macOS 验收证据。

## 12. V1 Freeze 结论

```text
COMPANION_V1_STATUS:

NEEDS_ADJUSTMENT
```

```text
ARCHITECTURE_STATUS:

PASS
```

```text
V1_FREEZE:

NO
```

当前 Companion 已经具备成为 V1 基线的主体条件：核心架构正确、产品 UI 方向成立、自动回归完整、Desktop 生命周期与 Listener 资源管理达到较好基础。

暂不建议立即冻结，原因不是需要继续扩展功能，而是存在五个边界明确的冻结前事项：

1. 同步并冻结权威文档。
2. 确认唯一 Event 扩展契约。
3. 关闭 Preferences 并发写风险。
4. 定义 Renderer 崩溃后的最小生命周期行为。
5. 统一版本并建立可追溯 V1 Tag。

上述事项完成并重新执行自动验证后，可进行一次真实 macOS 验收。通过后适合冻结架构、UI Contract、Runtime API、Listener Contract、IPC Contract 与配置 Schema。Marketplace、更多 Listener、Windows、Auto Update 等不应进入 V1 Freeze 范围。
