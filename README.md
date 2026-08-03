# Companion

**Companion is a Desktop Companion Runtime.**

Instead of only playing animations, Companion connects external events, behavior decisions, character actions, and visible explanations into a small desktop runtime. The current Preview runs as a macOS desktop companion built with TypeScript and Electron.

> Current release: `v0.1.0-preview` · macOS Preview · unsigned and not notarized

## Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [V1 Preview Features](#v1-preview-features)
- [Getting Started](#getting-started)
- [Build the macOS App](#build-the-macos-app)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Project Status](#project-status)
- [中文说明](#中文说明)

## Overview

Companion explores a different approach to desktop companions:

```text
Sense an external event
        ↓
Interpret it as behavior
        ↓
Resolve a character action
        ↓
Show both the action and its reason
```

The project is a runtime and desktop host—not an AI agent platform, an autonomous life form, or a replacement for an assistant. Its purpose is to provide a clear, extensible boundary between external inputs and a companion's visual response.

## Architecture

```text
External Source                          User Interaction
      ↓                                        ↓
Listener                                 User Command
      ↓                                        │
ExternalEvent                                 │
      ↓                                        │
Event Mapping ─────────────────────────────────┘
      ↓
Companion Runtime
      ↓
Behavior Engine
      ↓
Behavior Slot
      ↓
Action Resolver
      ↓
Character Pack
      ↓
Viewer + Behavior Feedback
```

### Listener

Listeners observe the outside world and emit factual `ExternalEvent` values. They do not select pets, actions, or assets.

The macOS Preview includes system listeners for:

- sustained high CPU usage;
- native macOS memory pressure;
- low battery state.

The boundary can support other sources—such as Git, IDEs, Codex, or calendars—without adding host-specific logic to the Runtime. These integrations are possible extensions, not V1 features.

### Behavior System

Companion does more than map an event directly to an image. The Behavior system includes:

- separate contracts for System Events and User Commands;
- Behavior Slots: `IDLE`, `THINKING`, `EXECUTING`, `SUCCESS`, and `ERROR`;
- execution ownership for `USER` and `SYSTEM` behavior;
- latest-wins replacement for rapid User Commands;
- FIFO queuing and protection for active System behavior;
- duration, recovery, cooldown, and stale-timer protection.

Character Packs decide how a Behavior Slot is expressed. The Runtime does not hard-code a character or PNG filename.

### Feedback System

Actions can be accompanied by a factual explanation so users can understand why the companion moved. Examples include:

- `正在执行任务` — a task is running;
- `任务执行成功` — a task completed successfully;
- `设备电量较低` — the device battery is low;
- `用户请求庆祝` — the user requested a celebration.

Temporary and persistent Feedback have lifecycles independent from animation recovery. Ambient breathing remains intentionally quiet and does not produce a notification.

## V1 Preview Features

### Desktop Application

- macOS Electron application with a transparent pet window;
- single-instance lifecycle;
- Dock identity and macOS Application Menu;
- menu bar Tray controls;
- reusable floating Control Panel;
- explicit show, hide, and graceful quit flows.

### Character System

- self-describing Character Manifests;
- configurable Behavior Slot → Action resolution;
- User Profile overrides;
- Sasuke, Naruto, and Itachi Preview Character Packs;
- multiple expressions and transparent PNG assets.

### Interaction

- User Commands for greeting, celebration, encouragement, and rest;
- runtime character switching;
- small, medium, and large pet sizes;
- draggable and click-through interaction modes;
- visible Behavior reasons.

### Developer Features

- Development Mode with internal status information;
- System Event Simulator for CPU, memory, battery, and task events;
- Browser Demo for Runtime-level verification.

### Engineering

- strict TypeScript and ES Modules;
- Electron with isolated, sandboxed Renderers;
- automated Runtime, Listener, Desktop, lifecycle, and logging tests;
- structured Production logs with size-based rotation and retention cleanup;
- reproducible arm64 macOS `.app` packaging.

## Getting Started

### Requirements

- macOS for the Desktop Preview and `.app` packaging;
- Node.js 22 (the currently validated development version);
- npm 10 or later.

Other Node.js versions have not yet been declared as supported for this Preview.

### Install

```bash
npm install
```

### Run the Desktop App

Development Mode:

```bash
npm run desktop:start
```

Production-like Mode without developer controls:

```bash
npm run desktop:start:production
```

### Validate the Project

```bash
npm run typecheck
npm test
npm run desktop:build
```

### Run the Browser Demo

```bash
npm run demo
```

Open `http://127.0.0.1:4173/examples/browser-demo/`.

## Build the macOS App

```bash
npm run desktop:package
```

On an Apple Silicon Mac, the output is:

```text
release/mac-arm64/Companion.app
```

Launch it with:

```bash
open release/mac-arm64/Companion.app
```

The Preview uses Product Name `Companion` and Bundle Identifier `io.codeinsightlab.companion`. It is not signed with an Apple Developer ID and is not notarized, so Gatekeeper may restrict first launch on another Mac.

Production logs are written to:

```text
~/Library/Application Support/Companion/logs/companion.log
```

See the [macOS Preview Release Guide](docs/release/macos-preview-release-guide.md) for packaging and verification details.

## Project Structure

```text
companion-runtime/
├── apps/desktop/           # Electron host, Control Panel, IPC and lifecycle
├── packages/core/          # Event, Behavior, Profile, Character and Runtime
├── packages/listeners/     # Listener contracts and macOS implementations
├── characters/             # Independent Character Packs and assets
├── examples/browser-demo/  # Browser Runtime demonstration
├── docs/                   # Architecture, reviews, logs and release guides
└── scripts/                # Build tooling
```

## Contributing

Contributions should preserve the project boundaries:

- Listeners observe and emit `ExternalEvent`; they do not control pets.
- User interfaces send User Commands; they do not select Actions directly.
- Runtime resolves Behavior; it does not know platform APIs or PNG files.
- Character Packs own Actions and assets.

Before opening a change, run:

```bash
npm run typecheck
npm test
npm run desktop:build
git diff --check
```

V1 is frozen for real-use observation. New product ideas should be recorded for a later iteration instead of changing the Preview contracts casually.

## Project Status

- Version: `v0.1.0-preview`
- Architecture: V1 frozen
- Desktop host: macOS Preview
- Packaging: arm64 `.app`
- Signing and notarization: not included

Potential future directions include more external listeners, richer Character behavior, and more personalized interactions. They are directions rather than committed release promises.

---

# 中文说明

**Companion 是一个桌面伙伴运行时。**

它尝试让桌宠不再只是循环播放动画，而是把外部事件、行为决策、角色动作和可见的行为原因连接成一个轻量 Runtime。当前 Preview 使用 TypeScript 与 Electron 构建，优先支持 macOS。

> 当前版本：`v0.1.0-preview` · macOS Preview · 未签名、未公证

## Companion 是什么

```text
感知外部事件
    ↓
理解为伙伴行为
    ↓
解析角色动作
    ↓
展示动作与行为原因
```

Companion 不是 AI Agent 平台，不是“自主生命”，也不试图替代智能助手。它的目标是在外部输入与桌面伙伴表达之间提供清晰、可扩展的运行边界。

## 架构说明

```text
外部来源                               用户交互
   ↓                                     ↓
Listener                           User Command
   ↓                                     │
ExternalEvent                           │
   ↓                                     │
Event Mapping ───────────────────────────┘
   ↓
Companion Runtime
   ↓
Behavior Engine
   ↓
Behavior Slot
   ↓
Action Resolver
   ↓
Character Pack
   ↓
Viewer + Behavior Feedback
```

### Listener

Listener 只负责感知外部世界并输出事实型 `ExternalEvent`，不选择宠物、不决定 Action，也不操作资源。

macOS Preview 当前实现：

- 持续高 CPU 感知；
- macOS 原生 Memory Pressure 感知；
- 低电量感知。

Git、IDE、Codex、Calendar 等来源可以沿相同边界扩展，但它们不是 V1 已完成功能。

### Behavior System

宠物行为不是简单的“事件触发一张图片”。当前 Behavior 系统包含：

- System Event 与 User Command 两种输入契约；
- `IDLE`、`THINKING`、`EXECUTING`、`SUCCESS`、`ERROR` 五个稳定 Behavior Slot；
- `USER` 与 `SYSTEM` 行为所有权；
- User Command 快速输入的 latest-wins 策略；
- System Behavior 的保护与 FIFO 队列；
- duration、recovery、cooldown 和旧 timer 竞争保护。

Character Pack 决定同一个 Behavior Slot 如何表现。Runtime 不硬编码具体角色或 PNG 文件名。

### Feedback System

宠物执行动作时可以展示事实原因，让用户知道动作为什么发生。例如：

- 正在执行任务；
- 任务执行成功；
- 设备电量较低；
- 用户请求庆祝。

Temporary 与 Persistent Feedback 拥有独立生命周期，不依赖动画 recovery。呼吸等 Ambient Motion 不表达业务事实，因此保持安静，不显示提示。

## V1 Preview 已实现能力

### Desktop Application

- macOS Electron 应用与透明宠物窗口；
- 单实例运行；
- Dock 身份与 macOS Application Menu；
- 菜单栏 Tray；
- 可复用 Floating Control Panel；
- 明确的显示、隐藏与完整退出流程。

### Character System

- 自描述 Character Manifest；
- 可配置的 Behavior Slot → Action 解析；
- User Profile 行为覆盖；
- Sasuke、Naruto、Itachi Preview Character Pack；
- 多种角色表情和透明 PNG 资源。

### Interaction

- 打招呼、庆祝、鼓励、休息等 User Command；
- 运行时角色切换；
- 小、中、大三档宠物尺寸；
- 拖动与点击穿透模式；
- 可见的行为原因。

### Developer Features

- Development Mode 与内部状态信息；
- CPU、Memory、Battery、Task Event Simulator；
- Browser Demo。

### Engineering

- strict TypeScript 与 ES Module；
- 隔离、Sandboxed Electron Renderer；
- Runtime、Listener、Desktop、Lifecycle 和 Logger 自动测试；
- 支持文件滚动与过期清理的 Production Logger；
- 可重复生成的 arm64 macOS `.app`。

## 快速开始

### 环境要求

- Desktop Preview 与 `.app` 打包需要 macOS；
- Node.js 22（当前已验证版本）；
- npm 10 或更高版本。

当前 Preview 尚未声明其他 Node.js 版本为正式支持范围。

### 安装与运行

```bash
npm install
npm run desktop:start
```

Production-like 模式：

```bash
npm run desktop:start:production
```

### 检查与构建

```bash
npm run typecheck
npm test
npm run desktop:build
```

### Browser Demo

```bash
npm run demo
```

浏览器打开 `http://127.0.0.1:4173/examples/browser-demo/`。

## 打包 macOS Application

```bash
npm run desktop:package
```

Apple Silicon Mac 默认输出：

```text
release/mac-arm64/Companion.app
```

启动：

```bash
open release/mac-arm64/Companion.app
```

Preview 的 Product Name 为 `Companion`，Bundle Identifier 为 `io.codeinsightlab.companion`。当前未使用 Apple Developer ID 签名，也没有进行公证，因此复制到其他 Mac 后可能受到 Gatekeeper 限制。

Production 日志位置：

```text
~/Library/Application Support/Companion/logs/companion.log
```

完整流程见 [macOS Preview Release Guide](docs/release/macos-preview-release-guide.md)。

## 参与开发

参与开发时请保持现有职责边界：

- Listener 感知外部事实，不控制宠物；
- UI 发送 User Command，不直接选择 Action；
- Runtime 解析 Behavior，不依赖平台 API 或 PNG；
- Character Pack 管理 Action 和资源。

提交前执行：

```bash
npm run typecheck
npm test
npm run desktop:build
git diff --check
```

V1 当前进入真实使用观察期。新的产品想法建议记录到后续版本，而不是随意改变 Preview 已冻结的契约。

## 当前状态

- 版本：`v0.1.0-preview`
- 架构：V1 Freeze
- Desktop：macOS Preview
- 打包：arm64 `.app`
- 签名与公证：未包含

后续可能扩展更多外部 Listener、更丰富的 Character Behavior 和更个性化的互动体验。这些是探索方向，不是已经承诺的发布时间表。
