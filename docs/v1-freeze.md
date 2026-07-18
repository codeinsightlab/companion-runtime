# V1 Freeze

Companion Runtime V1 is frozen after migration.

Frozen scope:

- PNG assets
- state machine states and transitions
- event names and event mapping semantics
- behavior priority, cooldown, duration, recovery, and idle rules
- personality profiles and weighted selection semantics
- viewer animation timing and display behavior

Allowed migration-only changes:

- directory structure
- relative import paths
- package metadata
- documentation organization
- demo URLs needed by the new repository layout

Recommended first commit:

```bash
git add .
git commit -m "feat: initialize companion runtime v1"
```
