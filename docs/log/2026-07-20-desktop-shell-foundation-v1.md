# Desktop Shell Foundation V1

## 背景

Desktop Productization Phase 0 审查确认，原 Desktop Shell 能运行 Runtime 与 macOS Listener，但没有 Electron single-instance lock。用户重复运行启动命令会产生第二个 Electron Process、第二个窗口、第二套 Runtime 和 Listener。

原窗口 close 会销毁 Renderer 并停止 Runtime，但 macOS Main Process 和 Listener 继续运行；由于没有 Tray 或持久窗口管理，用户不清楚如何恢复宠物，也不清楚关闭窗口与退出应用的区别。

本阶段只治理 Desktop Shell。Runtime Core、Listener Interface、Event Contract、Character、Profile、Behavior Slot、Action Resolver 和 PNG 均未修改。

## Phase 0 审查结论

引用：`docs/review/2026-07-18-desktop-shell-productization-v1-architecture-review.md`。

审查结论为：

```text
DESKTOP_PRODUCTIZATION_READINESS:
SAFE_TO_IMPLEMENT_WITH_DESKTOP_ONLY_CHANGES
```

实现继续保持 Main 负责 Listener、Renderer 负责 Runtime 的边界。

## Single Instance

`main.ts` 在创建 WindowManager、ListenerManager、macOS Listener、IPC handler 或 Renderer 之前调用：

```text
app.requestSingleInstanceLock()
```

- 第一实例获得锁后才创建 DesktopLifecycleManager 及其依赖。
- 第二实例未获得锁，只调用 `app.quit()`，不会初始化 Desktop 资源。
- Primary Instance 监听 `second-instance`，统一调用 show/focus 已有宠物窗口。

锁逻辑抽取为 `lifecycle/singleInstance.ts`，既保持锁获取时机最早，也允许单元测试。

## WindowManager

新增 `apps/desktop/src/window/WindowManager.ts`，唯一负责：

- 创建并保存宠物窗口引用。
- 避免重复创建窗口。
- show、hide、focus、restore。
- 判断窗口是否存在或已销毁。
- 销毁宠物窗口。
- 普通 close 转换为 hide。
- Lifecycle 正式 quitting 时允许窗口销毁。

BrowserWindow 的透明、无边框、置顶、固定尺寸、右下角定位、Sandbox、Context Isolation 和禁用 Node Integration 配置继续由 Desktop window factory 提供，`main.ts` 不再直接管理窗口细节。

## Desktop Lifecycle

新增 `DesktopLifecycleManager`，启动顺序：

```text
注册 App events / Runtime IPC
→ app.whenReady()
→ WindowManager.createPetWindow()
→ 等待 Renderer runtime-ready
→ ListenerManager.startAll()
```

退出顺序：

```text
requestQuit()
→ ListenerManager.destroyAll()
→ Main 请求 Renderer runtime.stop()
→ 等待 runtime-stopped，2 秒超时兜底
→ WindowManager.destroyPetWindow()
→ 移除 Runtime IPC 与 App handlers
→ app.quit()
```

`requestQuit()` 缓存同一个 shutdown Promise，多次 Quit 只执行一次。Listener destroy 失败仍继续 Runtime stop；Runtime stop 失败或超时仍继续销毁窗口和退出。

## Runtime / Listener 边界

Main Process：

- Electron single instance 与 App 生命周期。
- WindowManager。
- ListenerManager 与 macOS Listener。
- Runtime IPC coordination。

Pet Renderer：

- `createCompanionRuntime()`。
- Runtime start/stop。
- PetViewer 与 Action/Asset 展示。
- ExternalEvent Mapping 后的 `runtime.publish()`。

IPC 协议：

- Main → Renderer：`companion:runtime-stop`、`companion:external-event`。
- Renderer → Main：`companion:runtime-ready`、`companion:runtime-stopped`、`companion:runtime-error`。

