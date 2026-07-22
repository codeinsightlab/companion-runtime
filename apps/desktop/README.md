# Companion Desktop Shell Foundation V1

## 当前阶段

Companion Desktop 是 Companion Runtime 的 macOS-first Electron 宿主。Foundation V1 已具备单实例、统一窗口管理、统一生命周期和开发/正常显示模式边界；Desktop Identity V1 补充了 `Companion` 应用名称、Dock 身份和最小 macOS Application Menu。

当前仍是工程验证版本，尚未制作可安装应用包。

## 架构

```text
Electron Main
→ DesktopLifecycleManager
├── TrayManager
├── WindowManager（Pet / Settings）
├── ListenerManager
├── SettingsIpcCoordinator
└── RuntimeIpcCoordinator
        ↓ IPC
Pet Renderer
→ createCompanionRuntime()
→ Companion Runtime / PetViewer
```

Main Process 负责 Electron、窗口和 Listener 生命周期；Renderer 负责 Runtime 和宠物展示。Desktop 不直接创建 EventBus、BehaviorEngine、ActionResolver 或 PetManager。

Settings 使用独立 HTML Renderer，只暴露 Settings IPC，不加载宠物 `runtime.ts`，因此不会创建第二套 Runtime 或 Viewer。

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

## macOS 使用方式

启动后，应用采用 `regular` activation policy 并显示在 Dock，可通过 `Cmd+Tab` 切换。Application Menu 内的产品项显示为 `About Companion`、`Hide Companion` 和 `Quit Companion`。

- 启动：在仓库根目录执行 `npm run desktop:start`。
- 隐藏宠物：关闭窗口或按 `Cmd+W`；应用继续运行。
- 恢复宠物：重新激活 Dock 中的 Companion，或再次执行启动命令。
- 退出应用：按 `Cmd+Q`，或选择 `Companion → Quit Companion`。

Quit 会进入 DesktopLifecycleManager 的统一关闭流程，不会绕过 Listener 和 Renderer Runtime 的资源释放。

## 恢复窗口

可以通过以下方式恢复隐藏的宠物：

- 再次执行 `npm run desktop:start`。
- 在 macOS 中重新激活 Electron/Companion Desktop 应用。

两种方式都会复用已有实例并显示、聚焦原宠物窗口。

## Tray 使用

macOS 菜单栏中的 Companion 图标提供：

- 显示宠物：显示并聚焦既有宠物窗口。
- 隐藏宠物：隐藏宠物，但 Runtime 与 Listener 继续运行。
- 打开设置：创建或复用唯一 Settings Window。
- 退出 Companion：进入 DesktopLifecycleManager 统一退出流程。

Tray 不直接访问 Runtime、PetManager 或 Listener 内部资源。

## Settings

Settings Window 提供：

- 从 Character Manifest 列表切换当前宠物。
- 调整 small（96px）、medium（128px）、large（160px）三档尺寸。
- 只读查看 CPU、Memory、Battery Listener 状态。
- 显示或隐藏宠物窗口。

角色切换通过 Pet Renderer 调用现有 `PetManager.changeCharacter()`；宠物窗口不会重新创建 Runtime 或重启 Listener。Settings 普通关闭会销毁 Settings Window，下次从 Tray 重新创建；宠物应用继续运行。

## 配置存储位置

桌面配置保存在 Electron `app.getPath("userData")` 下：

- `user-profile.json`：当前 User Profile/角色。
- `desktop-preferences.json`：尺寸等 Desktop Preferences。

文件使用临时文件加 rename 的方式保存，不写入仓库、Character Manifest 或 PNG 目录。具体绝对路径由 Electron 和操作系统决定，不在代码中写死。

## 退出

使用标准 macOS `Cmd+Q` 或应用菜单中的 Quit 明确退出。

退出顺序：

```text
TrayManager.destroy()
→ ListenerManager.destroyAll()
→ Renderer runtime.stop()
→ Runtime stopped acknowledgement
→ WindowManager.destroyAllWindows()
→ IPC cleanup
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

- 尚未实现 Listener 开关与阈值配置。
- 尚未实现鼠标穿透设置。
- 尚未实现宠物位置记忆。
- 尚未生成安装包。
- 尚未进行 macOS 签名或公证。
- 当前通过仓库内 Electron 以开发态运行，不是独立 `.app` bundle，尚无正式 bundle identifier。
- 受宿主 `Electron.app` bundle 限制，开发态 Dock tooltip 和最上层菜单标题仍可能显示 `Electron`；生成正式 `Companion.app` 后才能改变这一系统级标签。
- 尚未实现开机启动。
- 当前使用 Electron 默认 Dock 图标，尚未建立发布图标资源。
- 尚未验证 Windows/Linux。

## 版本记录

- Desktop Shell V1：透明无边框窗口与 Runtime 接入。
- Listener V1/V2：macOS CPU、Memory 和 Battery ExternalEvent。
- Listener Lifecycle V1：可取消采样、generation 隔离和可靠销毁。
- Desktop Shell Foundation V1：单实例、WindowManager、DesktopLifecycleManager、Runtime IPC 和模式隔离。
- Desktop Identity V1：Companion 应用名称、Dock activation、最小 Application Menu 和统一 Quit 委托。
- Desktop Control Surface V1：macOS Tray、独立 Settings、角色/尺寸持久化和 Listener 状态展示。
