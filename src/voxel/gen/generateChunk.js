import { BLOCKS } from '../../data/blocks.js';
import { BIOME_BY_ID } from '../../data/biomes.js';
import { Noise } from '../../world/Noise.js';
import {
  getCaveCell,
  getCaveProfileForCell,
} from '../../world/terrain/CaveGenerator.js';
import { BIOME_GROUND_LIFE } from '../../world/terrain/DecorationPlacer.js';
import { CHUNK_SIZE, CHUNK_MASK, localIndex } from '../VoxelStore.js';
import { getTerrainSampler, SEA_LEVEL, MIN_Y } from './terrain.js';
import { TREE_BUILDERS, pickTreeType } from './trees.js';
import { getStructurePlanner } from '../../world/structures/StructurePlanner.js';

/**
 * Generates one CHUNK_SIZE³ chunk of terrain. Pure and deterministic for a
 * seed, so it runs in the chunk worker and, as a fallback, on the main
 * thread with identical results.
 *
 * Returns { blocks: Uint16Array (indices into `palette`), palette: string[],
 *           outside: [x, y, z, paletteIndex, ...] } where `outside` holds
 * blocks that trees place in neighbouring chunks (applied fill-only).
 */

const BLOCK_DATA_BY_ID = new Map(BLOCKS.map((block) => [block.id, block]));
const DEEPSLATE_Y = -8;
// Columns this far apart in x/z share a tree "cell"; one candidate each.
const TREE_CELL = 3;

let currentSeedString = null;
let caveNoise = null;
let numericSeed = 1;

function getNumericSeed(seedString) {
  const numeric = Number(seedString);
  if (Number.isFinite(numeric)) return Math.floor(Math.abs(numeric)) + 1;
  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0) + 1;
}

function useSeed(seedString) {
  if (currentSeedString === seedString) return;
  currentSeedString = seedString;
  caveNoise = new Noise(seedString);
  numericSeed = getNumericSeed(seedString);
  columnCache.clear();
}

