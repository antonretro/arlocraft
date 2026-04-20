# ArloCraft Crafting System

All crafting recipes are controlled in one place:

- `src/data/recipeBook.js`

Runtime matching is handled by:

- `src/engine/CraftingSystem.js`

HUD integration is in:

- `src/ui/HUD.js`

## Recipe Format

### Shaped

```js
{
  id: 'wooden_pickaxe',
  name: 'Wooden Pickaxe',
  type: 'shaped',
  pattern: [
    'WWW',
    ' W ',
    ' W '
  ],
  key: { W: 'wood' },
  result: { id: 'pick_wood', count: 1, kind: 'tool' }
}
```

Rules:
- Pattern is up to 3x3.
- Use `' '` for empty slots.
- System supports mirrored patterns automatically.

### Shapeless

```js
{
  id: 'obsidian',
  name: 'Obsidian',
  type: 'shapeless',
  ingredients: ['stone', 'stone', 'virus', 'virus'],
  result: { id: 'obsidian', count: 1, kind: 'block' }
}
```

Rules:
- Ingredient order does not matter.
- Exact ingredient counts must match.

## How To Add A Recipe

1. Open `src/data/recipeBook.js`.
2. Add a new recipe object to `RECIPE_BOOK`.
3. Ensure result item id exists in item/block/tool definitions.
4. Save and reload the game.

## Inventory Drag/Drop Behavior

- Left click pickup: take full stack.
- Right click pickup: take half stack.
- Left drop: place/merge/swap.
- Right drop: place one item.
- Carried stack is shown under cursor while inventory is open.
