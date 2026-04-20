// ---------------------------------------------------------------------------
// DecorationPlacer.js — Pure-function vegetation and decoration placement.
// All state (noise, seed, block data) is passed as parameters so this module
// has no mutable module-level state and is safe to import in both the chunk
// worker and the main thread.
// ---------------------------------------------------------------------------

const SEA_LEVEL = 1;

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------
export const TREE_CONFIGS = {
  oak: { trunk: 'oak_log', leaves: 'oak_leaves', height: 5, radius: 2 },
  birch: { trunk: 'birch_log', leaves: 'birch_leaves', height: 6, radius: 2 },
  pine: { trunk: 'spruce_log', leaves: 'spruce_leaves', height: 7, radius: 1 },
  palm: { trunk: 'jungle_log', leaves: 'jungle_leaves', height: 5, radius: 2 },
  willow: {
    trunk: 'mangrove_log',
    leaves: 'mangrove_leaves',
    height: 4,
    radius: 3,
  },
  cherry: {
    trunk: 'cherry_log',
    leaves: 'cherry_leaves',
    height: 5,
    radius: 2,
  },
  redwood: {
    trunk: 'dark_oak_log',
    leaves: 'dark_oak_leaves',
    height: 10,
    radius: 2,
  },
  crystal: {
    trunk: 'acacia_log',
    leaves: 'acacia_leaves',
    height: 6,
    radius: 2,
  },
};

export const BIOME_GROUND_LIFE = {
  plains: [
    'short_grass',
    'dandelion',
    'poppy',
    'red_tulip',
    'tall_grass_bottom',
    'fern',
    'wheat',
  ],
  forest: [
    'short_grass',
    'fern',
    'mushroom_brown',
    'mushroom_red',
    'poppy',
    'blueberry',
    'strawberry',
    'tall_grass_bottom',
  ],
  meadow: [
    'short_grass',
    'tall_grass_bottom',
    'dandelion',
    'poppy',
    'orange_tulip',
    'red_tulip',
    'pink_tulip',
    'white_tulip',
    'azure_bluet',
    'oxeye_daisy',
    'cornflower',
    'allium',
    'blueberry',
    'lilac',
    'peony',
    'rose_bush',
    'wheat',
    'beetroot',
  ],
  swamp: ['mushroom_brown', 'mushroom_red', 'fern', 'blueberry'],
  desert: ['dead_bush', 'tomato', 'fern'],
  badlands: ['dead_bush', 'carrot', 'fern'],
  canyon: ['dead_bush', 'carrot'],
  highlands: ['potato', 'beetroot', 'fern', 'poppy'],
  alpine: ['potato', 'beetroot', 'fern', 'wheat'],
  tundra: ['potato', 'beetroot', 'fern'],
};

const STAGED_CROPS = [
  'blueberry',
  'strawberry',
  'tomato',
  'potato',
  'carrot',
  'wheat',
  'beetroot',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function hash2D(x, z, seed) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function valueNoise2D(noise, x, z, scale, seed) {
  const sx = x / scale;
  const sz = z / scale;
  const x0 = Math.floor(sx);
  const z0 = Math.floor(sz);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smoothstep(sx - x0);
  const tz = smoothstep(sz - z0);
  const n00 = hash2D(x0, z0, seed);
  const n10 = hash2D(x1, z0, seed);
  const n01 = hash2D(x0, z1, seed);
  const n11 = hash2D(x1, z1, seed);
  return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), tz);
}

function isCorruptedAt(x, z, seed) {
  return hash2D(x * 0.7 - 991, z * 0.7 + 417, seed) > 0.982;
}

function chooseTreeType(x, z, biome, corruptionEnabled, seed) {
  const h = hash2D(x, z, seed);
  if (corruptionEnabled && isCorruptedAt(x, z, seed)) return 'crystal';
  if (biome.id === 'desert') return 'palm';
  if (biome.id === 'forest')
    return h > 0.6 ? 'birch' : h > 0.3 ? 'oak' : 'pine';
  if (biome.id === 'swamp') return 'willow';
  if (biome.id === 'plains' || biome.id === 'meadow')
    return h > 0.8 ? 'cherry' : 'oak';
  if (biome.id === 'highlands') return h > 0.6 ? 'redwood' : 'pine';
  if (biome.id === 'alpine' || biome.id === 'tundra') return 'pine';
  if (biome.id === 'badlands' || biome.id === 'canyon') return 'palm';
  return 'oak';
}

