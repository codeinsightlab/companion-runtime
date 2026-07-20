# Desktop Shell Productization V1 Architecture Review

审查日期：2026-07-18  
审查阶段：Phase 0，实施前架构审查  
审查范围：`apps/desktop` 的启动、窗口、Runtime、Listener 和退出流程。  
审查约束：本阶段未修改代码、未重构、未新增功能、未运行写入型验证。

## 1. 当前启动链路

当前仓库根命令：

```text
npm run desktop:start
→ npm --prefix apps/desktop start
→ npm run build --silent
→ electron ../../dist/apps/desktop/src/main.js
```

实际初始化链路：

```text
Electron 加载 main.ts
├── 创建 ListenerManager
├── macOS 下创建 MacSystemListener / MacBatteryListener
├── 注册 Listener event forwarding
└── 注册 IPC handler
        ↓
app.whenReady()
        ↓
createDesktopWindow()
        ↓
BrowserWindow.loadFile(index.html)
        ↓
Renderer 加载 runtime.js
        ↓
loadRuntimeConfiguration()
        ↓
createCompanionRuntime(config)
        ↓
context.runtime.start()
        ↓
Main 收到 did-finish-load
        ↓
listenerManager.startAll()
```

代码位置：

- 根启动脚本：`package.json` 的 `desktop:start`。
- Desktop 启动脚本：`apps/desktop/package.json` 的 `start`。
- Main Process：`apps/desktop/src/main.ts`。
- BrowserWindow 创建：`apps/desktop/src/window.ts#createDesktopWindow()`。
- Runtime 创建：`apps/desktop/src/runtime.ts` 顶层模块初始化。
- Listener 启动：`main.ts` 中 `did-finish-load → listenerManager.startAll()`。

当前只有开发启动方式：每次 start 都先 build，再以 Electron binary 执行编译产物。尚无安装后的正式应用启动入口、应用包、签名或开机启动设计。

## 2. 当前窗口管理

### 2.1 BrowserWindow 创建位置

`createDesktopWindow()` 位于 `apps/desktop/src/window.ts`。它创建 280×240、透明、无边框、置顶、不可调整大小、跳过 Dock/Taskbar 的宠物窗口，并定位到主屏幕右下角。

`main.ts` 有两个调用点：

1. `app.whenReady()` 后无条件创建一个窗口。
2. macOS `activate` 时，仅当 `BrowserWindow.getAllWindows().length === 0` 才重新创建。

### 2.2 是否存在 WindowManager

不存在。

- `main.ts` 直接调用 `createDesktopWindow()`。
- 初始窗口仅保存在 `whenReady` callback 的局部常量中。
- 没有持久窗口引用。
- 没有 `show()`、`hide()`、`focus()`、`destroy()` 的统一管理对象。
- 其他模块通过 `BrowserWindow.getAllWindows()` 广播或寻找窗口。

因此当前无法稳定表达“宠物窗口”“设置窗口”等不同窗口角色，也没有单一窗口所有权。

### 2.3 为什么可以启动多个窗口

单个 Main Process 内，当前 `activate` 检查通常能防止第二个宠物窗口；但应用没有调用 Electron `app.requestSingleInstanceLock()`。

用户第二次运行 `npm run desktop:start` 时会启动第二个 Electron Process。每个 Process 都会独立：

- 创建 ListenerManager。
- 创建两个 macOS Listener。
- 创建 BrowserWindow。
- Renderer 调用一次 `createCompanionRuntime()`。
- 启动一套 Runtime 和 Listener。

因此当前可以出现多个桌宠窗口、多个 Runtime、重复的系统采样和重复 External Event。

### 2.4 是否存在重复 Runtime

每个 Renderer Window 加载 `runtime.js` 时都会创建一个 Companion Runtime Context。

- 正常单窗口、单进程时：一套 Runtime。
- 第二个 OS Process：第二套 Runtime。
- 当前窗口被销毁后通过 `activate` 重建：旧 Renderer 的 `beforeunload` 会 stop 旧 Runtime，新窗口创建新 Runtime；正常情况下不是同时存在。
- 如果未来 main 直接创建多个 BrowserWindow：每个窗口都会自动创建自己的 Runtime，没有 Runtime Manager 阻止重复。

