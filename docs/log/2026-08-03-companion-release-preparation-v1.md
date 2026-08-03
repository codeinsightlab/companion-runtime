# Companion Release Preparation V1

## 背景

Companion V1 进入 macOS Preview Release 准备阶段。本轮只增加 Packaging、Production Logging 与 Release metadata，不调整 Runtime、Listener、Event、Behavior、ActionResolver 或 Character 架构。

## 修改内容

- 版本统一为 `0.1.0-preview`。
- Electron Builder 生成独立 `Companion.app`。
- 固定 Bundle Identifier：`io.codeinsightlab.companion`。
- 新增 Companion Preview 图标与 ICNS。
- 新增统一 JSON Lines File Logger。
- Renderer 通过受限 IPC 上报 Behavior transition 和 Feedback 元数据。
- 新增 macOS Preview Release Guide。

## 日志设计

目录：`~/Library/Application Support/Companion/logs/`

- Level：INFO、WARN、ERROR。
- 单文件：2 MiB。
- 文件数：当前文件加 4 个历史文件。
- Retention：14 天。
- 内容：Application、Tray、Window、Listener lifecycle，ExternalEvent 名称、UserCommand、Behavior Slot、Feedback 元数据。
- 隐私：不写 Event payload、文件内容或凭据；字符串进行换行清理、长度限制和常见 credential pattern 脱敏。

## 风险

- Preview `.app` 未使用 Developer ID 签名和 Apple 公证。
- 当前只生成目录型 `.app`，不生成 DMG。
- 真实 Dock、Tray、Panel 与 Quit 必须在本机启动产物后人工确认。

## 验证

自动验证：

- `npm run typecheck`：PASS。
- `npm test`：PASS，94/94。
- `npm run desktop:build`：PASS。
- `git diff --check`：PASS。
- `npm run desktop:package`：PASS，生成 arm64 `Companion.app`。
- Info.plist：Product Name、Display Name 均为 Companion；Bundle Identifier 为 `io.codeinsightlab.companion`；版本为 `0.1.0-preview`。
- App 资源：`app.asar`、ICNS、Pet/Settings HTML、preload、Character Asset 和 Runtime config 均已打包。

真实 macOS 验证：

- 启动 `.app`：PASS，独立 Companion 进程存在。
- Application Menu：PASS，桌面截图确认顶部应用名为 Companion。
- Tray 初始化：PASS，Production 日志记录 `tray.created success=true`。
- Listener 启动：PASS，日志记录 2 个 Listener started。
- 标准 Quit：PASS，通过 macOS application quit 进入统一 lifecycle，记录 Listener stopped、Behavior inactive、shutdown complete，随后进程停止。
- 重启日志追加：PASS，日志大小由 945 bytes 增长至 1512 bytes，原记录保留。
- Settings/Panel：自动测试 PASS；本轮未执行真实鼠标点击，不标记为人工验证。
- Dock 图标与 Pet 视觉：应用成功以 regular identity 启动并可截图；尚需用户最终目视验收图标清晰度和宠物位置。

签名状态：仅 Electron 可执行文件的 ad-hoc/linker signature，未使用 Developer ID，未公证。

## 结果

Preview `.app`、Production Logger 和 Release metadata 已完成。创建 Release commit/tag 前仍需确认最终 Git diff，并保留未签名 Preview 风险说明。
