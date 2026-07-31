# Companion Control Surface V1

## 背景

上一阶段的 Floating Panel 已具备透明、单实例和可滚动能力，但定位仍依赖 Pet Window，交互内容仍主要是 Settings。人工验收确认最终产品需要两个清晰输入边界：

```text
External Input → ExternalEvent → Runtime
User Interaction → UserCommand → Runtime
```

本轮把 Panel 收敛为 Companion Control Surface：它负责配置、显示控制和表达用户意图，但不直接选择 Action 或 Asset。

## 修改内容

### Trigger Anchor

Panel 不再读取 Pet Window Bounds。Tray 菜单执行“打开控制面板”时读取 Tray Bounds，以底部中心作为 Trigger Point：

```text
trigger.x = tray.x + tray.width / 2
trigger.y = tray.y + tray.height
```

`PanelController` 根据 Trigger Point 调用 Electron `screen.getDisplayNearestPoint()` 取得 Display workArea。Panel 水平中心与 Trigger Point 对齐，默认出现在菜单栏下方；越界时限制在当前 workArea 内。

### Popover 生命周期

- `show(trigger)`：定位后显示并聚焦。
- `blur`：自动 hide。
- `close`：转换为 hide。
- reopen：复用相同 BrowserWindow 和 IPC。
- 应用退出：由现有 Desktop 生命周期统一 destroy。

Panel 不是 Modal，不包含 backdrop，不阻塞桌面。

### UserCommand Contract

新增 `UserCommand`：

```ts
interface UserCommand {
  readonly type: "USER_COMMAND";
  readonly name: "GREET" | "CELEBRATE" | "ENCOURAGE" | "REST";
  readonly payload?: Readonly<Record<string, unknown>>;
}
```

UserCommand 与 ExternalEvent 分离。Settings Renderer 只能发送 Command name，不能发送角色、Action 或 Asset。

### Runtime 接入

数据链路：

```text
Control Surface Button
        ↓
Settings IPC
        ↓
RuntimeIpcCoordinator
        ↓
Pet Renderer
        ↓
UserCommandAdapter
        ↓
CompanionEvent
        ↓
runtime.publish()
        ↓
BehaviorResolver → ActionResolver → Character
```

UserCommandAdapter 将 Command 转成命名空间明确的标准 Event，例如：

```text
CELEBRATE
    ↓
CUSTOM_EVENT:USER_COMMAND:CELEBRATE
    ↓
SUCCESS
```

当前映射：

| UserCommand | Behavior Slot |
|---|---|
| GREET | THINKING |
| CELEBRATE | SUCCESS |
| ENCOURAGE | EXECUTING |
| REST | IDLE |

Character 继续通过 Character Manifest 决定具体 Action 和 Asset。

### UI

控制面板新增“快速互动”区域：

- 打招呼
- 庆祝
- 鼓励
- 休息

按钮表达 User Intent，不包含任何角色名、Action ID 或资源路径。原有当前伙伴、外观、鼠标交互、显示控制、感知能力与 Development Mode 保持。

## 设计原因

Trigger Anchor 使 Panel 与用户实际操作入口建立空间关系，符合 macOS Popover 心智。独立 UserCommand Contract 则避免把用户主动操作伪装成 ExternalEvent，同时通过 Adapter 复用唯一 Runtime 行为链。

## 风险

- macOS Tray 使用原生 Context Menu，菜单项回调没有原始 click point；当前使用 Electron Tray `getBounds()` 的中心作为稳定触发锚点。
- Behavior Engine 的优先级、duration 与 cooldown 仍然生效，连续快速点击不保证每条 Command 都立即打断当前高优先级行为。
- 内屏和外接屏的 Tray Bounds 需要分别进行真实 macOS 验证。

## 验证

- `npm run typecheck`
- `npm test`
- `npm run desktop:build`
- `git diff --check`

自动测试覆盖 Trigger Point 定位、多 Display workArea、blur hide、reopen reuse、无 overlay、UserCommand 校验以及 UserCommand 经 Runtime publish 到 Behavior/Action。

自动结果：

- `npm run typecheck`：PASS。
- `npm test`：PASS，74/74。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

真实 macOS 验证：

- 在外接显示器上通过 Tray 打开了 460×720 Control Surface，视觉确认 Panel 位于菜单栏下方、无桌面遮罩，并显示完整伙伴/外观/控制内容。
- Production-like Renderer 参数确认包含独立 `userCommand` 与 `settingsSendUserCommand` IPC Channel。
- 验证期间显示器状态从双屏变化为仅一个活跃显示器，且当前屏幕截图返回黑屏；因此最终版本的 blur 自动隐藏、MacBook 内屏锚点和真实点击三种互动没有获得可信人工证据。
- blur hide、单实例复用、Trigger Display 选择和完整 UserCommand Runtime 链路均由自动测试覆盖，但不记为真实人工 PASS。

## 结果

代码、类型、构建和自动行为链满足 V1 基线要求。由于真实 macOS 验证未完整覆盖内屏、最终 blur 行为和快速互动点击，本轮不建议仅凭自动测试直接宣布 V1 Freeze；需要在显示器恢复后补一次短人工验收。
