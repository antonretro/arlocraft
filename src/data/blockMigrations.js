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

export function migrateBlockId(id) {
  return LEGACY_BLOCK_ID_MAP[id] || id;
}

export function migrateInventoryItem(item) {
  if (!item || typeof item !== 'object') return item;
  const nextId = migrateBlockId(item.id);
  if (nextId === item.id) return item;
  return { ...item, id: nextId };
}
