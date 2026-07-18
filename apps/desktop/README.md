# Companion Desktop Shell V1

## 项目介绍

Companion Desktop 是 Companion Runtime 的 Electron 宿主验证应用。它只负责桌面窗口、配置加载、Runtime Bootstrap 和开发事件按钮，不包含 Collector、平台监听或 Marketplace。

## 架构说明

```text
Electron Main / Preload
  → 已解析配置
Electron Renderer
  → createCompanionRuntime(config)
  → Companion Runtime
  → PetViewer
```

Renderer 禁用 Node integration，并通过 context-isolated preload 获取配置。Desktop 不直接创建 EventBus、BehaviorEngine、ActionResolver 或 PetManager。

## 快速开始

在仓库根目录安装依赖后：

```bash
cd apps/desktop
npm run build
npm start
```

窗口默认显示 Sasuke。底部开发按钮可发送 TASK_START、TASK_RUNNING、TASK_SUCCESS 和 TASK_ERROR。

## 扩展方式

未来平台事件应通过独立 Collector / Adapter 转换为 CompanionEvent，再调用 Runtime 公开入口。Desktop Shell 不负责修改 Core Event、Behavior 或 Character Pack。

## 版本记录

- `0.1.0`：透明无边框 macOS-first Desktop Shell、Runtime 集成和开发事件入口。
