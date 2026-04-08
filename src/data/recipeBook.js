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
        key: { W: 'wood' },
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
        key: { W: 'wood' },
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
        key: { I: 'iron', W: 'wood' },
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
        key: { I: 'iron', W: 'wood' },
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
        key: { V: 'virus', I: 'iron', W: 'wood' },
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
    }
];
