# Desktop Tray & Minimal Settings Shell V1

## 背景

Desktop Foundation 与 Identity 已建立单实例、窗口隐藏/恢复和统一退出，但用户仍缺少持续可见的控制入口。关闭宠物后只能依赖重新激活应用；角色、尺寸和 Listener 状态也没有安全的桌面控制面。

本阶段增加 Tray 与最小 Settings，不扩展 Runtime、Event、Behavior、Character Manifest 或 Listener Interface。

## 架构边界

```text
macOS Tray
→ DesktopLifecycleManager
→ WindowManager

Settings Renderer（无 Runtime）
→ isolated preload
→ Settings IPC Coordinator（Main）
├── userData Profile / Preferences
├── ListenerManager public state
└── Pet Renderer notification
        ↓
Pet Renderer（唯一 Runtime）
→ PetManager public API
```

- Tray 属于 Desktop Shell，只调用 show/hide/settings/quit 高层入口。
- Settings 是独立 Renderer，不加载 `runtime.ts`。
- Companion Runtime 仍只存在于 Pet Renderer。
- ListenerManager 与 macOS Listener 仍只存在于 Main。
- `Listener → ExternalEvent → Mapping → Runtime → Current Pet` 保持不变。

## Tray

TrayManager 持有唯一 Tray 引用，重复 `create()` 不重复创建，`destroy()` 幂等。菜单包括：显示宠物、隐藏宠物、打开设置、退出 Companion。

图标使用代码生成的 18×18 monochrome bitmap，并设置为 macOS Template Image，避免使用 Character Pack 版权角色。真实验证发现 Electron 当前组合不能从 SVG 创建 NativeImage，因此改用原生 bitmap；Tray 创建失败仍被隔离，不阻止 Runtime 启动。

菜单动作捕获同步与异步错误。Quit 只调用 `DesktopLifecycleManager.requestQuit()`。

## Settings Window

WindowManager 分别保存 Pet Window 与 Settings Window。Settings：

- 使用标准有边框窗口，不透明、不置顶。
- 重复打开时复用并聚焦同一窗口。
- 普通 close 销毁 Settings，下次重新创建。
- Quit 时在 Pet Window 之前一并销毁。
- 加载独立 `settings.html` 和 `settings.ts`，不加载 Pet Runtime entry。

安全配置保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。统一 preload 根据 Main 注入的窗口类型只暴露对应桥接 API。

## Preferences

当前角色继续属于 User Profile；Desktop Preferences 只保存 `petSize`，避免两个当前角色事实源。

存储位于 Electron `userData`：

- `user-profile.json`
- `desktop-preferences.json`

Preferences 含最小 `version: 1` 边界。文件不存在时使用默认值，损坏 JSON 回退默认值并报告错误，写入采用 `.tmp` + rename，避免半写文件。持久化路径不进入仓库。

## Character Switching

链路：

```text
Settings select
→ validated Settings IPC
→ persist User Profile
→ Pet Renderer notification
→ PetManager.changeCharacter()
→ ProfileManager.switchCharacter()
→ current Behavior Slot re-render
```

现有 Runtime 已具备所需公开 API，因此未修改 Runtime Core。角色 ID 必须存在于 Main 已加载的 Character Manifest 列表；非法 ID 明确失败。

## Pet Size

固定档位集中定义：

| 档位 | Viewer | BrowserWindow |
|-|-:|-:|
| small | 96px | 248×208 |
| medium | 128px | 280×240 |
| large | 160px | 328×288 |

Main 同步调整 BrowserWindow 并重新定位到当前显示器右下可见工作区；Pet Renderer 通过 `PetManager.setSize()` 调整 Viewer，PNG 与宽高比不修改。重启时先读取 Preferences，再创建窗口和 Runtime。

## Listener Status

CPU 与 Memory 状态来自已注册 `macos-system` Listener 的公共 lifecycle state；Battery 来自 `macos-battery` state。Desktop 启动时通过公开 `MacBatteryStatusProvider.sample()` 做一次设备可用性探测，无电池时显示“不可用”。Settings 不访问 timer、ChildProcess 或采样内部状态。

状态映射：STARTED → 运行中；CREATED/DESTROYED → 已停止；manager 已运行但单 Listener STOPPED → 错误；未注册或 Battery 无设备 → 不可用。