## 3. 当前关闭流程

### 3.1 用户关闭宠物窗口

当前没有监听 BrowserWindow `close` 事件，也没有执行 `event.preventDefault() + hide()`。

实际流程：

```text
窗口 close
→ BrowserWindow 被销毁
→ Renderer beforeunload
→ 移除 External Event / Runtime Stop IPC handler
→ context.runtime.stop()
→ window-all-closed
→ macOS 不执行 app.quit()
→ Main Process 继续运行
→ ListenerManager 和 Listeners 继续运行
```

结果：

- Runtime 已停止。
- Viewer/窗口已经消失。
- Listener 仍在后台采样。
- Electron App 仍在运行。
- 没有 Tray，用户没有清晰的“显示宠物”恢复入口。
- macOS 可以通过重新激活应用触发 `activate` 创建新窗口，但这不是当前 UI 中明确暴露的产品操作。

这不是资源泄漏，因为 App 仍活着；但它是产品生命周期不完整：后台感知存在，宠物和 Runtime 不存在，且用户不知道如何恢复或退出。

### 3.2 用户退出 Electron 应用

当前 `before-quit` 已实现等待式退出编排：

```text
before-quit
→ preventDefault()
→ listenerManager.destroyAll()
→ 对所有 BrowserWindow 发送 companion:runtime-stop
→ Renderer context.runtime.stop()
→ companion:runtime-stopped acknowledgement
→ shutdownComplete = true
→ app.quit()
→ Electron 销毁窗口并退出
```

如果 Renderer 2 秒内没有 acknowledgement，Main 使用 timeout 继续退出。

这个正式退出顺序基本符合目标：Listener 先停止外部输入，再停止 Runtime，最后退出 App。但目前 BrowserWindow 没有由专门的 WindowManager 显式 destroy，而是交给 `app.quit()` 收尾。

## 4. 当前生命周期责任

| 资源 | 当前创建方 | 当前启动方 | 当前停止/销毁方 |
|-|-|-|-|
| BrowserWindow | Main `createDesktopWindow()` | `loadFile/ready-to-show` | 用户 close 或 `app.quit()` |
| Runtime Context | Renderer `runtime.ts` | Renderer `context.runtime.start()` | Renderer IPC / `beforeunload` |
| ListenerManager | Main module | Main `did-finish-load` | Main `before-quit` |
| MacSystemListener | Main module | ListenerManager | ListenerManager |
| MacBatteryListener | Main module | ListenerManager | ListenerManager |
| IPC subscriptions | Preload / Renderer | Renderer module load | Renderer `beforeunload` |

当前边界的正确部分：

- Runtime 自己负责运行，不直接创建 Listener。
- Listener 只负责外部感知。
- Desktop Main/Renderer 共同编排生命周期。
- Listener → ExternalEvent → Mapping → Runtime 链路没有被破坏。

当前不足：

- 没有统一 Desktop Lifecycle Manager。
- Runtime 生命周期隐藏在 Renderer 顶层模块副作用中，没有 Runtime Manager。
- Listener 生命周期在 Main，Runtime 生命周期在 Renderer，两者靠散落 IPC 协调。
- Window 生命周期由 Main、Electron 默认行为和 Renderer beforeunload 共同决定。

## 5. 当前产品入口状态

### 启动

只有开发命令 `npm run desktop:start`，没有正式安装/应用入口。

### 后台运行

窗口关闭后 App 和 Listener 会继续运行，但 Runtime 已停止。它不是完整的“宠物后台运行”，而是“Listener 后台运行、宠物 Runtime 已卸载”。

### 退出

没有 Tray Quit。用户只能依赖系统应用退出方式、终端中断或 Electron 默认菜单。

### 设置

不存在 Settings Window，也没有打开设置入口。

### Development / Production

当前 `index.html` 始终包含 Start、Run、Success、Error 按钮和 Runtime 状态文本，没有 development/production mode 隔离。

