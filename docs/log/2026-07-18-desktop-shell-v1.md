# Companion Desktop Shell V1

## 背景

Companion Runtime 已具备统一的 `createCompanionRuntime()` Composition Root，但此前主要由 Browser Demo 承载。本阶段增加独立 Desktop Shell，用于验证 Runtime 可以在不修改 Core 架构的前提下，由桌面宿主完成初始化、角色展示和内部 Event 测试。

本阶段只实现宿主外壳，不接入 Collector、Codex、Marketplace 或新的平台能力。

## 技术选型

V1 选择 Electron 43.1.1。

- Electron 的 Renderer 与现有 DOM Viewer、TypeScript 和 ES Module 构建方式直接兼容，可以复用现有 Viewer，不需要新增渲染技术栈。
- `BrowserWindow` 原生提供无边框、透明、固定尺寸、置顶和屏幕定位能力，适合快速验证 macOS 桌宠窗口。
- Tauri 的产物通常更轻，但开发与构建需要额外维护 Rust 工具链。对于当前以 TypeScript 为主的项目，Electron 的团队维护成本更低。
- Electron 引入较大的开发依赖和桌面分发体积；这是 V1 验证阶段的明确代价。Electron 和 Tauri 都支持后续扩展至 Windows、Linux，本阶段只实际验证 macOS。

安全边界采用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，Preload 仅暴露读取 Desktop 启动配置的窄接口。

## 修改内容

新增 `apps/desktop/`：

- `src/main.ts`：Electron 主进程与 IPC 注册。
- `src/window.ts`：创建透明、无边框、固定尺寸、置顶、右下角窗口。
- `src/preload.cts`：隔离 Renderer 与 Node.js，仅暴露启动配置接口。
- `src/config.ts`：在宿主边界加载构建产物中的 Profile、Character Manifest 与 Runtime 配置。
- `src/runtime.ts`：调用唯一 Composition Root、启动 Runtime、绑定开发事件按钮。
- `index.html`、`desktop.css`：桌宠舞台与约 128px 的呼吸动画展示。
- `package.json`、`README.md`：Desktop 构建、启动及使用说明。

根项目增加 `desktop:build`、`desktop:start` 命令，并在现有构建流程中复制 Desktop 静态文件。

## Desktop 架构

```text
Electron Main / Preload
        ↓ 启动配置
Desktop Renderer
        ↓ createCompanionRuntime(config)
Companion Runtime Context
        ↓ PetManager / Viewer
Character Action / Asset
```

Desktop 只负责窗口、配置输入、Runtime 启动和测试交互。它没有自行创建 `EventBus`、`PetBehaviorEngine`、`ActionResolver` 或 `PetManager`。

开发按钮通过公开 Context 发布标准 Event：

```text
Button
  ↓ runtime.publish(CompanionEvent)
EventNormalizer / EventBus
  ↓
BehaviorResolver / BehaviorEngine
  ↓
ActionResolver
  ↓
PetManager / Viewer
```

## Runtime 集成方式

Desktop 主进程从构建目录取得上层配置，通过隔离的 Preload API 交给 Renderer。Renderer 将 ProfileStore、CharacterRegistry、映射和 Viewer 容器作为 `createCompanionRuntime(config)` 的输入注入。

默认 Profile 使用 Sasuke。Runtime Context 创建后只调用 `runtime.start()` 和 `runtime.publish()`，没有访问或重建 Core 内部依赖。

## 设计原因

- 保持 Single Composition Root，避免 Desktop 形成第二套组装方式。
- 配置读取留在宿主边界，Composition Root 不依赖文件系统或环境变量。
- 复用既有 Viewer CSS 与 Character Asset，不复制或修改 PNG。
- 测试按钮产生标准 Event，不绕过 Event、Behavior、Action 链路直接操作 Viewer。

## 风险

- Electron 会增加 `node_modules` 和未来安装包体积；V1 尚未配置签名、公证和安装包生成。
- 开发事件按钮当前始终展示，仅用于 Shell 验证；产品化阶段需要明确开发模式开关。
- 当前只在 macOS 实机验证窗口；Windows、Linux 的透明窗口和桌面定位需要分别验证。
- Desktop 配置加载当前面向构建目录，未来若引入可编辑 Profile，应由独立的宿主持久化适配层提供。

## 验证

2026-07-18 执行：

- `npm run typecheck`：通过。
- `npm test`：通过，35/35。
- `npm run desktop:build`：通过。
- Electron macOS 实际启动：Runtime 正常初始化，窗口尺寸 280×240，位于主屏幕工作区右下角，透明、无边框、置顶。
- Viewer 实际显示 Sasuke，约 128px，并启用呼吸动画。
- 开发按钮实际触发并显示 `TASK_RUNNING: EXECUTING / working`。
- `TASK_SUCCESS → SUCCESS → celebrate → PetManager` 由现有 Composition Root 集成测试覆盖并通过。

## 结果

Companion Desktop Shell V1 已建立。它以独立 Electron 宿主调用官方 `createCompanionRuntime()` 入口，能够显示默认角色并通过内部标准 Event 驱动现有 Behavior、Action 和 Viewer 链路。

Core Runtime、Event Contract、Behavior Logic、Character System、PNG 与动画资源均未因本阶段修改。

后续建议先增加开发/生产模式和桌面打包签名流程，再以 Adapter 或 Collector 的独立阶段接入真实平台事件；不要将平台监听放入 Desktop Viewer 或 Core Runtime。
