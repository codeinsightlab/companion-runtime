# Companion Control Panel Interaction Polish V1

## 背景

上一阶段已将完整 Settings Window 收敛为单实例浮动 Panel，但人工验收仍发现三个产品问题：

1. Panel 整体的玻璃滤镜形成灰暗矩形，视觉上接近 Modal 遮罩。
2. 固定高度配合 `overflow: hidden`，迫使卡片、字体和角色预览整体压缩。
3. Panel 使用主显示器固定坐标，与当前 Pet Window 缺少空间关系。

本轮仅治理 Desktop Window/Panel 与 Settings Renderer，不修改 Runtime、Listener、Event、Behavior Slot、Character 或 Profile。

## 修改内容

### Overlay 移除

- Settings Renderer 移除整页 `backdrop-filter`。
- Panel BrowserWindow 保持 `transparent: true`、无边框和非 Modal，不创建 parent/overlay window。
- Panel 自身保留深色半透明背景、圆角和阴影，用局部容器表达玻璃效果。

### Position Anchor

新增 `PanelController`，统一负责 Panel 的创建、显示、隐藏、定位和销毁。

每次 `show()` 都读取 Pet Window 当前 Bounds，并按以下规则计算：

```text
petCenterX = pet.x + pet.width / 2
panel.x = petCenterX - panel.width / 2
panel.y = pet.y - panel.height - gap
```

水平方向会限制在当前显示器 workArea 内。垂直方向优先放在 Pet 上方；上方不足时放到下方；两侧都不足时选择空间更充足的一侧，并将 Panel 收敛到 workArea。

### 多显示器

Desktop 使用 Electron `screen.getDisplayMatching(petWindow.getBounds())` 取得 Pet 所在 Display，而不是读取 primary display。Panel 的定位和边界限制均使用该 Display 的 `workArea`，因此支持负坐标、外接显示器和不同工作区尺寸。

### UI 布局恢复

- Panel 默认尺寸调整为 460×720。
- Settings 页面恢复更舒展的卡片间距、伙伴预览、尺寸选择和角色卡。
- 内容容器使用纵向滚动；显示器高度不足时缩小 Window Bounds，但不压缩内容层级。
- 保留当前伙伴、外观、角色、鼠标交互、显示控制、感知能力以及仅 Development 可见的 Developer Mode。
- 显示控制继续由 `petVisible` 驱动，只展示当前状态和一个相反操作。

### 生命周期

- `WindowManager` 继续负责 Desktop Window 总体生命周期。
- `PanelController` 只负责 Panel 行为，不访问 Runtime、Listener 或 PetManager。
- close 事件转换为 hide；再次打开复用同一 BrowserWindow。
- 应用统一退出时由 WindowManager 触发 Panel destroy。
- Panel 打开只执行一次定位、show 和 focus，不重复初始化 IPC 或 Runtime。

## 设计原因

Panel 与 Pet 的空间锚定比固定屏幕坐标更符合“桌面伙伴气泡菜单”的产品心智。把定位规则抽成纯计算函数和独立控制器，可在不改变 IPC/Runtime 边界的情况下覆盖多屏、边界回退和生命周期测试。

## 风险

- Electron BrowserWindow 的命中区域仍是矩形；透明区域不会成为真正的非矩形 Native Window。
- 当 Pet 靠近显示器中部且 Panel 高于上下两侧可用空间时，Panel 会贴近 workArea 边界，这是避免跨屏或裁切的明确回退。
- 不同 macOS 显示缩放组合仍需人工验证视觉位置。

## 验证

自动验证：

- `npm run typecheck`
- `npm test`
- `npm run desktop:build`
- `git diff --check`

测试覆盖：

- Panel 与 Pet 水平中心对齐。
- 上方空间不足时向下翻转。
- 使用 Pet 所在的非主显示器 workArea。
- 小工作区内收敛尺寸与坐标。
- Panel 单实例复用、close-to-hide 与 destroy。
- CSS 不包含 Modal overlay/backdrop filter。

自动结果：

- `npm run typecheck`：PASS。
- `npm test`：PASS，71/71。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。

真实 macOS 验证：

- Production-like 模式成功启动，Pet Window 位于外接显示器。
- 从 Tray 打开 Panel 后，系统观察到一个 460×720 Panel 和一个 184×184 Pet Window；Panel 位于 Pet 上方且处于同一外接显示器。
- 截图确认桌面其余区域没有灰色遮罩；Panel 仅显示自身深色容器、阴影和圆角。
- 实际滚动后可从上方伙伴卡滚动至下方感知能力区域，卡片尺寸和间距未被固定高度压缩。
- `Cmd+W` 后 Panel 隐藏，Pet 与应用继续运行；再次从 Tray 打开仍只有 Panel 与 Pet 两个 Renderer Window。
- `Cmd+Q` 后 Electron 退出，未观察到 Companion Electron 残留进程。

本次未移动用户当前 Pet 的已保存位置，因此 MacBook 内屏定位仅由自动测试覆盖；外接显示器为真实运行验证。内屏视觉位置仍需后续人工验收，未记为真实 PASS。

## 结果

Panel 的产品形态由固定位置的小型 Settings Window 收敛为跟随 Pet 的 Floating Panel：

```text
Tray / Pet Interaction
        ↓
PanelController
        ↓
Settings IPC
        ↓
Desktop Coordinator / Pet Renderer
```

现有 Runtime 与 Listener 数据链路保持不变。
