# Architecture

Companion Runtime V1 is split into host integration, core runtime, and character packs.

```text
Host Application
↓
Adapter
↓
PetEventAdapter
↓
PetBehaviorEngine
↓
PetPersonalityEngine
↓
PetManager
↓
PetStateMachine
↓
PetViewer
↓
Character Pack Assets
```

## Core

`packages/core/runtime` contains the reusable runtime:

- `PetAction`
- `PetCharacter`
- `PetManager`
- `PetStateMachine`
- `PetViewer`
- `PetEventAdapter`
- `PetBehaviorEngine`
- `PetPersonalityEngine`
- `BehaviorRule`
- `BehaviorScheduler`

## Config

`packages/core/config` contains the V1 Naruto demo configuration. The manifest points to `characters/naruto-pack` through a relative `assetBase`.

## Character Packs

`characters/naruto-pack` contains the Sasuke, Naruto, and Itachi PNG assets. Core runtime modules do not import this pack directly.
