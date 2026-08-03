# Behavior Reason Visualization V1

## 背景

Companion 已具备 ExternalEvent / UserCommand → Behavior → Action → Character 链路，但用户只能看到结果动作，无法判断动作由什么事实触发，也无法确认自己的 Control Surface 操作是否已经成为当前行为。

V1 增加行为原因可视化，只解释当前执行事实，不加入聊天、Personality 话术或 AI 生成内容。

## 修改内容

### Execution Context

`BehaviorExecutionContext` 增加可选 `reason`。同时新增只读 `ActiveBehaviorView`：

```text
Behavior Slot
Source
Trigger Name
Reason
Started At
```

BehaviorEngine 是唯一事实源。它根据当前 active execution 输出 `activeBehaviorView`，并通过 `activebehaviorchanged` 通知宿主。Renderer 不读取 Event、Queue 或 Character 推断原因。

Trigger 对用户命令使用 `GREET / CELEBRATE / ENCOURAGE / REST`，对系统输入使用 `TASK_RUNNING / TASK_SUCCESS / CPU_HIGH` 等事实名称。

### Reason 规则

V1 使用确定性事实映射，例如：

- `TASK_RUNNING`：正在执行任务。
- `TASK_SUCCESS`：任务执行成功。
- `CELEBRATE`：用户请求庆祝。
- `BATTERY_LOW`：设备电量较低。

未知输入只显示通用事实提示，不把内部 Trigger 直接暴露给 Production，也不生成拟人化内容。

### UI 设计

原因气泡位于现有 Pet Window 内、宠物上方：

- 不创建独立 BrowserWindow。
- 不属于 Control Surface。
- `pointer-events: none`，不接管宠物交互。
- IDLE 或没有 active execution 时隐藏。
- 临时 Behavior 随 recovery 自动隐藏或切换。
- 持续 SYSTEM Behavior 一直展示到下一条 SYSTEM 生命周期事件交接。

Pet Window 为气泡增加有限的顶部空间，透明背景、Character Asset 和现有 Runtime 实例保持不变。

### Developer Mode

Production 只显示用户可理解的 `reason`。

Development 额外显示：

- Behavior Slot
- Source
- Trigger

不展示 pending queue，避免把尚未执行的行为误报为当前行为。

## 设计原因

原因归属 Runtime，而不是 Viewer：

```text
Input
  ↓
BehaviorEngine currentExecution
  ↓
ActiveBehaviorView
  ↓
Pet Renderer 气泡
```

这样保持 Listener、ExternalEvent、UserCommand、ActionResolver 与 Character Pack 不变，也保证气泡与 Behavior Ownership / Queue 使用同一 active execution 事实源。

## 风险

- V1 原因表是确定性中文事实文案，尚未提供本地化配置。
- 未知扩展事件使用通用提示；未来 Adapter 可增加独立 Reason 元数据边界，但本轮不扩展 Event Contract。
- Pet Window 为气泡增加了透明顶部区域，需在真实 macOS 上继续确认位置、点击和拖动手感。
- 本轮不展示 queued/rejected 提示；气泡只表示当前执行行为。

## 验证

自动验证覆盖：

- USER CELEBRATE 输出“用户请求庆祝”。
- TASK_RUNNING 持续输出“正在执行任务”。
- TASK_SUCCESS 接替 TASK_RUNNING 后更新为“任务执行成功”。
- SYSTEM TASK_RUNNING 执行期间，queued USER CELEBRATE 不改变气泡。
- Pet Window 只有一个原因区域，并且不接收指针事件。
- IDLE / recovery 不输出 ActiveBehaviorView。

执行：

- `npm run typecheck`
- `npm test`
- `npm run desktop:build`
- `git diff --check`

## 结果

自动验证：

- `npm run typecheck`：PASS。
- `npm test`：PASS，82/82。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

真实 macOS 验证：本轮尝试启动 Desktop，但环境中已有 Companion 实例，本次进程被 Single Instance 机制正常拒绝，未创建第二个 Pet Window。为避免关闭或接管用户现有实例，没有强制终止旧进程。因此气泡位置、透明背景、点击/拖动手感、Panel 并行打开和真实 Action 切换仍标记为待人工验收，未将自动测试结果冒充真实视觉验证。

---

## 2026-08-01 Behavior Feedback Visibility 审查

### 审查范围

本次只读审查 `PetBehaviorEngine → activebehaviorchanged → Desktop Renderer → behavior-reason DOM/CSS`，没有修改 Runtime、Renderer 或测试代码。

### 1. activebehaviorchanged 是否触发

结论：**代码路径 PASS，动态测试覆盖不足。**

`PetBehaviorEngine.#emitActiveBehaviorChanged()` 在以下位置调用：

- 新 execution 写入 `#activeExecution` 后。
- Behavior apply 失败并清空 active execution 后。
- recovery 完成并清空 active execution 后。
- persistent SYSTEM handoff 清空旧 execution 后。
- Runtime stop 清空 active execution 后。

事件通过同步 `EventTarget.dispatchEvent()` 发出，detail 来自当时的 `activeBehaviorView`。queued / rejected 不调用该事件，因此不会把 pending behavior 当成当前行为。

现有测试断言了 `activeBehaviorView` 的内容，但没有注册 `activebehaviorchanged` listener 并断言事件次数、顺序和 detail。

### 2. Renderer 是否收到

结论：**正常初始化链路 PASS，端到端自动证据不足。**

Desktop Runtime 与 BehaviorEngine 位于同一个 Renderer，未经过 Main IPC。Renderer 在创建并启动 Runtime 后，对同一个 `context.behaviorEngine` 注册 `activebehaviorchanged` listener，handler 直接调用 `renderBehaviorReason(detail.activeBehavior)`。