## 6. 与目标架构差异

目标：

```text
Electron Main
→ Desktop Lifecycle Manager
→ Runtime Manager
→ createCompanionRuntime()
→ ListenerManager
→ Companion Runtime
```

当前：

```text
Electron Main
├── 直接创建 ListenerManager / Listener
├── 直接创建 BrowserWindow
├── 直接监听 before-quit
└── IPC 通知 Renderer
       ↓
Renderer 顶层模块
├── 直接 createCompanionRuntime()
└── 直接 runtime.start()/stop()
```

差异：

1. 缺少 Desktop Lifecycle Manager。
2. 缺少 Runtime Manager。
3. 缺少 WindowManager 和持久窗口引用。
4. 缺少 Electron single-instance lock。
5. 缺少 Tray、明确 Quit 和窗口显隐入口。
6. close 行为是 destroy，不是 hide。
7. 缺少 Settings Window。
8. 开发控件始终可见。

## 7. 实施前风险

1. **Renderer Runtime 所有权。** Runtime 依赖 DOM Viewer，因此仍应在 Renderer 创建。Main 的 Runtime Manager 应通过窄 IPC 管理其 start/stop/status，而不是把 Runtime 移到 Main 或重复组装 Core。
2. **关闭与退出必须区分。** Product close 应 hide；真正 Quit 才 destroy Listener、stop Runtime、destroy windows、quit App。
3. **单实例锁必须最早获取。** 应在创建 ListenerManager、Listener、IPC handler 或 BrowserWindow 前确定 primary instance，避免第二实例短暂启动后台资源。
4. **Settings 不应加载宠物 Runtime。** 如果 Settings Window 复用当前 `index.html/runtime.js`，会产生第二套 Runtime；必须使用独立页面/入口。
5. **Tray 与 macOS activate 要汇聚到同一个 WindowManager。** 否则仍可能出现窗口引用和显示状态分叉。
6. **开发模式不能依赖手工删 DOM。** 应由明确模式输入决定是否渲染调试状态和按钮，保持测试入口但不进入 Production UI。
7. **退出幂等。** Tray Quit、系统 Quit、信号退出可能同时到达，Lifecycle Manager 必须只执行一次 shutdown Promise。
8. **当前工作区有未提交修改。** 后续实现必须保留 Listener V1/V2/Lifecycle 相关变更，不覆盖现有工作。

## 8. 推荐实施边界

Phase 1 可以安全实施，建议严格限定到 Desktop：

```text
apps/desktop/src/lifecycle/DesktopLifecycleManager.ts
apps/desktop/src/runtime/DesktopRuntimeManager.ts
apps/desktop/src/window/WindowManager.ts
apps/desktop/src/tray/TrayManager.ts
apps/desktop/settings.html + settings renderer
```

职责建议：

- Main Process Lifecycle Manager：single-instance 之后统一 start/shutdown，拥有 ListenerManager、WindowManager、TrayManager。
- Renderer Runtime Manager：唯一拥有 Companion Runtime Context，提供 start/stop/status 的 IPC 边界。
- WindowManager：唯一创建、显示、隐藏、聚焦、销毁宠物与 Settings Window。
- TrayManager：只发出 show/hide/settings/quit intent，不接触 Runtime 或 Listener 内部资源。

不需要修改：

- Runtime Core
- Listener 接口
- Event Contract
- Behavior Slot
- Action Resolver
- Character System
- User Profile

## 9. Phase 0 结论

当前 Desktop Shell 的 Runtime 和 Listener 正常链路已成立，正式 App Quit 也已有可靠基础；但它仍是开发 Shell，不具备产品级单实例、窗口所有权、Tray 入口、设置入口和开发/生产模式边界。

```text
DESKTOP_PRODUCTIZATION_READINESS:
SAFE_TO_IMPLEMENT_WITH_DESKTOP_ONLY_CHANGES
```

本审查建议先完成 Single Instance、WindowManager、Lifecycle Manager，再加入 Tray 和 Settings；不要在本阶段调整 Runtime Core 或 Listener Architecture。
