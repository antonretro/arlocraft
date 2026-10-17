// Central recipe registry for ArloCraft.
// Supported recipe types:
// - shaped: 3x3 symbolic pattern (spaces are empty)
// - shapeless: ingredient list order does not matter
// Keys and ingredients take an item id or a '#tag' from ITEM_TAGS.

export const ITEM_TAGS = {
  planks: [
    'oak_planks',
    'birch_planks',
    'spruce_planks',
    'jungle_planks',
    'acacia_planks',
    'dark_oak_planks',
    'mangrove_planks',
    'cherry_planks',
    'crimson_planks',
    'warped_planks',
  ],
  logs: [
    'oak_log',
    'birch_log',
    'spruce_log',
    'jungle_log',
    'acacia_log',
    'dark_oak_log',
    'mangrove_log',
    'cherry_log',
    'crimson_stem',
    'warped_stem',
  ],
  stone_tool_materials: ['cobblestone', 'cobbled_deepslate', 'blackstone'],
  coals: ['coal', 'charcoal'],
  wool: [
    'wool_white',
    'wool_orange',
    'wool_magenta',
    'wool_light_blue',
    'wool_yellow',
    'wool_lime',
    'wool_pink',
    'wool_gray',
    'wool_light_gray',
    'wool_cyan',
    'wool_purple',
    'wool_blue',
    'wool_brown',
    'wool_green',
    'wool_red',
    'wool_black',
  ],
};

const PLANK_SOURCES = [
  ['oak', 'oak_log'],
  ['birch', 'birch_log'],
  ['spruce', 'spruce_log'],
  ['jungle', 'jungle_log'],
  ['cherry', 'cherry_log'],
  ['dark_oak', 'dark_oak_log'],
  ['acacia', 'acacia_log'],
  ['mangrove', 'mangrove_log'],
];

const TITLE = {
  wood: 'Wooden',
  stone: 'Stone',
  iron: 'Iron',
  gold: 'Golden',
  diamond: 'Diamond',
};

// Head material per tool tier. The legacy wooden ids (pick_wood, axe_wood,
// sword_wood, hoe_wood) keep their names so existing saves still match.
const TOOL_MATERIALS = [
  ['wood', '#planks'],
  ['stone', '#stone_tool_materials'],
  ['iron', 'iron_ingot'],
  ['gold', 'gold_ingot'],
  ['diamond', 'diamond'],
];

const TOOL_SHAPES = [
  ['pick', 'Pickaxe', ['MMM', ' S ', ' S ']],
  ['axe', 'Axe', ['MM', 'MS', ' S']],
  ['shovel', 'Shovel', ['M', 'S', 'S']],
  ['sword', 'Sword', ['M', 'M', 'S']],
  ['hoe', 'Hoe', ['MM', ' S', ' S']],
];

const ARMOR_SHAPES = [
  ['helmet', 'Helmet', ['MMM', 'M M']],
  ['chestplate', 'Chestplate', ['M M', 'MMM', 'MMM']],
  ['leggings', 'Leggings', ['MMM', 'M M', 'M M']],
  ['boots', 'Boots', ['M M', 'M M']],
];

const ARMOR_MATERIALS = [
  ['leather', 'Leather', 'leather'],
  ['iron', 'Iron', 'iron_ingot'],
  ['diamond', 'Diamond', 'diamond'],
];

function toolRecipes() {
  const recipes = [];
  for (const [material, head] of TOOL_MATERIALS) {
    for (const [type, label, pattern] of TOOL_SHAPES) {
      const id = `${type}_${material}`;
      recipes.push({
        id: material === 'wood' ? `wooden_${type}` : id,
        name: `${TITLE[material]} ${label}`,
        type: 'shaped',
        pattern,
        key: { M: head, S: 'stick' },
        result: { id, count: 1, kind: 'tool' },
      });
    }
  }
  return recipes;
}

function armorRecipes() {
  const recipes = [];
  for (const [material, title, item] of ARMOR_MATERIALS) {
    for (const [piece, label, pattern] of ARMOR_SHAPES) {
      const id = `${material}_${piece}`;
      recipes.push({
        id,
        name: `${title} ${label}`,
        type: 'shaped',
        pattern,
        key: { M: item },
        result: { id, count: 1, kind: 'armor' },
      });
    }
  }
  return recipes;
}