ExternalEvent 只发送给 WindowManager 持有的宠物窗口，不再广播所有 BrowserWindow。未来 Settings Window 不加载 `runtime.ts`，不会创建第二套 Runtime。

## Development Mode

Main Process 根据明确环境输入确定模式，并通过 BrowserWindow `additionalArguments` 注入 Renderer：

- `npm run desktop:start`：Development。
- `npm run desktop:start:production`：Production-like。

Renderer 将模式写入 `body[data-mode]`。Production-like 通过 CSS 隐藏标记为 `development-only` 的状态栏和事件按钮，只保留宠物 Viewer。两种模式使用相同 Runtime 创建入口，均只有一套 Runtime。

## 启动与退出说明

开发启动：

```bash
npm run desktop:start
```

正常宠物显示验证：

```bash
npm run desktop:start:production
```

- `Cmd+W`：隐藏宠物，应用继续运行。
- 再次运行启动命令或 macOS activate：恢复并聚焦宠物。
- `Cmd+Q`：执行统一 shutdown 并退出。

本阶段尚未实现 Tray、Settings、应用包、签名、公证或开机启动。

## Unit Test

新增 Desktop 测试覆盖：

- 第一实例获得锁、第二实例不初始化。
- WindowManager 只创建一个窗口。
- show、hide、focus 与 close→hide。
- quitting 状态允许 destroy。
- 启动顺序为 Window create → Runtime ready → Listener start。
- 退出顺序为 Listener destroy → Runtime stop/stopped → Window destroy → App quit。
- activate 和 second-instance 恢复现有窗口。
- requestQuit 可重入安全。
- Listener destroy 与 Runtime stop failure isolation。

## Integration Test

- `npm run typecheck`：通过。
- `npm test`：通过，54/54。
- `npm run desktop:build`：通过。
- `git diff --check`：通过。
- 原有 Core 与 Listener 测试继续通过。

## Real macOS Verification

Single Instance：

- 启动 Primary Instance 后再次执行 `npm run desktop:start`。
- 第二命令约 1.4 秒内 exit code 0。
- `pgrep` 只发现一个 Companion Desktop Main Process。
- Accessibility 只发现一个宠物窗口。

Close / Hide：

- 使用 `Cmd+W` 关闭宠物窗口。
- Accessibility window count 从 1 变为 0，Main Process PID 保持存在。
- 再次执行启动命令后 window count 恢复为 1。
- 复用同一个 Main Process，没有创建第二实例。

Quit：

- 使用标准 `Cmd+Q`。
- Companion Desktop Main Process 退出。
- 启动命令对应进程最终 exit code 0。
- Unit/Integration Test 已验证内部严格顺序和 acknowledgement；实际验证没有把不可直接观察的内部调用伪装为 UI 证据。

Development Mode：

- Development Accessibility tree 包含 Runtime 状态及 Start、Run、Success、Error 按钮。
- Production-like Accessibility tree 只包含宠物 image，不包含状态文字或四个测试按钮。
- 两种模式均正常启动并以 `Cmd+Q` exit code 0 退出。

## 风险

- 目前依赖标准 macOS App Menu / Cmd+Q 作为明确退出入口；下一阶段 Tray 可提供更易发现的入口。
- Runtime ready 默认 5 秒、Runtime stop 默认 2 秒超时，需要在打包环境继续验证。
- Production-like 是显式 UI 模式，不是正式发布构建。
- 当前应用仍使用 Electron 开发身份和共享 user-data 语义，打包前需要独立 app identity。
- 尚未验证 Windows/Linux 窗口与 single-instance 行为。

## 结果

Companion Desktop 已从可重复启动的 Demo Shell 升级为具备单实例、统一窗口所有权、close→hide、可恢复窗口、可重入退出、Runtime/Listener 生命周期编排和模式隔离的 Desktop Foundation。

`Listener → ExternalEvent → Mapping → Runtime → Current Pet` 架构保持不变。
