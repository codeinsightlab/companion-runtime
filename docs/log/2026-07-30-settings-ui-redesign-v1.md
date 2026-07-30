# Settings UI Redesign V1

## 背景

原 Settings 使用浅色表单、角色下拉框和 CPU / Memory / Battery 原始状态列表。功能完整，但产品重心落在配置与系统监控上，不符合 Companion“感知环境并通过宠物反馈”的桌面伙伴定位。

本轮参考项目 `image/15188a3c-0c5b-4cdf-84dc-60a21213bd11.png` 的信息层级、卡片布局和玻璃氛围，重新组织 Settings。没有复制参考图中的能量、电量、心情、活跃度或统计数据。

## 产品定位变化

旧层级：

```text
角色下拉框
→ 尺寸按钮
→ CPU / Memory / Battery
→ 窗口按钮
```

新层级：

```text
当前伙伴
→ 感知能力
→ 外观与角色
→ 桌面控制
→ Developer Mode
```

系统 Listener 仍然存在，但在 Production UI 中合并为“系统状态”，属于伙伴的感知能力，不再作为 Dashboard 主视觉。

## 设计语言

- 页面背景：`#0B0B0F`。
- 深灰层级：`#15151C`。
- 卡片：`#1C1C24`。
- 强调色：`#8B5CF6`、`#6366F1`。
- 主文字：`#FFFFFF`。
- 辅助文字：`#A1A1AA`。
- 使用细描边、柔和阴影、径向环境光和 `backdrop-filter` 构成克制的玻璃拟态。
- hover 与选择状态使用轻量位移、描边和渐变反馈；支持 `prefers-reduced-motion`。

## 页面结构

### 当前伙伴

Settings Snapshot 从当前 Character Manifest 提取 IDLE Action Asset URL。页面显示真实角色名称、ID 和预览图。

桌面状态只使用真实窗口可见性：

- `正在桌面陪伴`
- `当前已隐藏`

顶部运行状态来自 `RuntimeIpcCoordinator.isReady()`，不推测 Behavior、情绪或好感度。

### 感知能力

- 系统状态：由现有 CPU 与 Memory Listener 真实状态汇总。
- Git：即将支持。
- VS Code：未连接。
- Codex：未连接。

未实现能力仅作为静态路线占位，不注册 Listener，不调用 Runtime，也不报错。

### 外观与角色

- 尺寸由普通分段按钮改为 96px / 128px / 160px 卡片，仍调用原 `setPetSize()` IPC。
- 角色由下拉框改为带真实 IDLE Asset 的 Character 卡片，仍调用原 `setCharacter()` IPC。
- 鼠标交互保留 interactive / click-through 两种现有设置。

### 控制

保留显示宠物和隐藏宠物能力，使用产品化主次按钮表达。

### Developer Mode

- Development 模式默认折叠，可展开 Runtime、Event 入口说明和 CPU / Memory / Battery 原始 Listener 状态。
- Production-like 模式通过 Main Process 注入的 mode 隐藏整个 Developer Mode。
- 没有新增调试 Event、Runtime 状态或 Listener API。

## 架构影响

保持：

```text
Settings Renderer
→ Preload IPC
→ SettingsIpcCoordinator
→ Profile / Desktop Preferences
→ Pet Renderer
```

Settings Renderer 未访问 Electron、文件系统、Runtime、Listener 或 Character 对象。Snapshot 只增加可选角色预览 URL、宠物窗口可见性和 Runtime IPC ready 状态。

未修改 Runtime Core、Listener、ExternalEvent、Behavior Slot 或 Character Manifest。

## 未实现能力处理

- 能量、等级、心情、好感度、活跃度：隐藏。
- Git：显示“即将支持”。
- VS Code、Codex：显示“未连接”。
- Marketplace、账号、云同步：不展示且不实现。

## 风险

- 当前角色预览直接使用 Character Manifest 的 IDLE Asset；未来动画格式增加后，需要定义独立 Preview 能力，而不是假设所有 Asset 都适合静态预览。
- Settings 页面内容超过默认窗口高度，需要滚动；窗口允许 resize，宽度下限为 440px、高度下限为 620px。
- 当前没有真实 Behavior 状态的 Settings 查询契约，因此页面不显示 IDLE、Waiting、心情或最近 Event，避免制造假数据。

## 验证

自动验证：

- `npm run typecheck`：通过。
- `npm test`：68/68 通过。
- `npm run desktop:build`：通过。
- `git diff --check`：通过。

真实 macOS 验证：

- Production-like Companion 成功启动。
- 通过真实 Tray“打开设置”创建唯一 `500 × 720` Settings Window。
- 使用 CoreGraphics 定位 `Companion 设置` 窗口并完成窗口级截图检查。
- 已确认：深色玻璃布局、当前 Naruto 真实 Asset、运行状态、系统能力卡、Git / VS Code / Codex 占位和 Production Developer Mode 隐藏均正确渲染。
- 本轮未通过真实鼠标逐项点击角色卡、尺寸卡和显示/隐藏按钮；这些交互由现有 Coordinator 测试与 IPC 回归覆盖，不将其描述为人工点击结果。

## 结果

Settings 已从开发配置面板调整为桌面伙伴控制中心。现有功能和 IPC 路径保留，产品主视觉转向当前伙伴，未实现能力没有虚假数据。
