import { BIOME_BY_ID } from '../../data/biomes.js';
import { BLOCKS } from '../../data/blocks.js';
import { Noise } from '../../world/Noise.js';
import { NoiseRouter } from '../../world/NoiseRouter.js';
import {
  getColumnHeight,
  SPAWN_FLAT_RADIUS,
  SEA_LEVEL,
  MIN_TERRAIN_Y,
  isPathAt,
  isHighwayAt,
} from '../../world/terrain/ContinentShaper.js';
import {
  getCaveCell,
  getCaveProfileForCell,
} from '../../world/terrain/CaveGenerator.js';
import {
  shouldPlaceTree,
  addTree,
  addGroundLife,
} from '../../world/terrain/DecorationPlacer.js';

import { CHUNK_SIZE, CHUNK_MASK, localIndex } from '../VoxelStore.js';

/**
 * Generates one CHUNK_SIZE³ chunk of terrain. Pure and deterministic for a
 * seed, so it runs in the chunk worker and, as a fallback, on the main
 * thread with identical results.
 *
 * Returns { blocks: Uint16Array (indices into `palette`), palette: string[],
 *           outside: [x, y, z, paletteIndex, ...] } where `outside` holds
 * blocks that features (tree canopies, ruins) place in neighbouring chunks.
 */
// ---------------------------------------------------------------------------
// Static lookup tables
// ---------------------------------------------------------------------------
const DEFAULT_BIOME = BIOME_BY_ID.get('plains');
const BLOCK_DATA_BY_ID = new Map(BLOCKS.map((block) => [block.id, block]));

// ---------------------------------------------------------------------------
// Worker-local state (re-initialised when seed changes)
// ---------------------------------------------------------------------------
let workerRouter = null;
let workerNoise = null;
let currentSeedString = null;
let currentSeed = 1;

// ---------------------------------------------------------------------------
// Math helpers (worker-local; shared modules have their own copies)
// ---------------------------------------------------------------------------
function getNumericSeed(seedString) {
  const numeric = Number(seedString);
  if (Number.isFinite(numeric)) {
    return Math.floor(Math.abs(numeric)) + 1;
  }
  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0) + 1;
}

function hash2D(x, z, seed) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed) * 43758.5453;
  return value - Math.floor(value);
}

// ---------------------------------------------------------------------------
// Router / Noise initialisation
// ---------------------------------------------------------------------------
function getRouter(seedString) {
  if (currentSeedString !== seedString || !workerRouter || !workerNoise) {
    workerRouter = new NoiseRouter(seedString);
    workerNoise = new Noise(seedString);
    currentSeed = getNumericSeed(seedString);
    currentSeedString = seedString;
  }
  return workerRouter;
}

// Heights and biomes per chunk column, shared by every vertical chunk of
// that column (they used to be recomputed for each one).
const columnCache = new Map();
const COLUMN_CACHE_LIMIT = 1024;

function getColumnInfo(router, cx, cz) {
  const key = `${currentSeedString}|${cx}|${cz}`;
  let info = columnCache.get(key);
  if (info) return info;
  info = {
    heights: new Int32Array(CHUNK_SIZE * CHUNK_SIZE),
    biomes: new Array(CHUNK_SIZE * CHUNK_SIZE),
  };
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wz = cz * CHUNK_SIZE + lz;
      const i = lx + lz * CHUNK_SIZE;
      info.heights[i] = getColumnHeight(
        router,
        workerNoise,
        wx,
        wz,
        currentSeed
      );
      info.biomes[i] = getBiomeById(router.getBiomeID(wx, wz));
    }
  }
  if (columnCache.size >= COLUMN_CACHE_LIMIT) {
    columnCache.delete(columnCache.keys().next().value);
  }
  columnCache.set(key, info);
  return info;
}

function getBiomeById(id) {
  return BIOME_BY_ID.get(id) ?? DEFAULT_BIOME;
}

// ---------------------------------------------------------------------------
// Spawn-zone helper
// ---------------------------------------------------------------------------
function isInSpawnZone(x, z) {
  return Math.sqrt(x * x + z * z) <= SPAWN_FLAT_RADIUS;
}

