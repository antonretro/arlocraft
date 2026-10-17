import { TOOLS } from './tools.js';
import { normalizeBlockVariantId } from './blockIds.js';

// Minecraft-style harvesting: which tool a block wants, the pickaxe tier it
// needs before it drops anything, how fast each tool tier mines, and what a
// block drops when broken.

export const TOOL_TIER = Object.freeze({
  HAND: 0,
  WOOD: 1,
  STONE: 2,
  IRON: 3,
  DIAMOND: 4,
  NETHERITE: 5,
});

// Mining speed multiplier per tier when using the right tool type.
const TIER_SPEED = [1, 2, 4, 6, 8, 9];

// Seconds per hardness point: harvestable blocks mine at 1x, blocks that
// need a better tool take much longer (and drop nothing).
const HARVESTABLE_FACTOR = 1;
const WRONG_TIER_FACTOR = 3.5;

// Minimum pickaxe tier needed for a drop. Anything matching
// PICKAXE_PATTERN but not listed here needs a wooden pickaxe.
const PICKAXE_LEVEL = {
  iron_ore: TOOL_TIER.STONE,
  deepslate_iron_ore: TOOL_TIER.STONE,
  raw_iron_block: TOOL_TIER.STONE,
  iron_block: TOOL_TIER.STONE,
  copper_ore: TOOL_TIER.STONE,
  deepslate_copper_ore: TOOL_TIER.STONE,
  raw_copper_block: TOOL_TIER.STONE,
  copper_block: TOOL_TIER.STONE,
  lapis_ore: TOOL_TIER.STONE,
  deepslate_lapis_ore: TOOL_TIER.STONE,
  lapis_block: TOOL_TIER.STONE,
  gold_ore: TOOL_TIER.IRON,
  deepslate_gold_ore: TOOL_TIER.IRON,
  raw_gold_block: TOOL_TIER.IRON,
  gold_block: TOOL_TIER.IRON,
  redstone_ore: TOOL_TIER.IRON,
  deepslate_redstone_ore: TOOL_TIER.IRON,
  diamond_ore: TOOL_TIER.IRON,
  deepslate_diamond_ore: TOOL_TIER.IRON,
  diamond_block: TOOL_TIER.IRON,
  emerald_ore: TOOL_TIER.IRON,
  deepslate_emerald_ore: TOOL_TIER.IRON,
  emerald_block: TOOL_TIER.IRON,
  obsidian: TOOL_TIER.DIAMOND,
  crying_obsidian: TOOL_TIER.DIAMOND,
  ancient_debris: TOOL_TIER.DIAMOND,
  netherite_block: TOOL_TIER.DIAMOND,
};

const PICKAXE_PATTERN =
  /(stone|cobble|deepslate|andesite|diorite|granite|tuff|calcite|basalt|blackstone|brick|_ore$|terracotta|concrete|prismarine|purpur|quartz|netherrack|end_stone|obsidian|furnace|smoker|dripstone|amethyst|magma|copper|iron_|(coal|iron|gold|diamond|emerald|lapis|redstone|netherite|quartz|bone|raw_[a-z]+|amethyst)_block|lantern|chain|spawner|anvil|cauldron|hopper|observer|dispenser|enchanting_table|brewing_stand)/;

// Matches PICKAXE_PATTERN by name but break by hand in Minecraft.
const HAND_BREAKABLE = new Set([
  'redstone_wire',
  'redstone_torch',
  'redstone_torch_off',
  'redstone_lamp',
  'redstone_lamp_on',
  'glowstone',
  'stone_button',
  'hay_block',
  'slime_block',
  'honey_block',
  'honeycomb_block',
  'dried_kelp_block',
  'snow_block',
  'melon_block',
  'mushroom_block',
  'brown_mushroom_block',
  'red_mushroom_block',
  'grass_block',
  'stripped_bamboo_block',
  'sea_lantern',
  'jack_o_lantern',
  'command_block',
  'wet_sponge',
]);

const AXE_PATTERN =
  /(log|_wood$|^wood|planks|_stem$|hyphae|crafting_table|chest|barrel|bookshelf|fence|_door|trapdoor|sign|ladder|jukebox|note_block|loom|cartography_table|fletching_table|smithing_table|bamboo|campfire|lectern|composter|beehive|bee_nest|mushroom_block|pumpkin|melon|bed$)/;
const SHOVEL_PATTERN =
  /(dirt|grass_block|^sand$|red_sand|gravel|clay|snow|farmland|mud$|soul_sand|soul_soil|podzol|mycelium|path_block|concrete_powder)/;
const HOE_PATTERN = /(leaves|hay_block|sponge|moss|sculk|target|wart_block)/;

const ORE_DROPS = {
  coal_ore: { id: 'coal' },
  deepslate_coal_ore: { id: 'coal' },
  iron_ore: { id: 'raw_iron' },
  deepslate_iron_ore: { id: 'raw_iron' },
  gold_ore: { id: 'raw_gold' },
  deepslate_gold_ore: { id: 'raw_gold' },
  copper_ore: { id: 'raw_copper', min: 2, max: 5 },
  deepslate_copper_ore: { id: 'raw_copper', min: 2, max: 5 },
  diamond_ore: { id: 'diamond' },
  deepslate_diamond_ore: { id: 'diamond' },
  emerald_ore: { id: 'emerald' },
  deepslate_emerald_ore: { id: 'emerald' },
  redstone_ore: { id: 'redstone', min: 4, max: 5 },
  deepslate_redstone_ore: { id: 'redstone', min: 4, max: 5 },
  lapis_ore: { id: 'lapis_lazuli', min: 4, max: 9 },
  deepslate_lapis_ore: { id: 'lapis_lazuli', min: 4, max: 9 },
  nether_quartz_ore: { id: 'quartz' },
  nether_gold_ore: { id: 'gold_nugget', min: 2, max: 6 },
};

