# Chest

The chest is the standard storage block for loot and player stash points.

## Behavior
- Opens the chest inventory UI on interaction.
- Reuses the shared chest handler so content and loot logic stay consistent.

## Parameters
- `hardness`: Base mining toughness.
- `xp`: XP value returned by metadata systems.
- `dropId`: Item/block returned when picked or mined.
