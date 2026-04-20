/**
 * Loot Tables for ArloCraft: The Grandmaster's Vanguard.
 * Provides weighted randomization pools for chests and structures.
 */

export const LOOT_TABLES = {
  // Standard survival village chests
  common_village: [
    { id: 'apple', weight: 15, count: [1, 3] },
    { id: 'bread', weight: 12, count: [1, 4] },
    { id: 'oak_log', weight: 10, count: [4, 12] },
    { id: 'cobblestone', weight: 10, count: [8, 16] },
    { id: 'sword_wood', weight: 5, count: [1, 1] },
    { id: 'pick_wood', weight: 5, count: [1, 1] },
    { id: 'torch', weight: 15, count: [4, 8] },
    { id: 'iron_ingot', weight: 3, count: [1, 2] },
    { id: 'gold_ingot', weight: 1, count: [1, 1] },
  ],

  // Desert town variation
  desert_loot: [
    { id: 'sandstone', weight: 15, count: [8, 16] },
    { id: 'cactus', weight: 10, count: [2, 4] },
    { id: 'gold_ingot', weight: 8, count: [1, 3] },
    { id: 'iron_ingot', weight: 8, count: [1, 3] },
    { id: 'tomato', weight: 10, count: [2, 4] }, // Desert food
    { id: 'dead_bush', weight: 5, count: [1, 2] },
    { id: 'glass', weight: 6, count: [4, 8] },
    { id: 'sledge_iron', weight: 2, count: [1, 1] },
  ],

  // High-level Castle loot
  castle_loot: [
    { id: 'iron_ingot', weight: 12, count: [2, 6] },
    { id: 'gold_ingot', weight: 10, count: [2, 4] },
    { id: 'diamond', weight: 4, count: [1, 2] },
    { id: 'sledge_iron', weight: 6, count: [1, 1] },
    { id: 'power_blade', weight: 2, count: [1, 1] },
    { id: 'book', weight: 8, count: [1, 3] },
    { id: 'ender_pearl', weight: 5, count: [1, 2] },
    { id: 'cobblestone_wall', weight: 10, count: [8, 16] },
    { id: 'sea_lantern', weight: 8, count: [1, 2] },
  ],

  // Cave: Lush
  cave_lush: [
    { id: 'moss_block', weight: 15, count: [4, 8] },
    { id: 'clay', weight: 12, count: [8, 16] },
    { id: 'glow_berries', weight: 10, count: [2, 4] },
    { id: 'spore_blossom', weight: 5, count: [1, 1] },
    { id: 'apple', weight: 8, count: [1, 2] },
  ],

  // Cave: Dripstone
  cave_dripstone: [
    { id: 'dripstone_block', weight: 20, count: [8, 16] },
    { id: 'copper_ingot', weight: 15, count: [2, 6] },
    { id: 'iron_ingot', weight: 10, count: [1, 3] },
    { id: 'bucket', weight: 5, count: [1, 1] },
  ],

  // Cave: Deep Dark
  cave_deep_dark: [
    { id: 'sculk', weight: 15, count: [8, 32] },
    { id: 'echo_shard', weight: 5, count: [1, 2] },
    { id: 'diamond', weight: 3, count: [1, 1] },
    { id: 'bone', weight: 10, count: [2, 4] },
    { id: 'candle', weight: 8, count: [1, 4] },
  ],

  // Cave: Ice
  cave_ice: [
    { id: 'packed_ice', weight: 15, count: [8, 16] },
    { id: 'snowball', weight: 10, count: [8, 16] },
    { id: 'blue_ice', weight: 5, count: [2, 4] },
    { id: 'iron_ingot', weight: 5, count: [1, 2] },
  ],

  // Cave: Mushroom
  cave_mushroom: [
    { id: 'mycelium', weight: 15, count: [4, 8] },
    { id: 'mushroom_brown', weight: 10, count: [2, 6] },
    { id: 'mushroom_red', weight: 10, count: [2, 6] },
    { id: 'bowl', weight: 5, count: [1, 2] },
  ],

  // Cave: Default
  cave_default: [
    { id: 'coal', weight: 20, count: [4, 12] },
    { id: 'iron_ingot', weight: 15, count: [1, 4] },
    { id: 'torch', weight: 25, count: [8, 32] },
    { id: 'bread', weight: 10, count: [1, 2] },
    { id: 'gold_ingot', weight: 5, count: [1, 2] },
  ],

  // Rare High-Tech/Virus containers
  tech_loot: [
    { id: 'iron_ingot', weight: 10, count: [4, 8] },
    { id: 'gold_ingot', weight: 8, count: [2, 4] },
    { id: 'diamond', weight: 5, count: [1, 3] },
    { id: 'byte_axe', weight: 2, count: [1, 1] },
    { id: 'glitch_saber', weight: 1, count: [1, 1] },
    { id: 'data_drill', weight: 3, count: [1, 1] },
    { id: 'scanner', weight: 4, count: [1, 1] },
    { id: 'tnt', weight: 8, count: [1, 2] },
  ],
};

/**
 * Rolls for loot from a given table.
 * @param {string} tableId - Key in LOOT_TABLES
 * @param {number} rolls - Number of items to pick
 * @returns {Array} List of {id, count} objects
 */
export function rollLoot(tableId, rolls = 3) {
  const table = LOOT_TABLES[tableId] || LOOT_TABLES.common_village;
  const totalWeight = table.reduce((sum, item) => sum + item.weight, 0);
  const results = [];

  for (let i = 0; i < rolls; i++) {
    let rng = Math.random() * totalWeight;
    for (const entry of table) {
      rng -= entry.weight;
      if (rng <= 0) {
        const count =
          entry.count[0] +
          Math.floor(Math.random() * (entry.count[1] - entry.count[0] + 1));
        results.push({ id: entry.id, count });
        break;
      }
    }
  }
  return results;
}