// ---------------------------------------------------------------------------
// Corruption / special block helpers
// ---------------------------------------------------------------------------
function shouldPlaceVirus(wx, wz, height, corruptionEnabled) {
  if (!corruptionEnabled) return false;
  if (height < SEA_LEVEL + 1) return false;
  return hash2D(wx - 991, wz + 417, currentSeed) > 0.9992;
}

function shouldPlaceArlo(wx, wz, height, corruptionEnabled) {
  if (!corruptionEnabled) return false;
  if (height < SEA_LEVEL + 1) return false;
  return hash2D(wx + 613, wz - 271, currentSeed) > 0.985;
}

// -- WORLD CLASS: RUIN STRUCTURE GENERATOR --
function addRuinStructure(plan, x, y, z, seed) {
  const size = 3 + Math.floor(hash2D(x, z, seed) * 3);
  for (let lx = -size; lx <= size; lx++) {
    for (let lz = -size; lz <= size; lz++) {
      const h = 1 + Math.floor(hash2D(x + lx, z + lz, seed + 123) * 4);
      for (let ly = 0; ly < h; ly++) {
        const block =
          hash2D(x + lx, z + lz, ly + seed) > 0.6
            ? 'mossy_cobblestone'
            : 'cobblestone';
        plan.set(x + lx, y + ly, z + lz, block);
      }
    }
  }
}

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

  set(x, y, z, id) {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    if (this.inside(x, y, z)) {
      this.blocks[localIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK)] =
        id ? this.indexOf(id) : 0;
    } else if (id) {
      this.outside.push(x, y, z, this.indexOf(id));
    }
  }

  has(x, y, z) {
    if (!this.inside(x, y, z)) return false;
    return (
      this.blocks[
        localIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK)
      ] !== 0
    );
  }
}

// Adapters with the (plan, changedMap, x, y, z, id) signature that the
// decoration placer expects.
function setPlannedBlock(plan, _changed, x, y, z, id) {
  plan.set(x, y, z, id);
}

function setPlannedPlant(plan, _changed, x, y, z, id) {
  const blockData = BLOCK_DATA_BY_ID.get(id);
  const pairId = blockData?.pairId;
  const pairOffsetY = Number(blockData?.pairOffsetY);
  plan.set(x, y, z, id);
  if (pairId && Number.isFinite(pairOffsetY) && pairOffsetY !== 0) {
    plan.set(x, y + pairOffsetY, z, pairId);
  }
}

