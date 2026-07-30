# Pet Interaction Foundation V1

## 背景

Desktop Control Surface V1 已建立单实例、Tray、Settings、WindowManager 与统一退出流程，但宠物仍固定在右下角，Desktop Preferences 也只保存尺寸。Pet Interaction Foundation V1 的目标是让用户能够移动宠物、恢复窗口位置并明确选择鼠标模式，同时沿用唯一 Runtime 与 Listener 链路。

## 修改内容

### Position

`DesktopPreferences` 增加可选 `petPosition`，包含 `x`、`y` 和可选 `displayId`。位置属于 Desktop 宿主窗口状态，不进入 User Profile、Character Manifest 或 Runtime。

`WindowManager` 监听宠物窗口 `move`，以 250ms debounce 合并位置变化，并在统一退出流程中刷新最后一个待保存位置。`DesktopPreferencesStore` 继续使用临时文件加 rename 的原子写入方式。

启动时优先恢复保存位置。目标显示器消失、分辨率变化或保存坐标不再与任何工作区相交时，Main Process 会将位置限制到可见工作区，必要时回退主屏右下角。

### Drag

Pet Renderer 只采集 pointer 位移，通过 `companion:pet:drag` IPC 发送增量。`PetInteractionIpcCoordinator` 验证发送方必须是当前 Pet Window，再委托 `WindowManager.movePetBy()` 更新 BrowserWindow。

Renderer 不访问 Electron、文件系统或 Preferences；拖动不会创建窗口、Runtime 或 Listener。

### Mouse Mode

`DesktopPreferences` 增加：

```json
{
  "mouseInteractionMode": "interactive"
}
```

可选值为 `interactive` 和 `click-through`。Settings 通过受控 IPC 更新配置，`WindowManager` 在 Main Process 内调用 `setIgnoreMouseEvents()`。点击穿透后仍可从独立 Settings Window 恢复可交互模式。

### Idle

项目原有 `BehaviorScheduler` 已具备单 Timer、重复调度清理和 `runtime.stop()` 停止能力，因此没有建立 Desktop 专属或第二套 Idle scheduler。

Idle 配置现在以 75/25 权重选择 `IDLE` 与 `TASK_START`。配置了 Event 的 Idle target 会先经过 `BehaviorResolver` 得到 `BehaviorSlot`，再由现有 `PetManager` / `ActionResolver` 选择当前 Character Action。Viewer 不随机选择 PNG，Listener 生命周期也不参与 Idle 调度。

## 设计原因

- Main Process 继续唯一负责 BrowserWindow、屏幕边界和持久化。
- Renderer 只负责 pointer 输入与点击反馈。
- Desktop Preferences 与 User Profile 分离，避免窗口状态污染角色个性化配置。
- 复用现有 Core Idle scheduler，避免双 Timer、双 Runtime 和宿主特有行为逻辑。

## 风险

- `click-through` 模式下宠物窗口无法接收鼠标输入，当前需通过 Settings 恢复，尚无全局快捷键。
- 自动测试覆盖位置模型、debounce、拖动位移、鼠标模式与 Idle 停止；多显示器热插拔和真实拖拽仍依赖 macOS 手工验证。
- 开发态 Electron 不是已签名 `.app`，系统级窗口行为可能与未来打包版本存在细微差异。

## 验证

自动验证：

- `npm run typecheck`：通过。
- `npm test`：68/68 通过。
- `npm run desktop:build`：通过。
- `git diff --check`：通过。

覆盖新增场景：

- Desktop Preferences 位置与鼠标模式保存、重载及非法坐标拒绝。
- WindowManager 拖动位移不创建第二窗口。
- 位置写入 debounce 与退出前 flush。
- interactive / click-through 切换。
- Idle Event 经 Behavior Resolver 转为 Slot，经当前 Action 链执行，stop 后不继续触发。

真实 macOS 验证：

- Production-like Desktop 在真实 macOS 上成功启动，宠物窗口和角色资源可见，且 Preferences 实际写入 `petPosition`、`displayId` 与 `interactive` 模式。
- 通过 Electron 标准 quit 事件退出后，启动进程正常结束；随后可再次启动并再次完成标准退出，没有遗留当前验证进程。
- 本轮尚未通过真实鼠标完成“拖动 → 退出 → 重启”的完整人工确认，因此不把 IPC/WindowManager 自动测试描述为手工拖动验证。
- 本轮未具备第二显示器环境，因此未验证显示器热插拔；已完成坐标修正代码和静态检查。
- 不将自动测试或 Mock 结果描述为真实设备交互结果。

## 结果

架构仍保持：

```text
Listener
→ ExternalEvent
→ Mapping
→ Runtime
→ Current Pet
```

新增交互链路独立为：

```text
Pointer Input
→ Preload IPC
→ PetInteractionIpcCoordinator
→ WindowManager
→ BrowserWindow / DesktopPreferences
```

未增加第二套 Runtime，未修改 Listener Interface、Event Contract、Behavior Slot 或 Character Manifest 核心设计。