function storageBlockRecipes(itemId, blockId, label) {
  return [
    {
      id: blockId,
      name: label,
      type: 'shaped',
      pattern: ['III', 'III', 'III'],
      key: { I: itemId },
      result: { id: blockId, count: 1, kind: 'block' },
    },
    {
      id: `${itemId}_from_${blockId}`,
      name: `${label} to Items`,
      type: 'shapeless',
      ingredients: [blockId],
      result: { id: itemId, count: 9, kind: 'item' },
    },
  ];
}

export const RECIPE_BOOK = [
  // --- Wood basics -------------------------------------------------------
  ...PLANK_SOURCES.map(([wood, log]) => ({
    id: `${wood}_planks`,
    name: `${TITLE[wood] ?? wood.charAt(0).toUpperCase() + wood.slice(1).replace('_', ' ')} Planks`,
    type: 'shapeless',
    ingredients: [log],
    result: { id: `${wood}_planks`, count: 4, kind: 'block' },
  })),
  {
    id: 'stick_from_oak',
    name: 'Wooden Sticks',
    type: 'shaped',
    pattern: ['W', 'W'],
    key: { W: '#planks' },
    result: { id: 'stick', count: 4, kind: 'item' },
  },
  {
    id: 'crafting_table',
    name: 'Crafting Table',
    type: 'shaped',
    pattern: ['WW', 'WW'],
    key: { W: '#planks' },
    result: { id: 'crafting_table', count: 1, kind: 'block' },
  },
  {
    id: 'chest',
    name: 'Chest',
    type: 'shaped',
    pattern: ['WWW', 'W W', 'WWW'],
    key: { W: '#planks' },
    result: { id: 'chest', count: 1, kind: 'block' },
  },
  {
    id: 'furnace',
    name: 'Furnace',
    type: 'shaped',
    pattern: ['CCC', 'C C', 'CCC'],
    key: { C: '#stone_tool_materials' },
    result: { id: 'furnace', count: 1, kind: 'block' },
  },
  {
    id: 'torch',
    name: 'Torch',
    type: 'shaped',
    pattern: ['C', 'S'],
    key: { C: '#coals', S: 'stick' },
    result: { id: 'torch', count: 4, kind: 'block' },
  },
  {
    id: 'bed',
    name: 'Bed',
    type: 'shaped',
    pattern: ['WWW', 'PPP'],
    key: { W: '#wool', P: '#planks' },
    result: { id: 'bed', count: 1, kind: 'block' },
  },
  {
    id: 'ladder',
    name: 'Ladder',
    type: 'shaped',
    pattern: ['S S', 'SSS', 'S S'],
    key: { S: 'stick' },
    result: { id: 'ladder', count: 3, kind: 'block' },
  },
  {
    id: 'bucket',
    name: 'Bucket',
    type: 'shaped',
    pattern: ['I I', ' I '],
    key: { I: 'iron_ingot' },
    result: { id: 'bucket', count: 1, kind: 'tool' },
  },
  {
    id: 'flint_and_steel',
    name: 'Flint and Steel',
    type: 'shapeless',
    ingredients: ['iron_ingot', 'flint'],
    result: { id: 'flint_and_steel', count: 1, kind: 'tool' },
  },
  {
    id: 'bread',
    name: 'Bread',
    type: 'shaped',
    pattern: ['WWW'],
    key: { W: 'wheat' },
    result: { id: 'bread', count: 1, kind: 'block' },
  },
  {
    id: 'wool_from_string',
    name: 'Wool',
    type: 'shaped',
    pattern: ['SS', 'SS'],
    key: { S: 'string' },
    result: { id: 'wool_white', count: 1, kind: 'block' },
  },

  // --- Tools & armor -----------------------------------------------------
  ...toolRecipes(),
  ...armorRecipes(),

  // --- Storage blocks ----------------------------------------------------
  ...storageBlockRecipes('iron_ingot', 'iron_block', 'Iron Block'),
  ...storageBlockRecipes('gold_ingot', 'gold_block', 'Gold Block'),
  ...storageBlockRecipes('diamond', 'diamond_block', 'Diamond Block'),
  ...storageBlockRecipes('coal', 'coal_block', 'Coal Block'),
  ...storageBlockRecipes('redstone', 'redstone_block', 'Redstone Block'),

  // --- Building ----------------------------------------------------------
  {
    id: 'stone_bricks',
    name: 'Stone Bricks',
    type: 'shaped',
    pattern: ['SS', 'SS'],
    key: { S: 'stone' },
    result: { id: 'stone_bricks', count: 4, kind: 'block' },
  },
  {
    id: 'oak_stairs',
    name: 'Oak Stairs',
    type: 'shaped',
    pattern: ['W  ', 'WW ', 'WWW'],
    key: { W: 'oak_planks' },
    result: { id: 'oak_planks_stairs', count: 4, kind: 'block' },
  },
  {
    id: 'oak_slab',
    name: 'Oak Slab',
    type: 'shaped',
    pattern: ['WWW'],
    key: { W: 'oak_planks' },
    result: { id: 'oak_planks_slab', count: 6, kind: 'block' },
  },
  {
    id: 'birch_stairs',
    name: 'Birch Stairs',
    type: 'shaped',
    pattern: ['W  ', 'WW ', 'WWW'],
    key: { W: 'birch_planks' },
    result: { id: 'birch_planks_stairs', count: 4, kind: 'block' },
  },
  {
    id: 'birch_slab',
    name: 'Birch Slab',
    type: 'shaped',
    pattern: ['WWW'],
    key: { W: 'birch_planks' },
    result: { id: 'birch_planks_slab', count: 6, kind: 'block' },
  },
  {
    id: 'spruce_stairs',
    name: 'Spruce Stairs',
    type: 'shaped',
    pattern: ['W  ', 'WW ', 'WWW'],
    key: { W: 'spruce_planks' },
    result: { id: 'spruce_planks_stairs', count: 4, kind: 'block' },
  },
  {
    id: 'spruce_slab',
    name: 'Spruce Slab',
    type: 'shaped',
    pattern: ['WWW'],
    key: { W: 'spruce_planks' },
    result: { id: 'spruce_planks_slab', count: 6, kind: 'block' },
  },
  {
    id: 'oak_door',
    name: 'Oak Door',
    type: 'shaped',
    pattern: ['WW', 'WW', 'WW'],
    key: { W: 'oak_planks' },
    result: { id: 'oak_planks_door', count: 3, kind: 'block' },
  },
  {
    id: 'oak_trapdoor',
    name: 'Oak Trapdoor',
    type: 'shaped',
    pattern: ['WWW', 'WWW'],
    key: { W: 'oak_planks' },
    result: { id: 'oak_planks_trapdoor', count: 2, kind: 'block' },
  },

  // --- ArloCraft specials ------------------------------------------------
  {
    id: 'iron_sledge',
    name: 'Iron Sledge',
    type: 'shaped',
    pattern: ['III', ' W ', ' W '],
    key: { I: 'iron_ingot', W: '#logs' },
    result: { id: 'sledge_iron', count: 1, kind: 'tool' },
  },
  {
    id: 'power_blade',
    name: 'Power Blade',
    type: 'shaped',
    pattern: [' I ', ' I ', ' W '],
    key: { I: 'iron_ingot', W: '#logs' },
    result: { id: 'power_blade', count: 1, kind: 'tool' },
  },
  {
    id: 'glitch_saber',
    name: 'Glitch Saber',
    type: 'shaped',
    pattern: [' V ', ' I ', ' W '],
    key: { V: 'virus', I: 'iron_ingot', W: '#logs' },
    result: { id: 'glitch_saber', count: 1, kind: 'tool' },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    type: 'shapeless',
    ingredients: ['stone', 'stone', 'virus', 'virus'],
    result: { id: 'obsidian', count: 1, kind: 'block' },
  },
  {
    id: 'potato_harvest',
    name: 'Potato Harvest',
    type: 'shapeless',
    ingredients: ['potato_stage3'],
    result: { id: 'potato', count: 3, kind: 'item' },
  },
  {
    id: 'carrot_harvest',
    name: 'Carrot Harvest',
    type: 'shapeless',
    ingredients: ['carrot_stage3'],
    result: { id: 'carrot', count: 3, kind: 'item' },
  },
  {
    id: 'beetroot_harvest',
    name: 'Beetroot Harvest',
    type: 'shapeless',
    ingredients: ['beetroot_stage3'],
    result: { id: 'beetroot', count: 3, kind: 'item' },
  },
];
