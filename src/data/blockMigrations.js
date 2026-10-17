import { resolveItemKind } from './itemKinds.js';

const LEGACY_BLOCK_ID_MAP = {
  grass: 'grass_block',
  grass_tall: 'short_grass',
  flower_rose: 'poppy',
  flower_dandelion: 'dandelion',
  flower_azure: 'azure_bluet',
  flower_blue_orchid: 'blue_orchid',
  flower_cornflower: 'cornflower',
  flower_allium: 'allium',
  flower_lily_valley: 'lily_of_the_valley',
  flower_oxeye: 'oxeye_daisy',
  flower_tulip_orange: 'orange_tulip',
  flower_tulip_pink: 'pink_tulip',
  flower_tulip_red: 'red_tulip',
  flower_tulip_white: 'white_tulip',
  flower_wither_rose: 'wither_rose',
  flower_lilac: 'lilac',
  flower_peony: 'peony',
  flower_rose_bush: 'rose_bush',
  flower_sunflower_front: 'sunflower',
};

// Ores used to share their id with the item they should drop (a "coal"
// block in the world, "coal" in the inventory). The world now uses *_ore
// ids and the inventory keeps plain items.
const LEGACY_ORE_BLOCK_MAP = {
  coal: 'coal_ore',
  iron: 'iron_ore',
  gold: 'gold_ore',
  copper: 'copper_ore',
  diamond: 'diamond_ore',
};
const LEGACY_ORE_ITEM_MAP = {
  iron: 'raw_iron',
  gold: 'raw_gold',
  copper: 'raw_copper',
};

export function migrateBlockId(id) {
  return LEGACY_BLOCK_ID_MAP[id] || id;
}

/** Saved world blocks (changedBlocks). */
export function migrateWorldBlockId(id) {
  return LEGACY_ORE_BLOCK_MAP[id] || id;
}

export function migrateInventoryItem(item) {
  if (!item || typeof item !== 'object') return item;
  const nextId = LEGACY_ORE_ITEM_MAP[item.id] || migrateBlockId(item.id);
  const nextKind = resolveItemKind(nextId, item.kind);
  if (nextId === item.id && nextKind === item.kind) return item;
  return { ...item, id: nextId, kind: nextKind };
}
