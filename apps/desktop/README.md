# Companion Desktop Shell Foundation V1

## 当前阶段

Companion Desktop 是 Companion Runtime 的 macOS-first Electron 宿主。Foundation V1 已具备单实例、统一窗口管理、统一生命周期和开发/正常显示模式边界。

当前仍是工程验证版本，尚未制作可安装应用包。

## 架构

```text
Electron Main
→ DesktopLifecycleManager
├── WindowManager
├── ListenerManager
└── RuntimeIpcCoordinator
        ↓ IPC
Pet Renderer
→ createCompanionRuntime()
→ Companion Runtime / PetViewer
```

Main Process 负责 Electron、窗口和 Listener 生命周期；Renderer 负责 Runtime 和宠物展示。Desktop 不直接创建 EventBus、BehaviorEngine、ActionResolver 或 PetManager。

## 启动

在仓库根目录运行开发模式：

```bash
npm run desktop:start
```

开发模式显示 Runtime 状态和 Start、Run、Success、Error 测试按钮。

只显示宠物的 Production-like 模式：

```bash
npm run desktop:start:production
```

Production-like 只是 UI 模式验证，不代表已经完成发布构建、签名或公证。

应用使用 Electron single-instance lock。重复执行启动命令不会创建第二个窗口、Runtime 或 Listener，而是显示并聚焦已有宠物窗口。

## 窗口行为

宠物窗口保持透明、无边框、置顶、固定尺寸和右下角定位。

关闭窗口或按 `Cmd+W`：

```text
close → hide
```

窗口只是隐藏，应用、Runtime 和 Listener 继续运行，不等于退出应用。

## 恢复窗口

可以通过以下方式恢复隐藏的宠物：

- 再次执行 `npm run desktop:start`。
- 在 macOS 中重新激活 Electron/Companion Desktop 应用。

两种方式都会复用已有实例并显示、聚焦原宠物窗口。

## 退出

使用标准 macOS `Cmd+Q` 或应用菜单中的 Quit 明确退出。

退出顺序：

```text
ListenerManager.destroyAll()
→ Renderer runtime.stop()
→ Runtime stopped acknowledgement
→ WindowManager.destroyPetWindow()
→ Electron quit
```

不要使用关闭窗口代替退出；关闭窗口只会隐藏宠物。

## 开发模式

- Development：显示测试事件按钮和 Runtime 状态。
- Production-like：隐藏全部调试控件，仅显示宠物。

模式由 Main Process 显式注入 Renderer，两种模式都只创建一套 Runtime。

## Listener

macOS 下启动 `MacSystemListener` 和 `MacBatteryListener`。Listener 只输出 ExternalEvent，Desktop 完成 Mapping 后调用 Runtime；Listener 不操作 Character、Action 或 Viewer。

## 已知限制

- 尚未实现完整 Tray。
- 尚未实现 Settings UI。
- 尚未生成安装包。
- 尚未进行 macOS 签名或公证。
- 尚未实现开机启动。
- 当前正式退出入口依赖标准 macOS App Menu / `Cmd+Q`。

## 版本记录

- Desktop Shell V1：透明无边框窗口与 Runtime 接入。
- Listener V1/V2：macOS CPU、Memory 和 Battery ExternalEvent。
- Listener Lifecycle V1：可取消采样、generation 隔离和可靠销毁。
- Desktop Shell Foundation V1：单实例、WindowManager、DesktopLifecycleManager、Runtime IPC 和模式隔离。