## IPC Contract

Settings → Main：

- `companion:settings:get-snapshot`
- `companion:settings:set-character`
- `companion:settings:set-pet-size`
- `companion:settings:show-pet`
- `companion:settings:hide-pet`

Main → Settings：`companion:settings:updated`。

Main → Pet：`companion:character-changed`、`companion:pet-size-changed`，以及既有 ExternalEvent/Runtime stop。

Channel 名称集中定义，并由 Main 通过 `additionalArguments` 注入 sandbox preload；避免 preload require 本地模块。Settings handler 校验 sender 必须是当前 Settings webContents，输入角色与尺寸均验证，shutdown 时移除全部 handler。

## 生命周期

启动：

```text
Single Instance Lock
→ Application Identity
→ load Profile / Preferences
→ register IPC
→ Tray create
→ Pet Window create
→ Runtime ready
→ Listener start
```

退出：

```text
requestQuit()（共享 Promise）
→ Tray destroy
→ Listener destroyAll
→ Renderer Runtime stop
→ Settings + Pet Window destroy
→ IPC cleanup
→ app.quit()
```

Tray、Listener、Runtime 或 Window 某一步失败不会阻止后续清理。

## 验证结果

### Unit Test / Integration Test

- TypeScript strict typecheck：PASS。
- 全量测试：PASS，64/64（最终回归结果见任务回执）。
- Desktop build：PASS。
- `git diff --check`：PASS。
- 覆盖 Tray 幂等/失败隔离/动作路由、双窗口所有权、Preferences 默认/损坏/原子持久化、Profile 切换持久化、尺寸映射、Listener 状态及完整启动/退出顺序。

### Real macOS Verification

- 首次 SVG Tray 图标验证失败，错误被隔离；改为原生 Template bitmap 后真实 Tray 创建成功。
- Electron sandbox preload 拒绝相对 require，导致首次 Runtime ready timeout；改为 Main 注入 channel 后 Runtime 正常 ready，未降低 sandbox 安全配置。
- Tray：辅助功能树确认 Electron 进程有第二个 menu bar（唯一 Tray），菜单项完整。
- Show/Hide：Tray 隐藏后只剩 Settings Window；Tray 显示后恢复原 Pet Window，窗口数 1→2。
- Settings：真实显示独立 Companion 设置窗口；角色、三档尺寸、CPU/Memory/Battery 状态、显示/隐藏按钮完整可见。重复打开保持单一 Settings；close 后窗口数归零但 Main/Tray 继续，随后可重新创建。
- Listener：当前真实设备显示 CPU/Memory/Battery 均“运行中”；Battery availability 来自真实 pmset 采样。
- Single Instance：第二次生产态启动 exit code 0；实际只保留 PID 71327，一个 Tray 和既有 Pet/Settings 窗口。
- Profile persistence：真实 userData Profile 文件存在并在重启后显示已保存的 Naruto 选择。辅助功能自动化未可靠完成下拉选项变更，因此不把本轮手工操作描述为新的角色切换成功；代码链路由集成测试覆盖。
- Pet Size：真实 Settings 展示三档控制和当前 medium；辅助功能 AXPress 未能可靠触发 Web button，因此本轮没有把自动测试冒充为真实 small/large 点击结果。窗口/Viewer 同步和重启恢复由集成测试覆盖。
- Quit：Tray Quit 后启动命令 exit code 0，统一退出完成且验证实例无残留。

## 已知限制

- 尚未实现 Listener 开关、阈值配置、鼠标穿透、位置记忆、开机启动、自动更新。
- 尚未打包为正式 Companion.app，未签名或公证。
- 当前开发态系统级名称仍受 Electron.app bundle 限制。
- 尚未验证 Windows/Linux。
- 角色与尺寸的真实鼠标手工回归仍建议由用户在可交互桌面上各点击一次；自动化辅助功能对 Chromium select/aria-pressed button 的 AXPress 不稳定。

## 结果

Desktop 已形成可使用的 Tray 与独立 Settings 控制面，Profile/Preferences 可持久化，窗口、Runtime、Listener 和 IPC 仍由 DesktopLifecycleManager 统一编排。没有创建第二套 Runtime 或 ListenerManager，核心事件架构未变化。