function hash2D(x, z, salt) {
  let h =
    (x * 374761393 + z * 668265263 + (numericSeed + salt) * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash3D(x, y, z, salt) {
  return hash2D(x + Math.imul(y, 73856093), z ^ Math.imul(y, 19349663), salt);
}

/** Small deterministic RNG (mulberry32). */
function smoothstep01(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Column data: height, biome, river and slope for every column of a chunk
// column, shared by all vertical chunks of that column.
// ---------------------------------------------------------------------------
const columnCache = new Map();
const COLUMN_CACHE_LIMIT = 1024;
const PADDED = CHUNK_SIZE + 2;
const NO_EXCLUSION = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
let exclusionCorruption = false;

/** Columns kept free of trees for villages and structures. */
function getTreeExclusion(cx, cz) {
  return (
    getStructurePlanner(currentSeedString).treeExclusion(
      cx,
      cz,
      exclusionCorruption
    ) ?? NO_EXCLUSION
  );
}

function getColumnInfo(terrain, cx, cz) {
  const key = `${cx}|${cz}`;
  let info = columnCache.get(key);
  if (info) return info;

  const area = CHUNK_SIZE * CHUNK_SIZE;
  info = {
    heights: new Int32Array(area),
    slopes: new Uint8Array(area),
    biomes: new Array(area),
    river: new Float32Array(area),
    // Low-frequency patch noise (-1..1) for surface variety and plants.
    patch: new Float32Array(area),
    // 1 where trees must not grow (villages and other structures).
    noTrees: getTreeExclusion(cx, cz),
  };
  // Heights include a one-block border for slope detection. Interior
  // columns get their biome from the same shape sample as their height.
  const padded = new Int32Array(PADDED * PADDED);
  for (let pz = 0; pz < PADDED; pz++) {
    for (let px = 0; px < PADDED; px++) {
      const wx = cx * CHUNK_SIZE + px - 1;
      const wz = cz * CHUNK_SIZE + pz - 1;
      const interior =
        px >= 1 && px <= CHUNK_SIZE && pz >= 1 && pz <= CHUNK_SIZE;
      if (!interior) {
        padded[px + pz * PADDED] = terrain.height(wx, wz);
        continue;
      }
      const col = terrain.column(wx, wz);
      const i = px - 1 + (pz - 1) * CHUNK_SIZE;
      padded[px + pz * PADDED] = col.h;
      info.biomes[i] =
        BIOME_BY_ID.get(col.biomeId) ?? BIOME_BY_ID.get('plains');
      info.river[i] = col.river;
      info.patch[i] = caveNoise.simplex2D(wx / 11 + 517.3, wz / 11 - 211.9);
    }
  }
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const i = lx + lz * CHUNK_SIZE;
      const p = lx + 1 + (lz + 1) * PADDED;
      const h = padded[p];
      info.heights[i] = h;
      info.slopes[i] = Math.max(
        Math.abs(padded[p + 1] - h),
        Math.abs(padded[p - 1] - h),
        Math.abs(padded[p + PADDED] - h),
        Math.abs(padded[p - PADDED] - h)
      );
    }
  }
  if (columnCache.size >= COLUMN_CACHE_LIMIT) {
    columnCache.delete(columnCache.keys().next().value);
  }
  columnCache.set(key, info);
  return info;
}

// ---------------------------------------------------------------------------
// Chunk plan: dense block array with a chunk-local palette.
// ---------------------------------------------------------------------------
class ChunkPlan {
  constructor(cx, cy, cz) {
    this.startX = cx * CHUNK_SIZE;
    this.startY = cy * CHUNK_SIZE;
    this.startZ = cz * CHUNK_SIZE;
    this.blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    this.palette = [null];
    this.paletteIndex = new Map();
    this.outside = [];
  }

  indexOf(id) {
    let idx = this.paletteIndex.get(id);
    if (idx === undefined) {
      idx = this.palette.length;
      this.palette.push(id);
      this.paletteIndex.set(id, idx);
    }
    return idx;
  }

  inside(x, y, z) {
    const lx = x - this.startX;
    const ly = y - this.startY;
    const lz = z - this.startZ;
    return (
      lx >= 0 &&
      lx < CHUNK_SIZE &&
      ly >= 0 &&
      ly < CHUNK_SIZE &&
      lz >= 0 &&
      lz < CHUNK_SIZE
    );
  }

  idx(x, y, z) {
    return localIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK);
  }

  set(x, y, z, id) {
    if (this.inside(x, y, z)) {
      this.blocks[this.idx(x, y, z)] = id ? this.indexOf(id) : 0;
    } else if (id) {
      this.outside.push(x, y, z, this.indexOf(id));
    }
  }

  /** Places a block only into air (leaves, plants). */
  fill(x, y, z, id) {
    if (this.inside(x, y, z)) {
      const i = this.idx(x, y, z);
      if (this.blocks[i] === 0) this.blocks[i] = this.indexOf(id);
    } else {
      this.outside.push(x, y, z, this.indexOf(id));
    }
  }

  get(x, y, z) {
    if (!this.inside(x, y, z)) return null;
    return this.palette[this.blocks[this.idx(x, y, z)]];
  }

  has(x, y, z) {
    return this.inside(x, y, z) && this.blocks[this.idx(x, y, z)] !== 0;
  }
}

// ---------------------------------------------------------------------------
// Underground: ore veins and stone variety
// ---------------------------------------------------------------------------
const HOST_ROCK = new Set([
  'stone',
  'deepslate',
  'tuff',
  'andesite',
  'diorite',
  'granite',
]);

