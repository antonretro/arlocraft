// Central recipe registry for ArloCraft.
// Supported recipe types:
// - shaped: 3x3 symbolic pattern (spaces are empty)
// - shapeless: ingredient list order does not matter
export const RECIPE_BOOK = [
    {
        id: 'crafting_table',
        name: 'Crafting Table',
        type: 'shaped',
        pattern: [
            'WW',
            'WW'
        ],
        key: { W: 'oak_log' },
        result: { id: 'crafting_table', count: 1, kind: 'block' }
    },
    {
        id: 'stone_bricks',
        name: 'Stone Bricks',
        type: 'shaped',
        pattern: [
            'SS',
            'SS'
        ],
        key: { S: 'stone' },
        result: { id: 'brick', count: 4, kind: 'block' }
    },
    {
        id: 'wooden_pickaxe',
        name: 'Wooden Pickaxe',
        type: 'shaped',
        pattern: [
            'WWW',
            ' W ',
            ' W '
        ],
        key: { W: 'oak_log' },
        result: { id: 'pick_wood', count: 1, kind: 'tool' }
    },
    {
        id: 'iron_sledge',
        name: 'Iron Sledge',
        type: 'shaped',
        pattern: [
            'III',
            ' W ',
            ' W '
        ],
        key: { I: 'iron', W: 'oak_log' },
        result: { id: 'sledge_iron', count: 1, kind: 'tool' }
    },
    {
        id: 'power_blade',
        name: 'Power Blade',
        type: 'shaped',
        pattern: [
            ' I ',
            ' I ',
            ' W '
        ],
        key: { I: 'iron', W: 'oak_log' },
        result: { id: 'power_blade', count: 1, kind: 'tool' }
    },
    {
        id: 'glitch_saber',
        name: 'Glitch Saber',
        type: 'shaped',
        pattern: [
            ' V ',
            ' I ',
            ' W '
        ],
        key: { V: 'virus', I: 'iron', W: 'oak_log' },
        result: { id: 'glitch_saber', count: 1, kind: 'tool' }
    },
    {
        id: 'glass',
        name: 'Glass',
        type: 'shaped',
        pattern: [
            'SS',
            'SS'
        ],
        key: { S: 'sand' },
        result: { id: 'glass', count: 4, kind: 'block' }
    },
    {
        id: 'obsidian',
        name: 'Obsidian',
        type: 'shapeless',
        ingredients: ['stone', 'stone', 'virus', 'virus'],
        result: { id: 'obsidian', count: 1, kind: 'block' }
    },
    {
        id: 'oak_planks',
        name: 'Oak Planks',
        type: 'shapeless',
        ingredients: ['oak_log'],
        result: { id: 'oak_planks', count: 4, kind: 'block' }
    },
    {
        id: 'birch_planks',
        name: 'Birch Planks',
        type: 'shapeless',
        ingredients: ['birch_log'],
        result: { id: 'birch_planks', count: 4, kind: 'block' }
    },
    {
        id: 'spruce_planks',
        name: 'Spruce Planks',
        type: 'shapeless',
        ingredients: ['spruce_log'],
        result: { id: 'spruce_planks', count: 4, kind: 'block' }
    },
    {
        id: 'jungle_planks',
        name: 'Jungle Planks',
        type: 'shapeless',
        ingredients: ['jungle_log'],
        result: { id: 'jungle_planks', count: 4, kind: 'block' }
    },
    {
        id: 'cherry_planks',
        name: 'Cherry Planks',
        type: 'shapeless',
        ingredients: ['cherry_log'],
        result: { id: 'cherry_planks', count: 4, kind: 'block' }
    },
    {
        id: 'dark_oak_planks',
        name: 'Dark Oak Planks',
        type: 'shapeless',
        ingredients: ['dark_oak_log'],
        result: { id: 'dark_oak_planks', count: 4, kind: 'block' }
    },
    {
        id: 'acacia_planks',
        name: 'Acacia Planks',
        type: 'shapeless',
        ingredients: ['acacia_log'],
        result: { id: 'acacia_planks', count: 4, kind: 'block' }
    },
    {
        id: 'mangrove_planks',
        name: 'Mangrove Planks',
        type: 'shapeless',
        ingredients: ['mangrove_log'],
        result: { id: 'mangrove_planks', count: 4, kind: 'block' }
    },
    {
        id: 'stick_from_oak',
        name: 'Wooden Sticks',
        type: 'shaped',
        pattern: [
            'W',
            'W'
        ],
        key: { W: 'oak_planks' },
        result: { id: 'oak_log', count: 4, kind: 'block' }
    },
    {
        id: 'iron_pickaxe',
        name: 'Iron Pickaxe',
        type: 'shaped',
        pattern: [
            'III',
            ' W ',
            ' W '
        ],
        key: { I: 'iron', W: 'oak_log' },
        result: { id: 'sledge_iron', count: 1, kind: 'tool' }
    },
    {
        id: 'gold_pickaxe',
        name: 'Gold Pickaxe',
        type: 'shaped',
        pattern: [
            'GGG',
            ' W ',
            ' W '
        ],
        key: { G: 'gold', W: 'oak_log' },
        result: { id: 'pick_wood', count: 1, kind: 'tool' }
    },
    {
        id: 'diamond_sword',
        name: 'Diamond Sword',
        type: 'shaped',
        pattern: [
            ' D ',
            ' D ',
            ' W '
        ],
        key: { D: 'diamond', W: 'oak_log' },
        result: { id: 'power_blade', count: 1, kind: 'tool' }
    },
    {
        id: 'oak_stairs',
        name: 'Oak Stairs',
        type: 'shaped',
        pattern: [
            'W  ',
            'WW ',
            'WWW'
        ],
        key: { W: 'oak_planks' },
        result: { id: 'oak_stairs', count: 4, kind: 'block' }
    },
    {
        id: 'oak_slab',
        name: 'Oak Slab',
        type: 'shaped',
        pattern: [
            'WWW'
        ],
        key: { W: 'oak_planks' },
        result: { id: 'oak_slab', count: 6, kind: 'block' }
    },
    {
        id: 'cobblestone_stairs',
        name: 'Cobblestone Stairs',
        type: 'shaped',
        pattern: [
            'W  ',
            'WW ',
            'WWW'
        ],
        key: { W: 'cobblestone' },
        result: { id: 'cobblestone_stairs', count: 4, kind: 'block' }
    },
    {
        id: 'cobblestone_slab',
        name: 'Cobblestone Slab',
        type: 'shaped',
        pattern: [
            'WWW'
        ],
        key: { W: 'cobblestone' },
        result: { id: 'cobblestone_slab', count: 6, kind: 'block' }
    },
    {
        id: 'stone_brick_stairs',
        name: 'Stone Brick Stairs',
        type: 'shaped',
        pattern: [
            'W  ',
            'WW ',
            'WWW'
        ],
        key: { W: 'stone_bricks' },
        result: { id: 'stone_brick_stairs', count: 4, kind: 'block' }
    },
    {
        id: 'stone_brick_slab',
        name: 'Stone Brick Slab',
        type: 'shaped',
        pattern: [
            'WWW'
        ],
        key: { W: 'stone_bricks' },
        result: { id: 'stone_brick_slab', count: 6, kind: 'block' }
    },
    {
        id: 'birch_stairs',
        name: 'Birch Stairs',
        type: 'shaped',
        pattern: [
            'W  ',
            'WW ',
            'WWW'
        ],
        key: { W: 'birch_planks' },
        result: { id: 'birch_stairs', count: 4, kind: 'block' }
    },
    {
        id: 'birch_slab',
        name: 'Birch Slab',
        type: 'shaped',
        pattern: [
            'WWW'
        ],
        key: { W: 'birch_planks' },
        result: { id: 'birch_slab', count: 6, kind: 'block' }
    },
    {
        id: 'spruce_stairs',
        name: 'Spruce Stairs',
        type: 'shaped',
        pattern: [
            'W  ',
            'WW ',
            'WWW'
        ],
        key: { W: 'spruce_planks' },
        result: { id: 'spruce_stairs', count: 4, kind: 'block' }
    },
    {
        id: 'spruce_slab',
        name: 'Spruce Slab',
        type: 'shaped',
        pattern: [
            'WWW'
        ],
        key: { W: 'spruce_planks' },
        result: { id: 'spruce_slab', count: 6, kind: 'block' }
    },
];
