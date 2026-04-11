# ArloCraft Content System

ArloCraft now uses folder-based packs so blocks, tools, restoration sites, and names are easy to expand.

## Add Blocks

1. Open `src/content/blocks/packs/`.
2. Create a new file like `my_theme.pack.js`.
3. Export `BLOCK_PACK`:

```js
export const BLOCK_PACK = [
    { id: 'my_brick', name: 'My Brick', hardness: 2, xp: 6 }
];
```

The loader auto-merges this with core blocks.

## Add Tools / Items

1. Open `src/content/items/packs/`.
2. Add a file like `my_tools.pack.js`.
3. Export `TOOL_PACK` with the same shape as existing packs.

## Add Restoration Sites

1. Edit `src/world/restoration/RestorationRegistry.js`.
2. Add a new site entry with:
   - `id`
   - `category`
   - `patch`
   - `requirements`
   - `landmarks`

## Add More Town Names

1. Edit `src/world/naming/SettlementNameGenerator.js`.
2. Add entries to:
   - `SETTLEMENT_FIRST_PARTS`
   - `SETTLEMENT_SECOND_PARTS`

Total possible names = `firstParts.length * secondParts.length`.

