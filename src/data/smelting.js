// Furnace recipes, fuels and the per-furnace simulation step. Kept free of
// DOM/engine code so the furnace UI, the world tick and tests share it.

const LOGS = [
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
  'stripped_oak_log',
  'stripped_birch_log',
  'stripped_spruce_log',
  'stripped_jungle_log',
  'stripped_acacia_log',
  'stripped_dark_oak_log',
  'stripped_mangrove_log',
  'wood',
];

const PLANKS = [
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
];

/** input id -> output id */
export const SMELTING_RECIPES = {
  raw_iron: 'iron_ingot',
  iron_ore: 'iron_ingot',
  deepslate_iron_ore: 'iron_ingot',
  raw_gold: 'gold_ingot',
  gold_ore: 'gold_ingot',
  deepslate_gold_ore: 'gold_ingot',
  raw_copper: 'copper_ingot',
  copper_ore: 'copper_ingot',
  deepslate_copper_ore: 'copper_ingot',
  diamond_ore: 'diamond',
  deepslate_diamond_ore: 'diamond',
  coal_ore: 'coal',
  deepslate_coal_ore: 'coal',
  sand: 'glass',
  red_sand: 'glass',
  cobblestone: 'stone',
  stone: 'smooth_stone',
  cobbled_deepslate: 'deepslate',
  clay: 'terracotta',
  netherrack: 'nether_bricks',
  cactus: 'green_dye',
  beef: 'steak',
  porkchop: 'cooked_porkchop',
  chicken: 'cooked_chicken',
  mutton: 'cooked_mutton',
  cod: 'cooked_cod',
  salmon: 'cooked_salmon',
  rabbit: 'cooked_rabbit',
  potato: 'baked_potato',
  kelp: 'dried_kelp',
  ...Object.fromEntries(LOGS.map((id) => [id, 'charcoal'])),
};

/** fuel id -> burn time in seconds (Minecraft: 10s per item smelted) */
export const FUEL_BURN_SECONDS = {
  coal: 80,
  charcoal: 80,
  coal_block: 800,
  lava_bucket: 1000,
  blaze_rod: 120,
  stick: 5,
  bamboo: 2.5,
  ...Object.fromEntries(LOGS.map((id) => [id, 15])),
  ...Object.fromEntries(PLANKS.map((id) => [id, 15])),
  crafting_table: 15,
  chest: 15,
  bookshelf: 15,
  ladder: 15,
  pick_wood: 10,
  axe_wood: 10,
  shovel_wood: 10,
  sword_wood: 10,
  hoe_wood: 10,
};

export const SMELT_SECONDS = 10;
export const FURNACE_STACK_LIMIT = 64;

export function getSmeltResult(inputId) {
  return SMELTING_RECIPES[inputId] ?? null;
}

export function getFuelSeconds(fuelId) {
  return FUEL_BURN_SECONDS[fuelId] ?? 0;
}

export function isSmeltable(id) {
  return Boolean(getSmeltResult(id));
}

export function isFuel(id) {
  return getFuelSeconds(id) > 0;
}

export function createFurnaceState() {
  return {
    input: null,
    fuel: null,
    output: null,
    progress: 0, // seconds into the current item
    burnRemaining: 0, // seconds of fuel left
    burnTotal: 0, // burn time of the current fuel item (for the flame gauge)
  };
}

function outputHasRoom(state, outputId) {
  if (!state.output) return true;
  return (
    state.output.id === outputId &&
    (state.output.count ?? 1) < FURNACE_STACK_LIMIT
  );
}

/**
 * Advances one furnace by `deltaSeconds`. Mutates and returns `state`.
 * `makeItem(id, count)` builds output stacks (lets callers set `kind`).
 */
export function tickFurnace(
  state,
  deltaSeconds,
  makeItem = (id, count) => ({ id, count, kind: 'item' })
) {
  if (!state) return state;
  let remaining = Math.max(0, Number(deltaSeconds) || 0);

  // Step in slices so long offline ticks still process item-by-item.
  while (remaining > 0) {
    const outputId = state.input ? getSmeltResult(state.input.id) : null;
    const canSmelt = Boolean(outputId) && outputHasRoom(state, outputId);

    if (state.burnRemaining <= 0 && canSmelt && state.fuel) {
      const burn = getFuelSeconds(state.fuel.id);
      if (burn > 0) {
        state.burnTotal = burn;
        state.burnRemaining = burn;
        state.fuel.count = (state.fuel.count ?? 1) - 1;
        if (state.fuel.count <= 0) {
          // Lava buckets leave the bucket behind.
          state.fuel =
            state.fuel.id === 'lava_bucket' ? makeItem('bucket', 1) : null;
        }
      }
    }

    if (state.burnRemaining <= 0) {
      // Unlit: progress cools back down.
      state.progress = 0;
      break;
    }

    const step = Math.min(remaining, state.burnRemaining);
    state.burnRemaining -= step;
    remaining -= step;

    if (!canSmelt) {
      state.progress = 0;
      continue;
    }

    state.progress += step;
    if (state.progress >= SMELT_SECONDS) {
      // Carry the extra time over so long ticks are not lost.
      const overflow = state.progress - SMELT_SECONDS;
      state.progress = 0;
      remaining += overflow;
      state.burnRemaining += overflow;
      if (state.output) state.output.count = (state.output.count ?? 1) + 1;
      else state.output = makeItem(outputId, 1);
      state.input.count = (state.input.count ?? 1) - 1;
      if (state.input.count <= 0) state.input = null;
    }
  }

  if (state.burnRemaining <= 0) state.burnRemaining = 0;
  return state;
}
