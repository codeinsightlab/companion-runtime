# Desktop Identity & macOS Application Lifecycle V1

## 背景

Desktop Shell Foundation 已具备单实例、窗口管理及 Runtime/Listener 统一关闭流程，但启动方式仍是仓库内 Electron 直接执行编译后的 Main entry。此前没有明确 Application Name、Application Menu 或 Dock activation，宠物窗口还设置了 `skipTaskbar: true`，因此开发态进程不像一个可被 macOS 感知的完整应用。

本阶段只完善 Desktop Host 身份和 macOS 生命周期入口，不修改 Runtime Core、Listener、ExternalEvent、Event Mapping、Behavior、Character 或 Profile。

## 审查结果

### 启动方式

实际链路：

```text
npm run desktop:start
→ apps/desktop npm start
→ build
→ repository electron executable loads apps/desktop
→ package main: dist/apps/desktop/src/main.js
→ Electron app lifecycle
→ DesktopLifecycleManager
→ BrowserWindow
```

这是 Electron development execution，不是 packaged app；当前没有 `.app` bundle、正式 bundle identifier、签名或公证。

### Application Identity

修改前 Desktop package 只有 npm package name，未配置 `productName`，Main 未调用 `app.setName()`，也没有显式 Application Menu。macOS 可运行 Electron 进程，但没有稳定的 Companion 产品身份。

### Dock

修改前宠物 BrowserWindow 使用 `skipTaskbar: true`，Main 没有显式设置 `regular` activation policy 或调用 `app.dock.show()`。开发态又没有 `.app` bundle，这共同导致 Dock 和 Cmd+Tab 可见性不明确。

### Quit

修改前 Electron 默认 Quit/Cmd+Q 可以触发 `before-quit`。DesktopLifecycleManager 会阻止第一次默认退出并调用 `requestQuit()`，顺序为：

```text
ListenerManager.destroyAll()
→ Renderer Runtime stop IPC
→ WindowManager.destroyPetWindow()
→ app.quit()
```

已有关闭顺序正确，但缺少属于 Companion 的明确菜单入口。

## 修改内容

- Desktop package 增加 `productName: Companion`，开发命令改为让 Electron 加载该 package 目录，而不是直接加载单个 JS entry。
- 新增 `ApplicationIdentity` macOS Host 模块。
- Main 在创建窗口前设置 `app.setName("Companion")`。
- app ready 后显式设置 `regular` activation policy 并显示 Dock。
- 新增最小 Application Menu：About Companion、Hide Companion、Quit Companion。
- 保留最小 Window → Close 标准菜单角色，使 `Cmd+W` 继续进入 WindowManager 的 close→hide 路径。
- Quit Companion 只委托 `DesktopLifecycleManager.requestQuit()`，不直接调用 `app.quit()`。
- 宠物窗口取消 `skipTaskbar` 隐藏配置。
- 保持 Cmd+W/窗口 close 转换为 hide，应用、Runtime 和 Listener 继续运行。

## 设计原因

Application Identity 属于 Electron Main Process 的宿主职责。独立模块只处理 macOS 名称、Dock 和菜单，避免把平台身份写入 Runtime。生命周期仍由 DesktopLifecycleManager 单点编排，菜单不会形成第二套退出路径。

## 风险

- 当前仍是开发态 Electron 运行；macOS Dock 和最上层 Application Menu 标签来自宿主 `Electron.app` bundle，仍显示 Electron。内部菜单项、`app.name` 和产品配置为 Companion。要让系统标签也显示 Companion，必须在后续打包阶段生成 Companion `.app` bundle，本阶段不伪造这一结果。
- 尚未配置正式 bundle identifier。
- 当前继续使用 Electron 默认 Dock 图标。
- 不包含 Tray、Settings、安装包、签名或公证。

## 验证

### 自动验证

- `npm run typecheck`：PASS。
- `npm test`：PASS，56/56。
- `npm run desktop:build`：PASS。
- Application Menu 单元测试确认 Quit 委托统一 `requestQuit()`。
- 既有生命周期测试确认 Listener destroy、Runtime stop、Window destroy、Electron quit 顺序。
- 既有 single-instance 测试继续通过。

### 真实 macOS 验证

- Dock：PASS（Dock UI 中存在当前 Electron Host 项）；系统级 tooltip 仍显示 `Electron`，未伪报为 Companion。
- Application Menu：PARTIAL。实际菜单项为 About Companion、Hide Companion、Quit Companion；最上层应用菜单标题仍由开发宿主 bundle 显示为 Electron。
- Cmd+Tab：通过 `regular` activation policy 和可见 Dock 项具备切换条件；本次自动辅助功能验证未直接模拟 Cmd+Tab 轮换顺序。
- Cmd+W：PASS。辅助功能窗口计数从 1 变为 0，主进程保持运行；补充的标准 Window → Close command 正确进入 close→hide。
- Single Instance：PASS。隐藏后第二次执行启动命令以 code 0 退出，原进程窗口恢复为 1，没有第二个 Main Process。
- Cmd+Q：PASS。主启动命令以 code 0 结束。自动测试同时证明 Menu Quit 委托 requestQuit，并验证 Listener → Runtime → Window → app.quit 顺序。
- Relaunch：PASS。退出 PID 65450 后，新实例 PID 72519 成功创建；最终再次 Cmd+Q，并确认无该实例残留。
- Listener 真实运行：Desktop 启动成功且未报告 Listener startup error；未人为制造 CPU、Memory 或 Battery 事件，本阶段不把“无错误启动”扩张为系统事件触发验证。

## 结果

代码层已建立 Companion Application Name、Dock activation、Application Menu、Cmd+W 和统一 Quit 生命周期，Runtime/Listener/Event 架构保持不变。开发态已具备正常应用生命周期，但系统级 Dock/顶层菜单标签仍是 Electron Host；完整 `Companion` 系统身份需要后续 `.app` bundle 阶段完成。