export function generateChunkData({
  cx,
  cy,
  cz,
  seedString,
  corruptionEnabled = false,
  cavesEnabled = true,
}) {
  const chunkSize = CHUNK_SIZE;
  const router = getRouter(seedString);
  const plan = new ChunkPlan(cx, cy, cz);
  const columns = getColumnInfo(router, cx, cz);
  // Carved cells from the terrain pass, reused by the cave decoration pass.
  const caveCells = new Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  const planMap = plan;
  const changedMap = null;
  const startX = cx * chunkSize;
  const startY = cy * chunkSize;
  const startZ = cz * chunkSize;
  const endY = startY + chunkSize;

  for (let lx = 0; lx < chunkSize; lx++) {
    for (let lz = 0; lz < chunkSize; lz++) {
      const wx = startX + lx;
      const wz = startZ + lz;
      const biome = columns.biomes[lx + lz * CHUNK_SIZE];
      const inSpawnZone = isInSpawnZone(wx, wz);
      const terrainHeight = columns.heights[lx + lz * CHUNK_SIZE];
      const waterLevel = SEA_LEVEL;

      // ── Surface block ──────────────────────────────────────────
      let surfaceId = terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;
      const hasRoad =
        !inSpawnZone &&
        terrainHeight > waterLevel &&
        isPathAt(workerNoise, wx, wz);
      const hasHighway =
        !inSpawnZone &&
        terrainHeight > waterLevel &&
        isHighwayAt(workerNoise, wx, wz);
      if (hasHighway) {
        surfaceId = 'cobblestone';
      } else if (hasRoad) {
        surfaceId = 'path_block';
      }

      // Feature: Force clean grass start at spawn point
      if (inSpawnZone) {
        surfaceId = 'grass_block';
      } else if (
        terrainHeight > 58 &&
        surfaceId !== 'path_block' &&
        biome.surfaceBlock !== 'snow_block'
      ) {
        // Snow cap override for non-snow biomes above y = 58
        surfaceId = 'snow_block';
      }

      let surfaceCarved = false;

      // ── Unified Terrain & Cave Pass ──────────────────────────
      for (let y = startY; y < endY; y++) {
        const depthBelowSurface = terrainHeight - y;
        if (y <= MIN_TERRAIN_Y) {
          plan.set(wx, y, wz, 'bedrock');
          continue;
        }

        const cave = getCaveCell(
          workerNoise,
          wx,
          y,
          wz,
          terrainHeight,
          cavesEnabled,
          currentSeed
        );
        if (cave.carve) {
          caveCells[localIndex(lx, y - startY, lz)] = cave;
        }

        if (y === terrainHeight) surfaceCarved = cave.carve;

        if (cave.carve) {
          if (cave.fluid === 'water' || cave.fluid === 'ice_water') {
            plan.set(wx, y, wz, 'water');
          } else if (cave.fluid === 'lava') {
            plan.set(wx, y, wz, 'lava');
          }
          // Air is implicit
          continue;
        }

        if (y === terrainHeight) {
          plan.set(wx, y, wz, surfaceId);
        } else if (depthBelowSurface > 0 && depthBelowSurface <= 3) {
          plan.set(wx, y, wz, biome.fillerBlock);
        } else if (depthBelowSurface > 3) {
          plan.set(wx, y, wz, 'stone');
        }
      }

      // ── Bedrock Floor ─────────────────────────────────────────
      if (MIN_TERRAIN_Y >= startY && MIN_TERRAIN_Y < endY) {
        setPlannedBlock(planMap, changedMap, wx, MIN_TERRAIN_Y, wz, 'bedrock');
      }
      if (
        MIN_TERRAIN_Y + 1 >= startY &&
        MIN_TERRAIN_Y + 1 < endY &&
        hash2D(wx + 44, wz - 11, currentSeed) > 0.4
      ) {
        setPlannedBlock(
          planMap,
          changedMap,
          wx,
          MIN_TERRAIN_Y + 1,
          wz,
          'bedrock'
        );
      }
      if (
        MIN_TERRAIN_Y + 2 >= startY &&
        MIN_TERRAIN_Y + 2 < endY &&
        hash2D(wx - 22, wz + 88, currentSeed) > 0.8
      ) {
        setPlannedBlock(
          planMap,
          changedMap,
          wx,
          MIN_TERRAIN_Y + 2,
          wz,
          'bedrock'
        );
      }

      // ── Water fill ────────────────────────────────────────────
      if (!inSpawnZone) {
        const waterBottom = Math.max(startY, terrainHeight + 1);
        const waterTop = Math.min(endY - 1, waterLevel);
        for (let y = waterBottom; y <= waterTop; y++) {
          plan.set(wx, y, wz, 'water');
        }
      }

      // ── Special entities ──────────────────────────────────────
      if (terrainHeight + 1 >= startY && terrainHeight + 1 < endY) {
        if (shouldPlaceVirus(wx, wz, terrainHeight, corruptionEnabled)) {
          setPlannedBlock(
            planMap,
            changedMap,
            wx,
            terrainHeight + 1,
            wz,
            'virus'
          );
        } else if (shouldPlaceArlo(wx, wz, terrainHeight, corruptionEnabled)) {
          setPlannedBlock(
            planMap,
            changedMap,
            wx,
            terrainHeight + 1,
            wz,
            'arlo'
          );
        }
      }

      if (
        !inSpawnZone &&
        terrainHeight > waterLevel &&
        terrainHeight + 1 >= startY &&
        terrainHeight + 1 < endY
      ) {
        const tntRoll = hash2D(wx + 777, wz - 313, currentSeed);
        const nukeRoll = hash2D(wx - 1441, wz + 918, currentSeed);
        if (tntRoll > 0.9989)
          setPlannedBlock(
            planMap,
            changedMap,
            wx,
            terrainHeight + 1,
            wz,
            'tnt'
          );
        if (nukeRoll > 0.99972)
          setPlannedBlock(
            planMap,
            changedMap,
            wx,
            terrainHeight + 1,
            wz,
            'chest:common_village'
          );
      }

      // World Class: Ruin Spawning
      const ruinRoll = hash2D(wx + 99, wz - 88, currentSeed);
      if (!inSpawnZone && terrainHeight > waterLevel && ruinRoll > 0.9995) {
        if (terrainHeight >= startY && terrainHeight < endY) {
          addRuinStructure(plan, wx, terrainHeight + 1, wz, currentSeed);
        }
      }

      // ── Trees & ground decoration ─────────────────────────────
      // Deterministic Tree Check: We must check ground heights potentially below us
      // if a tree can span multiple vertical chunks.
      const checkY = terrainHeight + 1;
      const isHighAltitude = terrainHeight > 46;

      // Simple check for now: Only spawn if the start point is in or very near this chunk
      // The addTree function already handles cross-chunk bounds via planMap.
      if (
        !surfaceCarved &&
        !inSpawnZone &&
        !isHighAltitude &&
        shouldPlaceTree(workerNoise, wx, wz, terrainHeight, biome, currentSeed)
      ) {
        // We only call addTree if the tree's BASE is in this chunk or its bounds.
        // For now, simpler: only spawn trees if the surface is in this chunk.
        if (checkY >= startY && checkY < endY) {
          addTree(
            planMap,
            changedMap,
            wx,
            checkY,
            wz,
            biome,
            corruptionEnabled,
            workerNoise,
            currentSeed,
            setPlannedBlock
          );
        }
      }
      if (
        !surfaceCarved &&
        !inSpawnZone &&
        !isHighAltitude &&
        terrainHeight > waterLevel
      ) {
        if (terrainHeight >= startY && terrainHeight < endY) {
          // First call for non-pair blocks (setPlannedBlock)
          addGroundLife(
            planMap,
            changedMap,
            wx,
            terrainHeight,
            wz,
            biome,
            workerNoise,
            currentSeed,
            setPlannedBlock,
            surfaceId
          );
          // Second call for pair-block support (setPlannedPlant)
          addGroundLife(
            planMap,
            changedMap,
            wx,
            terrainHeight,
            wz,
            biome,
            workerNoise,
            currentSeed,
            setPlannedPlant,
            surfaceId
          );
        }
      }
    }
  }

  // ── Cave biome decoration pass ────────────────────────────────────
  if (cavesEnabled) {
    for (let lx = 0; lx < chunkSize; lx++) {
      for (let lz = 0; lz < chunkSize; lz++) {
        const wx = startX + lx;
        const wz = startZ + lz;
        const terrainH = columns.heights[lx + lz * CHUNK_SIZE];

        for (
          let wy = Math.min(terrainH - 1, endY - 1);
          wy >= Math.max(MIN_TERRAIN_Y + 1, startY);
          wy--
        ) {
          const profile = getCaveProfileForCell(
            caveCells[localIndex(lx, wy - startY, lz)],
            wy
          );
          if (!profile) continue;

          const roll = hash2D(wx + wy * 7, wz - wy * 13, currentSeed + 9371);

          // ── Floor Decoration ──
          if (!plan.has(wx, wy, wz) && plan.has(wx, wy - 1, wz)) {
            if (
              roll < (profile.vegetationChance || 0) ||
              (profile.sculkChance && roll < profile.sculkChance)
            ) {
              setPlannedBlock(
                planMap,
                changedMap,
                wx,
                wy - 1,
                wz,
                profile.floor
              );
            }
            // Chest Spawning: Standard visual chest with context-aware loot tag
            if (roll < 0.005) {
              const chestTag = `chest:cave_${profile.biome}`;
              plan.set(wx, wy, wz, chestTag);
            }
          }

          // ── Ceiling Decoration ──
          if (!plan.has(wx, wy, wz) && plan.has(wx, wy + 1, wz)) {
            if (roll < (profile.stalactiteChance || 0)) {
              setPlannedBlock(
                planMap,
                changedMap,
                wx,
                wy + 1,
                wz,
                profile.ceiling
              );
            }
          }

          // ── Filler logic (Walls) ──
          if (plan.has(wx, wy, wz)) {
            const isExposed =
              !plan.has(wx + 1, wy, wz) || !plan.has(wx - 1, wy, wz);
            if (isExposed && roll < 0.3) {
              plan.set(wx, wy, wz, profile.wall);
            }
          }
        }
      }
    }
  }

  return { blocks: plan.blocks, palette: plan.palette, outside: plan.outside };
}
