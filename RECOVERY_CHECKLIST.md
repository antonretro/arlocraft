# ArloCraft Recovery & Optimization Guide

This document outlines the critical fixes required to restore UI stability, fix the Minimap, and resolve the game freeze issues.

## 1. Engine & World Fixes (Freeze Prevention)

### [ ] Resolve Gravity Paradox

- **File**: `src/world/WorldInteractionService.js`
- **Fix**: Refactor `_applyGravityAbove` to use a non-recursive sweep. Or add a flag to `breakBlockAt` to prevent gravity re-triggering during a falling block sequence.

### [ ] Restore Missing getTopBlockIdAt

- **File**: `src/world/World.js`
- **Fix**: Implement this method. The Minimap crashes without it.

```javascript
getTopBlockIdAt(x, z) {
    const h = this.getColumnHeight(x, z);
    return this.state.blockMap.get(this.getKey(x, h, z));
}
```

### [ ] Sanitize Inventory Data

- **File**: `src/engine/GameState.js`
- **Fix**: Update `addItemToInventory` to handle objects.

```javascript
if (typeof itemId === 'object') {
  count = itemId.count || 1;
  kind = itemId.kind || 'block'; // Or 'tool'
  itemId = itemId.id;
}
```

## 2. UI & HUD Restoration

### [ ] Fix Minimap Visibility & Layering

- **File**: `index.html` (Remove `display: none` from `#minimap-container`).
- **File**: `src/style.css` (Set `#minimap-container { z-index: 100; pointer-events: none; position: absolute; transform: translateZ(0); }`).
- **Context**: The user reports it is "behind the game view". Ensure it's not obscured by the main canvas.

### [ ] Correct Player Icon

- **File**: `src/engine/GameUI.js`
- **Fix**: The HUD profile picture is showing a generic Arlo face instead of the player skin. Update `_applySkinToAvatar` to refresh the `ui-player-face` element (or similar) once the skin texture is loaded.

### [ ] Re-bind Settings Tabs

- **File**: `src/engine/GameUI.js`
- **Fix**: Add click listeners to `.ni-tab-link` to toggle the active tab content. These were lost in the class refactor.

## 3. Performance & Data Integrity

### [ ] Batch Events for Loot

- **File**: `src/engine/GameState.js`
- **Fix**: Add a `silent` option to `addItemToInventory` so `grantLootRoll` only triggers ONE `inventory-changed` event at the end. This prevents "stutter" when opening chests.