// Blocks that turn into something else when mined.
const BLOCK_DROPS = {
  stone: 'cobblestone',
  deepslate: 'cobbled_deepslate',
  grass_block: 'dirt',
  mycelium: 'dirt',
  podzol: 'dirt',
  farmland: 'dirt',
  path_block: 'dirt',
  dirt_path: 'dirt',
  furnace_active: 'furnace',
  redstone_wire: 'redstone',
  redstone_lamp_on: 'redstone_lamp',
  redstone_torch_off: 'redstone_torch',
};

const SAPLING_BY_LEAVES = {
  oak_leaves: 'oak_sapling',
  birch_leaves: 'birch_sapling',
  spruce_leaves: 'spruce_sapling',
  jungle_leaves: 'jungle_sapling',
  acacia_leaves: 'acacia_sapling',
  dark_oak_leaves: 'dark_oak_sapling',
};

let toolById = null;
function getTool(id) {
  if (!toolById) toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
  return toolById.get(id) ?? null;
}

/** Tool type ('pick' | 'axe' | 'shovel' | 'hoe' | 'sword' | null), tier and speed. */
export function getToolProfile(item) {
  const tool = item?.id ? getTool(item.id) : null;
  if (!tool) return { type: null, tier: TOOL_TIER.HAND, speed: 1 };
  let type = tool.type;
  if (type === 'hammer') type = 'pick'; // Plasma hammer doubles as a pickaxe.
  const tier = Math.max(0, Number(tool.tier) || 0);
  const speed =
    Number(tool.speed) ||
    (tier > 0
      ? TIER_SPEED[Math.min(tier, TIER_SPEED.length - 1)]
      : 1 + Math.max(0, Number(tool.efficiency) || 0));
  return { type, tier, speed };
}

/** { tool, level }: preferred tool type and the minimum pickaxe tier for drops. */
export function getHarvestRule(blockId) {
  const id = normalizeBlockVariantId(blockId);
  if (!id) return { tool: null, level: 0 };
  if (PICKAXE_LEVEL[id] !== undefined)
    return { tool: 'pick', level: PICKAXE_LEVEL[id] };
  if (
    !HAND_BREAKABLE.has(id) &&
    !id.includes('concrete_powder') &&
    PICKAXE_PATTERN.test(id)
  ) {
    return { tool: 'pick', level: TOOL_TIER.WOOD };
  }
  if (AXE_PATTERN.test(id)) return { tool: 'axe', level: 0 };
  if (SHOVEL_PATTERN.test(id)) return { tool: 'shovel', level: 0 };
  if (HOE_PATTERN.test(id)) return { tool: 'hoe', level: 0 };
  return { tool: null, level: 0 };
}

export function canHarvest(blockId, item) {
  const rule = getHarvestRule(blockId);
  if (rule.level <= 0) return true;
  const profile = getToolProfile(item);
  return profile.type === rule.tool && profile.tier >= rule.level;
}

/** Seconds to break a block of `hardness` with `item` (Minecraft's formula, scaled). */
export function computeBreakSeconds(blockId, hardness, item) {
  const h = Math.max(0, Number(hardness) || 0);
  if (h === 0) return 0.05;
  const rule = getHarvestRule(blockId);
  const profile = getToolProfile(item);
  const speed = rule.tool && profile.type === rule.tool ? profile.speed : 1;
  const factor = canHarvest(blockId, item)
    ? HARVESTABLE_FACTOR
    : WRONG_TIER_FACTOR;
  return Math.max(0.05, (h * factor) / speed);
}

function rollCount(min, max, random) {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * Items a block drops when broken with `item`. Returns [] when the block
 * needs a better tool. `fallbackDropId` is the block's configured dropId.
 */
export function getBlockDrops(
  blockId,
  item,
  { random = Math.random, fallbackDropId = null } = {}
) {
  const id = normalizeBlockVariantId(blockId);
  if (!id || id === 'bedrock' || id === 'air') return [];
  if (!canHarvest(id, item)) return [];

  const ore = ORE_DROPS[id];
  if (ore) {
    return [
      { id: ore.id, count: rollCount(ore.min ?? 1, ore.max ?? 1, random) },
    ];
  }
  if (BLOCK_DROPS[id]) return [{ id: BLOCK_DROPS[id], count: 1 }];

  if (id === 'gravel' && random() < 0.1) return [{ id: 'flint', count: 1 }];

  if (id.endsWith('_leaves') || id.startsWith('leaves_')) {
    const drops = [];
    const sapling = SAPLING_BY_LEAVES[id];
    if (sapling && random() < 0.05) drops.push({ id: sapling, count: 1 });
    if (random() < 0.02) drops.push({ id: 'stick', count: 1 });
    if ((id === 'oak_leaves' || id === 'dark_oak_leaves') && random() < 0.01)
      drops.push({ id: 'apple', count: 1 });
    return drops;
  }

  // Glass shatters without silk touch.
  if (
    (id === 'glass' || id.includes('stained_glass') || id === 'glass_pane') &&
    id !== 'tinted_glass'
  ) {
    return [];
  }

  return [{ id: fallbackDropId || id, count: 1 }];
}
