# Extending AntonCraft

This doc is the fast path for adding new features safely.

## 1) Feature Flags (Recommended First Step)
File: `src/data/features.js`
- Add a boolean flag for your feature.
- Gate expensive or experimental systems behind this flag.

Example:
```js
export const FEATURES = {
  ...,
  myNewSystem: true
};
```

Use in code:
```js
if (!this.game?.features?.myNewSystem) return;
```

## 2) Adding New Blocks
Files:
- `src/content/blocks/packs/*.js`
- `src/blocks/BlockRegistry.js`
- `public/icons/items/<block>.png` (optional UI icon)

Steps:
1. Add block metadata to a new pack file in `src/content/blocks/packs`.
2. Add color/texture mapping in `BlockRegistry.js`.
3. Optional: add icon in `public/icons/items` for HUD/hotbar.
4. See `docs/CONTENT_PACKS.md` for pack format and examples.
5. Existing built-in blocks are in `src/content/blocks/packs/core.pack.js`.

## 3) Adding New Tools
Files:
- `src/content/items/packs/*.js`
- `src/ui/HUD.js`
- `public/icons/items/<tool>.png`

Steps:
1. Add tool entry to a new pack file in `src/content/items/packs`.
2. Add icon mapping in HUD icon map.
3. Tool auto-affects mining speed via world mining-duration logic.
4. See `docs/CONTENT_PACKS.md` for pack format and examples.

## 4) Adding Recipes
File: `src/data/recipes.js`
- Add `pattern` and `result` entries.
- Recipe matching trims empty rows/columns automatically.

## 5) Adding Mobs
Files:
- `src/data/mobs.js`
- `src/entities/*`

Steps:
1. Add mob config in `mobs.js`.
2. Implement behavior class in `src/entities`.
3. Wire spawn logic in `EntityManager` / `World.loadChunk`.

## 6) Performance Safety Checklist
Before shipping a new system:
- Avoid per-frame `intersectObjects` over all blocks.
- Reuse geometry/material where possible.
- Throttle expensive updates (minimap, animation, scans).
- Test with F3 debug overlay and monitor draw calls.

## 7) Suggested Code Ownership Boundaries
- `src/engine/*`: game loop, camera, input, physics orchestration
- `src/world/*`: chunks, generation, mining/place interactions
- `src/ui/*`: menus, HUD, minimap, prompts
- `src/data/*`: content definitions (blocks/tools/recipes/features)
- `src/rendering/*`: shared render config and layer ordering

Keeping new features inside one layer first reduces regressions.
