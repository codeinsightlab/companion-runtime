# Companion Runtime

Companion Runtime is a framework for AI application companions. It provides a small browser-native runtime for character assets, state transitions, event mapping, behavior lifecycle rules, and personality-driven action selection.

This repository contains the frozen Ninja Pet Runtime V1 migrated from the temporary development workspace into an independent project.

## Architecture

```text
Host Application
↓
Adapter
↓
Companion Runtime
↓
Character Pack
↓
Viewer
```

Runtime modules live in `packages/core`. Character-specific Naruto assets live in `characters/naruto-pack`, so the core runtime does not depend on a concrete character pack.

## Features

- Event Adapter: maps host events to runtime states or character changes.
- Behavior Engine: handles priority, cooldown, duration, recovery, and idle behavior.
- Personality Engine: selects actions from character preferences with weighted random.
- Character System: maps characters, actions, states, and PNG assets through manifest config.
- Runtime State Machine: supports `IDLE`, `THINKING`, `EXECUTING`, `REVIEWING`, `SUCCESS`, and `ERROR`.
- Viewer: displays transparent PNG companions with fade and breathing animation.

## Project Structure

```text
companion-runtime/
├── packages/core/
│   ├── runtime/
│   ├── config/
│   └── tests/
├── characters/naruto-pack/
│   ├── sasuke/
│   ├── naruto/
│   └── itachi/
├── examples/browser-demo/
└── docs/
```

## Run Tests

```bash
npm test
```

## macOS Preview Release

生成未签名的 Preview `.app`：

```bash
npm install
npm run typecheck
npm test
npm run desktop:package
```

产物位于：

```text
release/mac*/Companion.app
```

Preview 版本使用固定 Bundle Identifier `io.codeinsightlab.companion`，Product Name 为 `Companion`。当前产物尚未签名或公证，首次启动可能受到 macOS Gatekeeper 限制。

Production 日志写入：

```text
~/Library/Application Support/Companion/logs/companion.log
```

日志采用 JSON Lines，单文件上限 2 MiB，最多保留 5 个文件，并清理 14 天前的历史日志。日志只记录生命周期、事件名称、行为槽和 Feedback 元数据，不记录 Event payload、文件内容、Token 或用户隐私数据。

完整发布步骤见 [Release Guide](docs/release/macos-preview-release-guide.md)。

## Run Browser Demo

```bash
npm run demo
```

Then open:

```text
http://127.0.0.1:4173/examples/browser-demo/
```

The demo verifies runtime controls, event mapping, behavior lifecycle, and personality action selection using `packages/core` plus `characters/naruto-pack`.

## Extension

Add a new host adapter by normalizing host events to `{ event, payload }`, then pass them to `PetEventAdapter` or directly to `PetBehaviorEngine` depending on the host boundary.

Add a new character pack by creating a new directory under `characters/`, then point a manifest `assetBase` at that pack and define character actions and state mappings.

Add a new action by adding a transparent PNG to a character directory, then registering the action in `pet-manifest.json`. If the action should be personality-selected, also add it to `personality-profiles.json`.

## V1 Freeze

当前 Preview 版本为 `0.1.0-preview`。Runtime、Event、Behavior、Listener 和 Character 边界已冻结；Preview Release 只允许 Build、Packaging、Logging 和 Release metadata 调整。