// attempts = veins per 16³ chunk (fractional part is a chance of one more)
const ORES = [
  {
    id: 'coal_ore',
    deep: 'deepslate_coal_ore',
    minY: -10,
    maxY: 140,
    attempts: 2.4,
    size: [6, 13],
  },
  {
    id: 'iron_ore',
    deep: 'deepslate_iron_ore',
    minY: -60,
    maxY: 70,
    attempts: 1.8,
    size: [4, 9],
  },
  {
    id: 'copper_ore',
    deep: 'deepslate_copper_ore',
    minY: -20,
    maxY: 60,
    attempts: 1.5,
    size: [5, 10],
  },
  {
    id: 'gold_ore',
    deep: 'deepslate_gold_ore',
    minY: -64,
    maxY: -5,
    attempts: 0.7,
    size: [3, 8],
  },
  {
    id: 'redstone_ore',
    deep: 'deepslate_redstone_ore',
    minY: -64,
    maxY: -20,
    attempts: 0.9,
    size: [3, 7],
  },
  {
    id: 'lapis_ore',
    deep: 'deepslate_lapis_ore',
    minY: -50,
    maxY: 10,
    attempts: 0.5,
    size: [3, 6],
  },
  {
    id: 'diamond_ore',
    deep: 'deepslate_diamond_ore',
    minY: -64,
    maxY: -40,
    attempts: 0.45,
    size: [2, 6],
  },
  {
    id: 'emerald_ore',
    deep: 'deepslate_emerald_ore',
    minY: 20,
    maxY: 160,
    attempts: 0.4,
    size: [1, 2],
    mountainsOnly: true,
  },
];

const STONE_BLOBS = [
  { id: 'granite', minY: -10, maxY: 120, attempts: 0.35, radius: [2, 4] },
  { id: 'diorite', minY: -10, maxY: 120, attempts: 0.35, radius: [2, 4] },
  { id: 'andesite', minY: -10, maxY: 120, attempts: 0.35, radius: [2, 4] },
  { id: 'tuff', minY: -64, maxY: 0, attempts: 0.3, radius: [2, 4] },
  { id: 'gravel', minY: -40, maxY: 80, attempts: 0.25, radius: [1, 3] },
  { id: 'dirt', minY: 0, maxY: 120, attempts: 0.25, radius: [1, 3] },
];

function attemptsFor(rng, attempts) {
  return Math.floor(attempts) + (rng() < attempts % 1 ? 1 : 0);
}