// ---------------------------------------------------------------------------
// getClumpedDensityMask(noise, x, z, type, seed) → 0 | 1
// ---------------------------------------------------------------------------
// Returns 1 inside a vegetation clump patch, 0 outside.
// `type` is 'trees' or 'plants' — plants use a higher frequency.
export function getClumpedDensityMask(noise, x, z, type = 'trees', seed) {
  if (!noise) return 0.5;
  const freq = type === 'trees' ? 0.02 : 0.04;
  const n = noise.simplex2D(x * freq, z * freq) * 0.5 + 0.5;
  return Math.pow(n, 1.3) > 0.4 ? 1.0 : 0.0;
}

// ---------------------------------------------------------------------------
// shouldPlaceTree(noise, x, z, height, biome, seed) → boolean
// ---------------------------------------------------------------------------
export function shouldPlaceTree(noise, x, z, height, biome, seed) {
  if (height <= SEA_LEVEL + 1) return false;
  const density = biome.treeDensity ?? 0.05;
  if (density <= 0) return false;
  const clumpMask = getClumpedDensityMask(noise, x, z, 'trees', seed);
  if (clumpMask < 0.5) return false;
  const n = valueNoise2D(noise, x, z, 1.8, seed + 555);
  return n < density * 1.5;
}

// ---------------------------------------------------------------------------
// addTree(planMap, changedMap, x, y, z, biome, corruptionEnabled, noise, seed, setPlannedBlock)
// ---------------------------------------------------------------------------
// Plants a tree by writing trunk and leaf blocks into planMap via
// setPlannedBlock.  The setPlannedBlock callback signature:
//   (planMap, changedMap, x, y, z, blockId) → void
export function addTree(
  planMap,
  changedMap,
  x,
  y,
  z,
  biome,
  corruptionEnabled,
  noise,
  seed,
  setPlannedBlock
) {
  const treeType = chooseTreeType(x, z, biome, corruptionEnabled, seed);
  const config = TREE_CONFIGS[treeType] ?? TREE_CONFIGS.oak;
  const trunkHeight =
    config.height + Math.floor(hash2D(x + 7, z - 19, seed) * 2);

  for (let i = 0; i < trunkHeight; i++) {
    setPlannedBlock(planMap, changedMap, x, y + i, z, config.trunk);
  }

  const leafBase = y + trunkHeight - 2;
  const radius = config.radius;
  for (let lx = -radius; lx <= radius; lx++) {
    for (let lz = -radius; lz <= radius; lz++) {
      for (let ly = 0; ly <= 3; ly++) {
        const distSq = lx * lx + lz * lz;
        if (distSq > radius * radius) continue;
        if (ly === 3 && distSq > 0) continue;
        setPlannedBlock(
          planMap,
          changedMap,
          x + lx,
          leafBase + ly,
          z + lz,
          config.leaves
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// addGroundLife(planMap, changedMap, x, y, z, biome, noise, seed, setPlannedPlant)
// ---------------------------------------------------------------------------
// Places a random floor decoration (flower, grass, mushroom, crop …) if the
// noise pattern lands in a clump.  The setPlannedPlant callback handles
// two-block tall plants automatically:
//   (planMap, changedMap, x, y, z, blockId) → void
export function addGroundLife(
  planMap,
  changedMap,
  x,
  y,
  z,
  biome,
  noise,
  seed,
  setPlannedPlant,
  surfaceId
) {
  if (surfaceId === 'snow_block') return;
  const lifeList = BIOME_GROUND_LIFE[biome.id] || [];
  if (lifeList.length === 0) return;

  const clumpMask = getClumpedDensityMask(noise, x, z, 'plants', seed);
  const n = valueNoise2D(noise, x, z, 1.2, seed + 999);
  if (n < 0.12 * clumpMask) {
    const idx = Math.floor(n * 100) % lifeList.length;
    let decoId = lifeList[idx];
    if (STAGED_CROPS.includes(decoId)) {
      const stage = Math.floor(hash2D(x, z, seed + 444) * 3) + 1;
      decoId = `${decoId}_stage${stage}`;
    }
    setPlannedPlant(planMap, changedMap, x, y + 1, z, decoId);
  }
}
