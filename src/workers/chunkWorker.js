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
} from '../world/terrain/ContinentShaper.js';
import { isCave, getCaveBiome } from '../world/terrain/CaveGenerator.js';
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

function shouldPlaceAnton(wx, wz, height, corruptionEnabled) {
  if (!corruptionEnabled) return false;
  if (height < SEA_LEVEL + 1) return false;
  return hash2D(wx + 613, wz - 271, currentSeed) > 0.985;
}

function isPathAt(x, z) {
  const trunk = Math.abs(
    workerNoise.simplex2D(x * 0.02 + 1307, z * 0.02 - 811)
  );
  const branch = Math.abs(
    workerNoise.simplex2D(x * 0.04 - 547, z * 0.04 + 199)
  );
  return trunk < 0.03 || branch < 0.02;
}

function isHighwayAt(x, z) {
  const corridorA = Math.abs(
    workerNoise.simplex2D(x * 0.008 + 2143, z * 0.008 - 937)
  );
  const corridorB = Math.abs(
    workerNoise.simplex2D(x * 0.007 - 1841, z * 0.007 + 221)
  );
  return corridorA < 0.015 || corridorB < 0.018;
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
        const waterLevel = SEA_LEVEL + (biome.waterLevelOffset ?? 0);

        // ── Surface block ──────────────────────────────────────────
        let surfaceId =
          terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;
        const hasRoad =
          !inSpawnZone && terrainHeight > waterLevel && isPathAt(wx, wz);
        const hasHighway =
          !inSpawnZone && terrainHeight > waterLevel && isHighwayAt(wx, wz);
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

        const surfaceCarved = isCave(
          workerNoise,
          wx,
          terrainHeight,
          wz,
          terrainHeight,
          cavesEnabled
        );
        if (!surfaceCarved && terrainHeight >= startY && terrainHeight < endY) {
          setPlannedBlock(
            planMap,
            changedMap,
            wx,
            terrainHeight,
            wz,
            surfaceId
          );
        }

        // ── Filler layers (dirt / biome filler) ───────────────────
        for (let d = 1; d <= 3; d++) {
          const y = terrainHeight - d;
          if (y < MIN_TERRAIN_Y || y < startY || y >= endY) continue;
          if (isCave(workerNoise, wx, y, wz, terrainHeight, cavesEnabled))
            continue;
          setPlannedBlock(planMap, changedMap, wx, y, wz, biome.fillerBlock);
        }

        // ── Stone / ore layers ────────────────────────────────────
        for (let y = startY; y < endY; y++) {
          if (y >= terrainHeight - 3 || y <= MIN_TERRAIN_Y) continue;
          if (isCave(workerNoise, wx, y, wz, terrainHeight, cavesEnabled))
            continue;
          setPlannedBlock(planMap, changedMap, wx, y, wz, 'stone');
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
            shouldPlaceAnton(wx, wz, terrainHeight, corruptionEnabled)
          ) {
            setPlannedBlock(
              planMap,
              changedMap,
              wx,
              terrainHeight + 1,
              wz,
              'anton'
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
              'nuke'
            );
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
              setPlannedPlant,
              surfaceId
            );
          }
        }
      }
    }

    // ── Cave biome decoration pass ────────────────────────────────────
    // Runs after the main column loop so every solid/air voxel is already
    // committed to planMap.  We scan the chunk column-by-column looking for
    // carved voxels, then decorate their floor/ceiling/walls according to
    // the cave biome at that location.
    if (cavesEnabled) {
      // Helper: is a position carved (absent from planMap and below terrain)?
      const isAir = (x, y, z) => !planMap.has(getNumericKey(x, y, z));

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
            let wy = Math.min(terrainH - 4, endY - 1);
            wy >= Math.max(MIN_TERRAIN_Y + 1, startY);
            wy--
          ) {
            if (!isCave(workerNoise, wx, wy, wz, terrainH, true)) continue;

            const biome = getCaveBiome(
              workerNoise,
              wx,
              wy,
              wz,
              terrainH,
              currentSeed
            );

            // Deterministic per-voxel hash for decoration rolls
            const roll = hash2D(wx + wy * 7, wz - wy * 13, currentSeed + 9371);

            // ── Floor decoration (block directly below carved air) ──
            const floorY = wy - 1;
            const floorKey = getNumericKey(wx, floorY, wz);
            const floorId = planMap.get(floorKey);
            if (floorId !== undefined) {
              // floor voxel is solid — candidate for floor deco
              switch (biome) {
                case 'dripstone':
                  // Replace stone floor with dripstone; occasional stalagmite on top
                  if (floorId === 'stone') {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      wx,
                      floorY,
                      wz,
                      'dripstone'
                    );
                  }
                  if (
                    roll < 0.12 &&
                    isAir(wx, wy, wz) &&
                    isAir(wx, wy + 1, wz)
                  ) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      wx,
                      wy,
                      wz,
                      'dripstone'
                    );
                  }
                  break;
                case 'lush':
                  if (floorId === 'stone' || floorId === 'dirt') {
                    if (roll < 0.55)
                      setPlannedBlock(
                        planMap,
                        changedMap,
                        wx,
                        floorY,
                        wz,
                        'moss_block'
                      );
                    else
                      setPlannedBlock(
                        planMap,
                        changedMap,
                        wx,
                        floorY,
                        wz,
                        'clay'
                      );
                  }
                  break;
                case 'deep_dark':
                  if (floorId === 'stone') {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      wx,
                      floorY,
                      wz,
                      'deepslate'
                    );
                  }
                  break;
                case 'ice':
                  if (floorId === 'stone' || floorId === 'dirt') {
                    setPlannedBlock(planMap, changedMap, wx, floorY, wz, 'ice');
                  }
                  break;
                case 'mushroom':
                  if (floorId === 'stone' || floorId === 'dirt') {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      wx,
                      floorY,
                      wz,
                      'mycelium'
                    );
                  }
                  // Mushroom plants on top of solid floor
                  if (roll < 0.09 && isAir(wx, wy, wz)) {
                    const shroomId =
                      roll < 0.045 ? 'mushroom_brown' : 'mushroom_red';
                    setPlannedBlock(planMap, changedMap, wx, wy, wz, shroomId);
                  }
                  break;
                default:
                  break;
              }
            }

            // ── Ceiling decoration (block directly above carved air) ──
            const ceilY = wy + 1;
            const ceilKey = getNumericKey(wx, ceilY, wz);
            const ceilId = planMap.get(ceilKey);
            if (ceilId !== undefined) {
              switch (biome) {
                case 'dripstone':
                  // Stalactite: dripstone hanging from ceiling
                  if (roll > 0.88 && isAir(wx, wy, wz)) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      wx,
                      wy,
                      wz,
                      'dripstone'
                    );
                  }
                  break;
                case 'lush':
                  // Cave vines hanging from ceiling
                  if (roll > 0.82 && isAir(wx, wy, wz)) {
                    const vineId =
                      roll > 0.94 ? 'cave_vines_lit' : 'cave_vines';
                    setPlannedBlock(planMap, changedMap, wx, wy, wz, vineId);
                  }
                  break;
                case 'ice':
                  // Packed ice stalactites hanging from ceiling
                  if (roll > 0.85 && isAir(wx, wy, wz)) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      wx,
                      wy,
                      wz,
                      'packed_ice'
                    );
                  }
                  if (ceilId === 'stone') {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      wx,
                      ceilY,
                      wz,
                      'packed_ice'
                    );
                  }
                  break;
                default:
                  break;
              }
            }

            // ── Wall decoration (6-neighbour exposed-stone check) ──
            const neighbors = [
              [wx - 1, wy, wz],
              [wx + 1, wy, wz],
              [wx, wy, wz - 1],
              [wx, wy, wz + 1],
            ];
            for (const [nx, ny, nz] of neighbors) {
              const wallKey = getNumericKey(nx, ny, nz);
              const wallId = planMap.get(wallKey);
              if (wallId !== 'stone') continue; // only replace exposed stone
              const wallRoll = hash2D(
                nx + ny * 5,
                nz - ny * 11,
                currentSeed + 4817
              );
              switch (biome) {
                case 'dripstone':
                  if (wallRoll < 0.25) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      nx,
                      ny,
                      nz,
                      wallRoll < 0.12 ? 'calcite' : 'tuff'
                    );
                  }
                  break;
                case 'deep_dark':
                  setPlannedBlock(planMap, changedMap, nx, ny, nz, 'deepslate');
                  if (wallRoll < 0.04) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      nx,
                      ny,
                      nz,
                      'obsidian'
                    );
                  }
                  break;
                case 'ice':
                  if (wallRoll < 0.5) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      nx,
                      ny,
                      nz,
                      'packed_ice'
                    );
                  }
                  break;
                case 'mushroom':
                  if (wallRoll < 0.08) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      nx,
                      ny,
                      nz,
                      'glowstone'
                    );
                  }
                  break;
                case 'lush':
                  if (wallRoll < 0.15) {
                    setPlannedBlock(
                      planMap,
                      changedMap,
                      nx,
                      ny,
                      nz,
                      'moss_block'
                    );
                  }
                  break;
                default:
                  break;
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