function placeUnderground(plan, rng, mountainous) {
  const { startX, startY, startZ } = plan;
  const replaceHost = (x, y, z, id, deepId) => {
    const current = plan.get(x, y, z);
    if (!current || !HOST_ROCK.has(current)) return;
    plan.set(x, y, z, current === 'deepslate' && deepId ? deepId : id);
  };

  for (const blob of STONE_BLOBS) {
    const n = attemptsFor(rng, blob.attempts);
    for (let i = 0; i < n; i++) {
      const x = startX + Math.floor(rng() * CHUNK_SIZE);
      const y = startY + Math.floor(rng() * CHUNK_SIZE);
      const z = startZ + Math.floor(rng() * CHUNK_SIZE);
      if (y < blob.minY || y > blob.maxY) continue;
      const r = blob.radius[0] + rng() * (blob.radius[1] - blob.radius[0]);
      const ri = Math.ceil(r);
      for (let dx = -ri; dx <= ri; dx++)
        for (let dy = -ri; dy <= ri; dy++)
          for (let dz = -ri; dz <= ri; dz++) {
            if (dx * dx + dy * dy + dz * dz > r * r) continue;
            replaceHost(x + dx, y + dy, z + dz, blob.id);
          }
    }
  }

  for (const ore of ORES) {
    if (ore.mountainsOnly && !mountainous) continue;
    if (startY + CHUNK_SIZE < ore.minY || startY > ore.maxY) continue;
    const n = attemptsFor(rng, ore.attempts);
    for (let i = 0; i < n; i++) {
      let x = startX + Math.floor(rng() * CHUNK_SIZE);
      let y = startY + Math.floor(rng() * CHUNK_SIZE);
      let z = startZ + Math.floor(rng() * CHUNK_SIZE);
      if (y < ore.minY || y > ore.maxY) continue;
      const size =
        ore.size[0] + Math.floor(rng() * (ore.size[1] - ore.size[0] + 1));
      // A short random walk makes a natural-looking vein.
      for (let s = 0; s < size; s++) {
        replaceHost(x, y, z, ore.id, ore.deep);
        const dir = Math.floor(rng() * 6);
        if (dir === 0) x++;
        else if (dir === 1) x--;
        else if (dir === 2) y++;
        else if (dir === 3) y--;
        else if (dir === 4) z++;
        else z--;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Surface rules
// ---------------------------------------------------------------------------
// Snow covers everything above this height (plus a little noise).
const SNOW_LINE = SEA_LEVEL + 84;
const SNOW_BIOMES = new Set(['snowy_peaks', 'snowy_slopes', 'grove']);

function surfaceFor(biome, h, slope, patch, river) {
  const underwater = h < SEA_LEVEL;
  if (underwater) {
    const bed = biome.underwaterBlock ?? 'sand';
    // Patchy beds: the biome's bed with drifts of sand, gravel and clay;
    // shallow water near shores is mostly sand.
    const shallow = h >= SEA_LEVEL - 3 && bed !== 'mud';
    const top =
      patch < -0.55
        ? 'clay'
        : patch < -0.15
          ? 'gravel'
          : patch < 0.35 || shallow
            ? 'sand'
            : bed;
    return {
      top,
      filler: top === 'clay' ? 'clay' : bed === 'mud' ? 'mud' : 'sand',
      depth: 3,
    };
  }
  let top = biome.surfaceBlock ?? 'grass_block';
  let filler = biome.fillerBlock ?? 'dirt';
  const sandy = top === 'sand' || top === 'red_sand';
  const snowy = top === 'snow_block';
  const steep = slope >= 4 || (biome.rockySlopes && slope >= 2);
  const aboveSnowLine = h >= SNOW_LINE + patch * 6;
  if (steep && !sandy) {
    // Snow clings to moderate slopes; anything steeper is bare rock.
    if (!((snowy || aboveSnowLine) && slope < 4)) top = 'stone';
    filler = 'stone';
  } else if (aboveSnowLine && !sandy) {
    top = 'snow_block';
  } else if (slope === 3 && !sandy && !snowy && h > SEA_LEVEL + 24) {
    // Scree on mountain flanks.
    top = patch > 0.1 ? 'gravel' : 'stone';
    filler = top === 'gravel' ? 'gravel' : 'stone';
  } else if (
    river > 0 &&
    h <= SEA_LEVEL + 1 &&
    !snowy &&
    top !== 'mud' &&
    patch > -0.3
  ) {
    // Sandy river banks.
    top = 'sand';
    filler = 'sand';
  } else if (biome.patchBlock && patch > 0.3) {
    top = biome.patchBlock;
  } else if (biome.id === 'windswept_hills' && patch < -0.45) {
    top = 'gravel';
  } else if (biome.id === 'dark_forest' && patch > 0.45) {
    top = 'podzol';
  }
  if (SNOW_BIOMES.has(biome.id) && top === 'grass_block') top = 'snow_block';
  const sandTop = top === 'sand' || top === 'red_sand';
  return {
    top,
    filler,
    depth: sandTop ? 4 : 3,
    deepFiller: sandTop
      ? top === 'red_sand'
        ? 'terracotta'
        : 'sandstone'
      : null,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
export function generateChunkData({
  cx,
  cy,
  cz,
  seedString,
  corruptionEnabled = false,
  cavesEnabled = true,
}) {
  useSeed(seedString);
  if (exclusionCorruption !== Boolean(corruptionEnabled)) {
    exclusionCorruption = Boolean(corruptionEnabled);
    columnCache.clear();
  }
  const terrain = getTerrainSampler(seedString);
  const plan = new ChunkPlan(cx, cy, cz);
  const columns = getColumnInfo(terrain, cx, cz);
  const caveCells = new Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  const endY = startY + CHUNK_SIZE;
  let mountainous = false;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = startX + lx;
      const wz = startZ + lz;
      const ci = lx + lz * CHUNK_SIZE;
      const h = columns.heights[ci];
      const biome = columns.biomes[ci];
      if (h > SEA_LEVEL + 50) mountainous = true;
      const slope = columns.slopes[ci];
      const surface = surfaceFor(
        biome,
        h,
        slope,
        columns.patch[ci],
        columns.river[ci]
      );
      // Caves only break through on slopes and in rare spots, never under
      // water or on shores, so the surface is not riddled with pinholes.
      const entrance =
        h > SEA_LEVEL + 2 && (slope >= 3 || columns.patch[ci] > 0.8);
      const deepslateY = DEEPSLATE_Y + Math.floor(hash2D(wx, wz, 13) * 4);
      let surfaceCarved = false;

      for (let y = startY; y < endY; y++) {
        if (y > h) {
          if (y <= SEA_LEVEL) {
            const frozenTop = biome.frozenWater && y === SEA_LEVEL;
            plan.set(wx, y, wz, frozenTop ? 'ice' : 'water');
          }
          continue;
        }
        if (y <= MIN_Y) {
          plan.set(wx, y, wz, 'bedrock');
          continue;
        }
        if (y <= MIN_Y + 3 && hash3D(wx, y, wz, 5) < 0.6 - (y - MIN_Y) * 0.18) {
          plan.set(wx, y, wz, 'bedrock');
          continue;
        }

        const cave = getCaveCell(
          caveNoise,
          wx,
          y,
          wz,
          h,
          cavesEnabled,
          numericSeed,
          entrance
        );
        if (cave.carve) {
          caveCells[localIndex(lx, y - startY, lz)] = cave;
          if (y === h) surfaceCarved = true;
          if (cave.fluid === 'water' || cave.fluid === 'ice_water')
            plan.set(wx, y, wz, 'water');
          else if (cave.fluid === 'lava') plan.set(wx, y, wz, 'lava');
          continue;
        }

        const depth = h - y;
        let id;
        if (depth === 0) id = surface.top;
        else if (depth <= surface.depth) id = surface.filler;
        else if (surface.deepFiller && depth <= surface.depth + 3)
          id = surface.deepFiller;
        else id = y < deepslateY ? 'deepslate' : 'stone';
        plan.set(wx, y, wz, id);
      }

      // ── Surface features (only in the chunk holding the surface) ──
      const above = h + 1;
      if (above < startY || above >= endY || surfaceCarved) continue;
      decorateColumn(
        plan,
        biome,
        surface.top,
        wx,
        h,
        wz,
        corruptionEnabled,
        columns.noTrees[ci] === 1
      );
    }
  }

  placeUnderground(
    plan,
    rngFrom(hash3D(cx, cy, cz, 3) * 4294967296),
    mountainous
  );

  if (cavesEnabled)
    decorateCaves(plan, columns, caveCells, startX, startY, startZ, endY);

  return { blocks: plan.blocks, palette: plan.palette, outside: plan.outside };
}

const FLOWER_RE =
  /poppy|dandelion|tulip|allium|bluet|daisy|cornflower|lily_of|orchid|sunflower|lilac|peony|rose|pink_petals/;
const CROP_RE = /^(wheat|beetroot|potato|carrot|tomato|blueberry|strawberry)$/;
const plantSets = new Map();

/** Splits a biome's plant list into ground cover and flowers (cached). */
function plantSetFor(biome) {
  let set = plantSets.get(biome.id);
  if (set) return set;
  const plants = (biome.plants ?? BIOME_GROUND_LIFE[biome.id] ?? []).filter(
    (id) => id && id !== 'lily_pad' && id !== 'sugar_cane'
  );
  const cover = plants.filter((id) => !FLOWER_RE.test(id) && !CROP_RE.test(id));
  const flowers = plants.filter((id) => FLOWER_RE.test(id));
  const crops = plants.filter((id) => CROP_RE.test(id));
  const flowery =
    biome.id === 'flower_forest' ||
    biome.id === 'meadow' ||
    biome.id === 'sunflower_plains' ||
    biome.id === 'cherry_grove';
  set = {
    cover,
    flowers,
    crops,
    // Share of soil columns with grass/ferns, like Minecraft's dense cover.
    coverDensity: Math.min(0.55, (biome.plantDensity ?? 0.12) * 1.6),
    flowerBase: flowery ? 0.12 : 0.004,
  };
  plantSets.set(biome.id, set);
  return set;
}

function placePlant(plan, wx, y, wz, plant) {
  if (CROP_RE.test(plant)) {
    plant = `${plant}_stage${1 + Math.floor(hash2D(wx, wz, 64) * 3)}`;
  }
  const data = BLOCK_DATA_BY_ID.get(plant);
  if (!data) return;
  plan.fill(wx, y, wz, plant);
  const pairOffset = Number(data.pairOffsetY);
  if (data.pairId && Number.isFinite(pairOffset) && pairOffset !== 0) {
    plan.fill(wx, y + pairOffset, wz, data.pairId);
  }
}

function decorateColumn(
  plan,
  biome,
  topId,
  wx,
  h,
  wz,
  corruptionEnabled,
  noTrees
) {
  const y = h + 1;
  const underwater = h < SEA_LEVEL;

  if (corruptionEnabled && !underwater) {
    if (hash2D(wx - 991, wz + 417, 1) > 0.9992)
      return plan.set(wx, y, wz, 'virus');
    if (hash2D(wx + 613, wz - 271, 2) > 0.985)
      return plan.set(wx, y, wz, 'arlo');
  }

  if (underwater) {
    // Kelp in deeper water, lily pads on calm shallow swamp water.
    const depth = SEA_LEVEL - h;
    if (depth >= 4 && hash2D(wx, wz, 31) < 0.06 && topId !== 'clay') {
      const len = 1 + Math.floor(hash2D(wx, wz, 32) * Math.min(depth - 1, 6));
      for (let i = 0; i < len; i++) plan.set(wx, y + i, wz, 'kelp');
    }
    if (
      depth <= 2 &&
      biome.plants?.includes('lily_pad') &&
      hash2D(wx, wz, 33) < 0.08
    ) {
      plan.fill(wx, SEA_LEVEL + 1, wz, 'lily_pad');
    }
    return;
  }

  const onSoil =
    topId === 'grass_block' ||
    topId === 'podzol' ||
    topId === 'dirt' ||
    topId === 'mud' ||
    topId === 'snow_block' ||
    topId === 'moss_block';

  // Trees: one jittered candidate per TREE_CELL² cell keeps them spaced, and
  // a low-frequency density field makes clearings and dense groves.
  const cellX = Math.floor(wx / TREE_CELL);
  const cellZ = Math.floor(wz / TREE_CELL);
  const jx = Math.floor(hash2D(cellX, cellZ, 41) * TREE_CELL);
  const jz = Math.floor(hash2D(cellX, cellZ, 42) * TREE_CELL);
  const isCandidate =
    wx === cellX * TREE_CELL + jx && wz === cellZ * TREE_CELL + jz;
  if (isCandidate && onSoil && biome.trees && h >= SEA_LEVEL && !noTrees) {
    const n = caveNoise.simplex2D(wx / 44 + 300.5, wz / 44 - 200.5);
    const grove = smoothstep01((n + 0.5) / 0.45) * (0.55 + Math.max(0, n));
    const chance = (biome.treeDensity ?? 0) * TREE_CELL * TREE_CELL * grove;
    if (hash2D(wx, wz, 43) < chance) {
      const type = pickTreeType(biome.trees, hash2D(wx, wz, 44));
      const build = TREE_BUILDERS[type];
      if (build) {
        const rng = rngFrom(hash2D(wx, wz, 45) * 4294967296);
        if (topId === 'grass_block' || topId === 'snow_block')
          plan.set(wx, h, wz, 'dirt');
        build(
          (x, yy, z, id) => plan.set(x, yy, z, id),
          (x, yy, z, id) => plan.fill(x, yy, z, id),
          rng,
          wx,
          y,
          wz
        );
        return;
      }
    }
  }
  if (noTrees) return;

  // Desert cacti and shoreline sugar cane.
  if ((topId === 'sand' || topId === 'red_sand') && h > SEA_LEVEL) {
    if (
      (biome.id === 'desert' || biome.id === 'badlands') &&
      hash2D(wx, wz, 51) < 0.006
    ) {
      const len = 1 + Math.floor(hash2D(wx, wz, 52) * 3);
      for (let i = 0; i < len; i++) plan.set(wx, y + i, wz, 'cactus');
      return;
    }
    if (
      (biome.id === 'desert' || biome.id === 'badlands') &&
      hash2D(wx, wz, 53) < 0.01
    )
      return plan.fill(wx, y, wz, 'dead_bush');
  }
  if (
    h <= SEA_LEVEL + 1 &&
    h >= SEA_LEVEL &&
    (topId === 'sand' || topId === 'grass_block') &&
    hash2D(wx, wz, 54) < 0.05
  ) {
    const len = 1 + Math.floor(hash2D(wx, wz, 55) * 3);
    for (let i = 0; i < len; i++) plan.fill(wx, y + i, wz, 'sugar_cane');
    return;
  }

  if (!onSoil || topId === 'snow_block') return;
  const set = plantSetFor(biome);
  const roll = hash2D(wx, wz, 62);

  // Flowers grow in patches of one or two species, like Minecraft.
  if (set.flowers.length > 0) {
    const fn = caveNoise.simplex2D(wx / 17 + 77.7, wz / 17 - 33.3);
    const inPatch = fn > 0.42;
    const chance = inPatch ? 0.3 + set.flowerBase : set.flowerBase;
    if (roll < chance) {
      const species = Math.floor(
        hash2D(Math.floor(wx / 24), Math.floor(wz / 24), 66) *
          set.flowers.length
      );
      const pick =
        hash2D(wx, wz, 63) < 0.75
          ? species
          : (species + 1) % set.flowers.length;
      return placePlant(plan, wx, y, wz, set.flowers[pick]);
    }
  }
  if (set.crops.length > 0 && hash2D(wx, wz, 67) < 0.003) {
    return placePlant(
      plan,
      wx,
      y,
      wz,
      set.crops[Math.floor(hash2D(wx, wz, 68) * set.crops.length)]
    );
  }
  if (set.cover.length === 0) return;
  // Ground cover thins out in drier patches.
  const cover = set.coverDensity * (0.7 + hash2D(wx >> 3, wz >> 3, 61) * 0.6);
  if (hash2D(wx, wz, 65) >= cover) return;
  placePlant(
    plan,
    wx,
    y,
    wz,
    set.cover[Math.floor(hash2D(wx, wz, 69) * set.cover.length)]
  );
}

function decorateCaves(plan, columns, caveCells, startX, startY, startZ, endY) {
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = startX + lx;
      const wz = startZ + lz;
      const terrainH = columns.heights[lx + lz * CHUNK_SIZE];
      for (
        let wy = Math.min(terrainH - 1, endY - 1);
        wy >= Math.max(MIN_Y + 1, startY);
        wy--
      ) {
        const profile = getCaveProfileForCell(
          caveCells[localIndex(lx, wy - startY, lz)],
          wy
        );
        if (!profile) continue;
        const roll = hash2D(wx + wy * 7, wz - wy * 13, 9371);

        if (!plan.has(wx, wy, wz) && plan.has(wx, wy - 1, wz)) {
          if (
            roll < (profile.vegetationChance || 0) ||
            (profile.sculkChance && roll < profile.sculkChance)
          ) {
            plan.set(wx, wy - 1, wz, profile.floor);
          }
          // Rare cave loot chests.
          if (roll < 0.0006)
            plan.set(wx, wy, wz, `chest:cave_${profile.biome}`);
        }
        if (
          !plan.has(wx, wy, wz) &&
          plan.has(wx, wy + 1, wz) &&
          roll < (profile.stalactiteChance || 0)
        ) {
          plan.set(wx, wy + 1, wz, profile.ceiling);
        }
        if (
          plan.has(wx, wy, wz) &&
          (!plan.has(wx + 1, wy, wz) || !plan.has(wx - 1, wy, wz)) &&
          roll < 0.3
        ) {
          plan.set(wx, wy, wz, profile.wall);
        }
      }
    }
  }
}
