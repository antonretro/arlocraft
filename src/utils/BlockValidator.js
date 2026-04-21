import { BLOCKS } from '../data/blocks.js';

const blockDataById = new Map(BLOCKS.map((block) => [block.id, block]));

const GROUND_LIFE_IDS = [
  'short_grass',
  'tall_grass_bottom',
  'tall_grass_top',
  'fern',
  'dandelion',
  'poppy',
  'red_tulip',
  'orange_tulip',
  'pink_tulip',
  'white_tulip',
  'azure_bluet',
  'oxeye_daisy',
  'cornflower',
  'allium',
  'blueberry',
  'strawberry',
  'mushroom_brown',
  'mushroom_red',
  'lilac',
  'peony',
  'rose_bush',
  'tomato',
  'carrot',
  'potato',
  'beetroot',
  'wheat',
  'corn',
  'dead_bush',
  'sea_pickle',
  'kelp',
];

const VIRTUAL_ID_SKIP = ['potato', 'carrot', 'beetroot', 'wheat'];

const TREE_IDS = [
  'oak_log',
  'oak_leaves',
  'birch_log',
  'birch_leaves',
  'spruce_log',
  'spruce_leaves',
  'jungle_log',
  'jungle_leaves',
  'mangrove_log',
  'mangrove_leaves',
  'acacia_log',
  'acacia_leaves',
  'dark_oak_log',
  'dark_oak_leaves',
  'cherry_log',
  'cherry_leaves',
];

const TERRAIN_IDS = [
  'grass_block',
  'dirt',
  'stone',
  'sand',
  'gravel',
  'snow_block',
  'ice',
  'sandstone',
  'red_sand',
  'terracotta',
  'water',
  'bedrock',
  'deepslate',
  'cobbled_deepslate',
  'tuff',
  'calcite',
  'andesite',
  'diorite',
  'granite',
  'coal',
  'iron',
  'gold',
  'lapis_ore',
  'redstone_ore',
  'copper',
  'deepslate_diamond_ore',
  'deepslate_redstone_ore',
  'deepslate_gold_ore',
  'deepslate_lapis_ore',
  'deepslate_iron_ore',
  'deepslate_copper_ore',
  'tube_coral_block',
  'brain_coral_block',
];

function getPairOffset(block) {
  const value = Number(block?.pairOffsetY);
  return Number.isFinite(value) && value !== 0 ? value : null;
}

function validatePairLinks(pairWarnings) {
  for (const block of BLOCKS) {
    const pairId =
      typeof block.pairId === 'string' && block.pairId.trim()
        ? block.pairId.trim()
        : null;
    const pairOffsetY = getPairOffset(block);

    if (Boolean(pairId) !== Boolean(pairOffsetY)) {
      pairWarnings.push(
        `[pairs] "${block.id}" must define both pairId and pairOffsetY`
      );
      continue;
    }

    if (!pairId || !pairOffsetY) continue;

    const pairBlock = blockDataById.get(pairId);
    if (!pairBlock) {
      pairWarnings.push(
        `[pairs] "${block.id}" points to missing pair "${pairId}"`
      );
      continue;
    }

    const reversePairId =
      typeof pairBlock.pairId === 'string' && pairBlock.pairId.trim()
        ? pairBlock.pairId.trim()
        : null;
    const reverseOffsetY = getPairOffset(pairBlock);

    if (reversePairId !== block.id || reverseOffsetY !== -pairOffsetY) {
      pairWarnings.push(
        `[pairs] "${block.id}" -> "${pairId}" is not symmetric; ` +
          `expected "${pairId}" -> "${block.id}" with pairOffsetY ${-pairOffsetY}`
      );
    }

    if (block.renderType === 'paired_plant' && !block.deco) {
      pairWarnings.push(
        `[pairs] "${block.id}" is paired_plant but missing deco:true`
      );
    }
  }
}

export function validateBlocks() {
  const missing = [];
  const missingDeco = [];
  const pairWarnings = [];

  const check = (id, context) => {
    if (!id || VIRTUAL_ID_SKIP.includes(id)) return;
    const block = blockDataById.get(id);
    if (!block) {
      missing.push(`[${context}] "${id}" - no config found`);
    }
  };

  const checkDeco = (id, context) => {
    if (VIRTUAL_ID_SKIP.includes(id)) return;
    const block = blockDataById.get(id);
    if (block && !block.deco) {
      missingDeco.push(
        `[${context}] "${id}" has config but deco:true missing - will render as a solid block`
      );
    }
  };

  for (const id of GROUND_LIFE_IDS) {
    check(id, 'ground_life');
    checkDeco(id, 'ground_life');
  }
  for (const id of TREE_IDS) check(id, 'trees');
  for (const id of TERRAIN_IDS) check(id, 'terrain');

  validatePairLinks(pairWarnings);

  if (missing.length || missingDeco.length || pairWarnings.length) {
    console.group(
      '%c[ArloCraft] Block Validation Warnings',
      'color: orange; font-weight: bold'
    );
    for (const warning of missing) console.warn(warning);
    for (const warning of missingDeco) console.warn(warning);
    for (const warning of pairWarnings) console.warn(warning);
    console.groupEnd();
  } else {
    console.log(
      '%c[ArloCraft] Block validation passed - all IDs and pair links resolved',
      'color: #4caf50'
    );
  }
}