监听注册晚于 `runtime.start()`，但注册后立即调用一次 `renderBehaviorReason(context.behaviorEngine.activeBehaviorView)`，可补偿初始化期间的当前状态快照。卸载时会移除 listener。

现有 Desktop 测试只验证 HTML 中存在一个气泡和 CSS `pointer-events: none`，没有执行 Renderer、派发真实事件并检查 `hidden/textContent`，所以“动态 DOM 确实更新”目前是代码事实，不是端到端测试事实。

### 3. 气泡显示条件

结论：**规则明确，基本符合当前 active-only 设计。**

Runtime 仅在以下条件同时成立时输出 `ActiveBehaviorView`：

- 存在 `#activeExecution`。
- `behaviorSlot !== IDLE`。
- execution context 存在 reason。

Renderer 收到非空 view 后写入 reason、Behavior Slot、Source、Trigger，并设置 `hidden = false`。Production 通过 `.development-only` 隐藏调试字段，只保留 reason。

因此 USER `REST → IDLE` 即使拥有 600ms Behavior duration，也不会显示原因；这是 IDLE 隐藏规则的直接结果。

### 4. 显示 duration

结论：**NEEDS_ADJUSTMENT。当前没有独立 Feedback duration。**

气泡没有自己的 timer。展示时长完全取决于 active Behavior 生命周期：

| 输入 | Behavior duration | 实际气泡规则 |
|-|-:|-|
| TASK_RUNNING / TASK_START | 无 | 持续到下一次 SYSTEM handoff、stop 或错误 |
| TASK_SUCCESS | 3000ms | apply 开始前显示，apply 完成后再计时 3000ms |
| TASK_ERROR | 5000ms | apply 开始前显示，apply 完成后再计时 5000ms |
| CPU_HIGH | 3000ms | 同上 |
| MEMORY_PRESSURE / BATTERY_LOW | 5000ms | 同上 |
| GREET | 1200ms | 小于原设计建议的 2 秒，且额外包含 apply 时间 |
| CELEBRATE | 3000ms | 额外包含 apply 时间 |
| ENCOURAGE | 1800ms | 小于原设计建议的 2 秒，且额外包含 apply 时间 |
| REST | 600ms | 因 IDLE 过滤，实际不显示 |

`activebehaviorchanged` 在 `#applyBehavior()` 之前发出，而 recovery timer 在 `await #applyBehavior()` 完成后才创建。因此可见时间约为：

```text
Action preload / transition 时间 + Behavior duration
```

它不是严格的 Behavior duration，也不是独立的 2–5 秒 Feedback duration。

### 5. hide 条件

结论：**大部分 PASS，存在切换闪烁与异步竞态风险。**

气泡在以下情况隐藏：

- active execution 不存在。
- active slot 为 IDLE。
- reason 缺失。
- Runtime stop。
- Behavior apply 失败。
- recovery 清空 execution。
- persistent SYSTEM handoff 先清空旧 execution。

SYSTEM handoff 会先发一次 `activeBehavior: undefined`，随后 queue drain 启动下一行为并再次显示，因此 TASK_RUNNING → TASK_SUCCESS 之间可能出现一次短暂隐藏/闪烁。

另一个风险位于 recovery：代码先异步执行 `changeBehavior(IDLE)`，之后才检查该 recovery 是否仍属于当前 execution。若 recovery 已经开始、同时新 execution 替换旧 execution，旧 recovery 仍可能先写入 StateMachine / Viewer，之后才因 identity 不匹配退出。此时气泡可能显示新 reason，而宠物状态短暂被旧 recovery 改为 IDLE。

### 6. Behavior 生命周期与 Feedback 是否混淆

结论：**职责边界未混淆，但时间模型发生了耦合。**

正确部分：

- BehaviorEngine 决定当前 execution 和 reason。
- Renderer 只显示 Runtime 输出，不推断 Event、Queue 或 Action。
- pending queue 不进入气泡。
- Feedback 不参与 Behavior 调度。

偏差部分：

- Feedback 没有独立展示生命周期，直接以 active execution 是否存在作为唯一开关。
- 显示发生在 Action commit 前，隐藏由 Behavior recovery 驱动。
- UX 所需的最短/最长展示时间没有独立表达。
- Behavior handoff 的内部清空步骤直接暴露为 UI 短暂隐藏。

因此架构职责仍然清晰，但“执行生命周期”与“视觉反馈生命周期”没有被建模为两个不同概念。

### 风险结论

| 项目 | 状态 | 说明 |
|-|-|-|
| activebehaviorchanged 触发路径 | PASS | start / recover / stop / error / handoff 均有调用 |
| Renderer 订阅链路 | PASS | 同 Renderer、同 BehaviorEngine 实例 |
| active-only 展示 | PASS | pending queue 不展示 |
| duration 准确性 | FAIL | 无独立 Feedback timer，实际时长包含 Action apply 延迟 |
| hide 完整性 | NEEDS_ADJUSTMENT | handoff 可闪烁，异步 recovery 有过期写入风险 |
| 自动测试证据 | NEEDS_ADJUSTMENT | 缺少事件次数与 Renderer DOM 动态更新测试 |
| 生命周期职责边界 | PASS | Renderer 未参与 Behavior 决策 |
| 生命周期时间解耦 | FAIL | Feedback 完全绑定 active execution 生命周期 |

### 最终判断

当前实现不是“气泡完全不可达”，而是：**主链路存在且正常条件下会显示，但 duration、handoff 连续性和异步 recovery 一致性尚不足以证明 Behavior Feedback 稳定可靠。**

审查状态：`BEHAVIOR_FEEDBACK_STATUS: NEEDS_ADJUSTMENT`。
