# ArloCraft Content Packs

ArloCraft now supports simple folder-based content packs for blocks and tools.

## Where to Add New Content

- Blocks: `src/content/blocks/packs/*.js`
- Tools/items: `src/content/items/packs/*.js`

Use `example.pack.js` in each folder as a template.
Built-in block content also uses this same system in `src/content/blocks/packs/core.pack.js`.

## Export Format

For block packs, export `BLOCK_PACK` (array of block objects):

```js
export const BLOCK_PACK = [
    { id: 'copper_bricks', name: 'Copper Bricks', hardness: 3, xp: 18 }
];
```

For tool packs, export `TOOL_PACK` (array of tool objects):

```js
export const TOOL_PACK = [
    {
        id: 'copper_pick',
        name: 'Copper Pickaxe',
        type: 'pick',
        efficiency: 2,
        damage: 4,
        range: 3.8,
        cooldown: 0.27,
        knockback: 0.45,
        critChance: 0.03
    }
];
```

## Notes

- Pack files are loaded automatically at build/runtime.
- If a pack item reuses an existing `id`, it overrides the existing definition.
- Missing numeric fields are auto-filled with safe defaults.
