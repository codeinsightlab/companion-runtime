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

V1 is frozen for migration. Do not change behavior, state names, event semantics, animation timing, character settings, or image assets during migration work.
