import { expose, transfer } from 'comlink';
import { BIOME_BY_ID } from '../data/biomes.js';
import { BLOCKS } from '../data/blocks.js';
import { Noise } from '../world/Noise.js';
import { NoiseRouter } from '../world/NoiseRouter.js';
import {
  getColumnHeight,
  SPAWN_FLAT_RADIUS,
  SEA_LEVEL,
  MIN_TERRAIN_Y,
  isPathAt,
  isHighwayAt,
} from '../world/terrain/ContinentShaper.js';
import {
  getCaveCell,
  getCaveMaterialProfile,
} from '../world/terrain/CaveGenerator.js';
import {
  shouldPlaceTree,
  addTree,
  addGroundLife,
} from '../world/terrain/DecorationPlacer.js';

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
function addRuinStructure(planMap, changedMap, x, y, z, seed) {
    const size = 3 + Math.floor(hash2D(x, z, seed) * 3);
    for (let lx = -size; lx <= size; lx++) {
        for (let lz = -size; lz <= size; lz++) {
            const h = 1 + Math.floor(hash2D(x + lx, z + lz, seed + 123) * 4);
            for (let ly = 0; ly < h; ly++) {
                const block = hash2D(x+lx, z+lz, ly+seed) > 0.6 ? 'mossy_cobblestone' : 'cobblestone';
                setPlannedBlock(planMap, changedMap, x + lx, y + ly, z + lz, block);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Plan-map helpers
// ---------------------------------------------------------------------------
function getNumericKey(x, y, z) {
  return (
    (Math.round(x) + 1000000) * 4294967296 +
    (Math.round(z) + 1000000) * 2048 +
    (Math.round(y) + 512)
  );
}

function setPlannedBlock(planMap, changedMap, x, y, z, id) {
  const key = getNumericKey(x, y, z);
  if (changedMap.get(key) === null) return;
  const override = changedMap.get(key);
  planMap.set(key, override ?? id);
}

function setPlannedPlant(planMap, changedMap, x, y, z, id) {
  const blockData = BLOCK_DATA_BY_ID.get(id);
  const pairId = blockData?.pairId;
  const pairOffsetY = Number(blockData?.pairOffsetY);
  if (pairId && Number.isFinite(pairOffsetY) && pairOffsetY !== 0) {
    setPlannedBlock(planMap, changedMap, x, y, z, id);
    setPlannedBlock(planMap, changedMap, x, y + pairOffsetY, z, pairId);
    return;
  }
  setPlannedBlock(planMap, changedMap, x, y, z, id);
}

function chunkCoord(worldValue, chunkSize) {
  return Math.floor(worldValue / chunkSize);
}

// ---------------------------------------------------------------------------
// MAIN API
// ---------------------------------------------------------------------------
const api = {
  async generateChunk({
    cx,
    cy,
    cz,
    chunkSize,
    seedString,
    changedEntries = [],
    corruptionEnabled = false,
    cavesEnabled = true,
  }) {
    const router = getRouter(seedString);
    const changedMap = new Map(changedEntries);
    const planMap = new Map();
    const startX = cx * chunkSize;
    const startY = cy * chunkSize;
    const startZ = cz * chunkSize;
    const endY = startY + chunkSize;

    for (let lx = 0; lx < chunkSize; lx++) {
      for (let lz = 0; lz < chunkSize; lz++) {
        const wx = startX + lx;
        const wz = startZ + lz;
        const biome = getBiomeById(router.getBiomeID(wx, wz));
        const inSpawnZone = isInSpawnZone(wx, wz);
        const terrainHeight = getColumnHeight(
          router,
          workerNoise,
          wx,
          wz,
          currentSeed
        );
        const waterLevel = SEA_LEVEL;

        // ── Surface block ──────────────────────────────────────────
        let surfaceId =
          terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;
        const hasRoad =
          !inSpawnZone && terrainHeight > waterLevel && isPathAt(workerNoise, wx, wz);
        const hasHighway =
          !inSpawnZone && terrainHeight > waterLevel && isHighwayAt(workerNoise, wx, wz);
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
            setPlannedBlock(planMap, changedMap, wx, y, wz, 'bedrock');
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

          if (y === terrainHeight) surfaceCarved = cave.carve;

          if (cave.carve) {
            if (cave.fluid === 'water' || cave.fluid === 'ice_water') {
              setPlannedBlock(planMap, changedMap, wx, y, wz, 'water');
            } else if (cave.fluid === 'lava') {
              setPlannedBlock(planMap, changedMap, wx, y, wz, 'lava');
            }
            // Air is implicit
            continue;
          }

          if (y === terrainHeight) {
            setPlannedBlock(planMap, changedMap, wx, y, wz, surfaceId);
          } else if (depthBelowSurface > 0 && depthBelowSurface <= 3) {
            setPlannedBlock(planMap, changedMap, wx, y, wz, biome.fillerBlock);
          } else if (depthBelowSurface > 3) {
            setPlannedBlock(planMap, changedMap, wx, y, wz, 'stone');
          }
        }

        // ── Bedrock Floor ─────────────────────────────────────────
        if (MIN_TERRAIN_Y >= startY && MIN_TERRAIN_Y < endY) {
          setPlannedBlock(
            planMap,
            changedMap,
            wx,
            MIN_TERRAIN_Y,
            wz,
            'bedrock'
          );
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
            setPlannedBlock(planMap, changedMap, wx, y, wz, 'water');
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
          } else if (
            shouldPlaceArlo(wx, wz, terrainHeight, corruptionEnabled)
          ) {
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
                addRuinStructure(planMap, changedMap, wx, terrainHeight + 1, wz, currentSeed);
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
          shouldPlaceTree(
            workerNoise,
            wx,
            wz,
            terrainHeight,
            biome,
            currentSeed
          )
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
            addGroundLife(
              planMap,
              changedMap,
              wx,
              terrainHeight,
              wz,
              biome,
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
          const terrainH = getColumnHeight(
            router,
            workerNoise,
            wx,
            wz,
            currentSeed
          );

          for (
            let wy = Math.min(terrainH - 1, endY - 1);
            wy >= Math.max(MIN_TERRAIN_Y + 1, startY);
            wy--
          ) {
            const profile = getCaveMaterialProfile(
              workerNoise,
              wx,
              wy,
              wz,
              terrainH,
              true,
              currentSeed
            );
            if (!profile) continue;

            const roll = hash2D(wx + wy * 7, wz - wy * 13, currentSeed + 9371);
            const key = getNumericKey(wx, wy, wz);
            const belowKey = getNumericKey(wx, wy - 1, wz);
            const aboveKey = getNumericKey(wx, wy + 1, wz);

            // ── Floor Decoration ──
            if (!planMap.has(key) && planMap.has(belowKey)) {
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
                setPlannedBlock(planMap, changedMap, wx, wy, wz, chestTag);
              }
            }

            // ── Ceiling Decoration ──
            if (!planMap.has(key) && planMap.has(aboveKey)) {
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
            if (planMap.has(key)) {
              const isExposed =
                !planMap.has(getNumericKey(wx + 1, wy, wz)) ||
                !planMap.has(getNumericKey(wx - 1, wy, wz));
              if (isExposed && roll < 0.3) {
                setPlannedBlock(planMap, changedMap, wx, wy, wz, profile.wall);
              }
            }
          }
        }
      }
    }

    // ── Apply explicit player edits that live in this chunk ────────────
    for (const [key, id] of changedMap.entries()) {
      const [x, y, z] = api.keyToCoords(key);
      if (
        chunkCoord(x, chunkSize) !== cx ||
        chunkCoord(y, chunkSize) !== cy ||
        chunkCoord(z, chunkSize) !== cz
      )
        continue;
      if (id === null) {
        planMap.delete(key);
      } else {
        planMap.set(key, id);
      }
    }

    // ── Serialise to transferable buffer ──────────────────────────────
    const palette = [];
    const paletteMap = new Map();
    const getPaletteIndex = (id) => {
      let idx = paletteMap.get(id);
      if (idx === undefined) {
        idx = palette.length;
        palette.push(id);
        paletteMap.set(id, idx);
      }
      return idx;
    };

    const blockCount = planMap.size;
    const data = new Int32Array(blockCount * 4);
    let ptr = 0;
    for (const [key, id] of planMap.entries()) {
      const [x, y, z] = api.keyToCoords(key);
      data[ptr++] = x;
      data[ptr++] = y;
      data[ptr++] = z;
      data[ptr++] = getPaletteIndex(id);
    }

    return transfer({ data, palette, cx, cy, cz }, [data.buffer]);
  },

  keyToCoords(key) {
    if (typeof key === 'number') {
      const y = (key % 2048) - 512;
      const remaining = Math.floor(key / 2048);
      const z = (remaining % 2097152) - 1000000;
      const x = Math.floor(remaining / 2097152) - 1000000;
      return [x, y, z];
    }
    return String(key).split('|').map(Number);
  },
};

expose(api);
