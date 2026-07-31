# Companion Desktop V1 Pet Window 与控制面板体验收口

## 背景

人工验收发现三个影响桌宠感的问题：

1. Pet Window 显著大于宠物本体，并渲染整窗渐变底板。
2. Settings 以完整独立窗口呈现，产品心智更像桌面设置应用。
3. “显示宠物”和“隐藏宠物”长期并列，没有表达当前状态。

本轮只调整 `apps/desktop` 的 Window、Panel、Renderer、Tray 与 IPC 协调，不修改 Runtime Core、Listener、Event、BehaviorSlot 或 Character Pack。

## 修改内容

### Pet Window

问题由四项叠加产生：

- `.desktop-shell` 渲染整窗渐变背景。
- 中号 Window 为 280×240，而 Viewer 只有 128px。
- 宠物通过 `right: 76px / bottom: 54px` 在大窗口内偏移。
- `#pet-stage` 占满整个大窗口，因此空白区域也参与命中和拖动。

修正后：

- Pet Shell、HTML 与 BrowserWindow 背景保持完全透明。
- 移除整窗背景板与不必要的圆角壳。
- 三档 Window 收紧为 112×112、148×148、184×184。
- Viewer 仍为 96px、128px、160px，外围只保留呼吸动画与轻微阴影需要的余量。
- 宠物在 Window 中居中，命中与拖动区域随窗口同步收紧。
- Character Asset、Viewer 切换和 Runtime 行为未改变。

### Settings 形态

保留独立安全 Renderer 和既有 Settings IPC，但承载窗口改为轻量控制 Panel：

- 420×620 固定小尺寸。
- 透明、无边框、深色玻璃拟态、置顶。
- 不进入 Taskbar/Mission Control。
- 首次 ready 后显示并聚焦。
- `Cmd+W` 或关闭请求时隐藏。
- 再次从 Tray 打开复用同一个 Panel，不创建第二个 Renderer 实例。
- Panel 不加载 `runtime.ts`，因此不会创建第二套 Runtime 或 Viewer。

内容压缩为当前伙伴、外观、角色、鼠标模式、显示控制、感知能力；Developer Mode 仅在 Development 模式可见。

### Show / Hide UX

事实源保持为 `SettingsIpcCoordinator.snapshot().petVisible`，直接读取 Pet BrowserWindow 的 `isVisible()`，没有增加重复状态或 Preferences 字段。

Panel 根据 Snapshot 动态呈现：

```text
Pet visible
→ 宠物显示中
→ 隐藏宠物

Pet hidden
→ 宠物已隐藏
→ 显示宠物
```

Tray 同样只显示一个符合当前状态的操作。DesktopLifecycleManager 在显示或隐藏后刷新 Panel Snapshot 和 Tray Menu。

## 设计原因

- Window 尺寸与 Viewer 尺寸直接关联，避免透明窗口仍占用过大的交互矩形。
- 保留 Settings Renderer 与 IPC Contract，可避免把 Electron 或 Runtime 内部能力暴露给 UI。
- Panel close-to-hide 保留唯一实例并符合临时控制面的使用心智。
- 可见状态只来自 WindowManager，避免 UI 状态与真实窗口状态漂移。

## 风险

- Electron Window 的命中区域仍是矩形，无法做到 PNG Alpha 像素级命中；当前通过紧缩矩形降低空白影响。
- Panel 固定在主显示器右上角，尚未实现附着 Tray 图标的精确定位。
- 开发态 Electron 从其他应用唤起 Panel 时不强制抢占前台；Panel 保持展示，用户点击后正常交互。
- 点击穿透仍需从控制面板恢复，尚无全局快捷键。
- Pet 保存位置可能位于其他显示器，单屏截图不能代表所有显示器上的真实位置。

## 验证

自动验证：

- `npm run typecheck`
- `npm test`
- `npm run desktop:build`
- `git diff --check`

真实 macOS 验收：

- 以 Production-like 模式启动真实 Electron。
- 通过 Tray 打开唯一控制面板。
- 检查 Panel 视觉、窗口数量、动态 Tray 操作和正常 Quit。
- 真实交互结果与未能覆盖的项目在最终结果中单独记录，不以自动测试替代。

## 结果

Pet Window 与控制面板的代码边界保持：

```text
Tray / Panel
→ Settings IPC / DesktopLifecycleManager
→ Pet Renderer
→ existing Companion Runtime
```

没有新增 Runtime、Listener 或 Character 依赖。

最终验证结果：

- TypeScript 检查通过。
- 自动测试 68/68 通过。
- Desktop build 通过。
- `git diff --check` 通过。
- 真实 Production-like Electron 可启动。
- Tray 在 Pet 显示时只显示“隐藏宠物”，并提供“打开控制面板”。
- 控制面板保持 420×620，无系统标题栏；等待后仍持续显示。
- 控制面板与 Pet Window 同时存在时只有两个 Renderer Window，没有第二套 Pet Runtime。
- 面板操作后可见状态从“宠物显示中 / 隐藏宠物”即时切换为“宠物已隐藏 / 显示宠物”，再次操作可恢复。
- Panel 获得焦点后 `Cmd+W` 只隐藏 Panel，Pet Window 和应用继续运行。
- 通过 macOS 正常 Quit 后 Companion Electron 主进程无残留。

Pet 位于已保存的另一显示器坐标，本轮主显示器截图没有覆盖该屏，因此“透明 Pet Window 无大背景板”和拖动命中仍需要用户在实际 Pet 所在显示器上进行最终肉眼确认。代码和窗口 Bounds 已确认从旧的 248–328px 范围收紧到 112–184px。
