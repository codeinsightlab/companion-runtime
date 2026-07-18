# Extension Guide

## Add A Host Adapter

Normalize host events to:

```json
{
  "event": "task_success",
  "payload": {}
}
```

Use `PetEventAdapter` for simple event-to-state mappings, or call `PetBehaviorEngine.handleEvent()` when lifecycle, priority, cooldown, recovery, and personality action selection are needed.

## Add A Character Pack

1. Create `characters/<pack-name>/`.
2. Add one directory per character.
3. Place transparent PNG action assets in each character directory.
4. Add or copy a manifest in `packages/core/config/` and set `assetBase` to the pack path.
5. Register `actions` and `states` for each character.

## Add An Action

1. Add the PNG to the character directory.
2. Register it in `pet-manifest.json`.
3. Map it to a state if it is a default state action.
4. Add it to `personality-profiles.json` if it should be selected by character personality.

## Add Behavior

Add event lifecycle rules to `behavior-rules.json`. Keep state names aligned with `PetStateMachine`.

## Add Personality

Add or update a character profile in `personality-profiles.json`. Weighted random uses the sum of positive `weight` values.
