import { expose, transfer } from 'comlink';
import { BIOME_BY_ID } from '../data/biomes.js';
import { BLOCKS } from '../data/blocks.js';
import { Noise } from '../world/Noise.js';
import { NoiseRouter } from '../world/NoiseRouter.js';

const SEA_LEVEL = 1;
const MIN_TERRAIN_Y = -64;
const MAX_TERRAIN_Y = 65;
const DEEP_MIN_Y = -220;

const DEFAULT_BIOME = BIOME_BY_ID.get('plains');
const BLOCK_DATA_BY_ID = new Map(BLOCKS.map((block) => [block.id, block]));

const TREE_CONFIGS = {
    oak: { trunk: 'oak_log', leaves: 'oak_leaves', height: 5, radius: 2 },
    birch: { trunk: 'birch_log', leaves: 'birch_leaves', height: 6, radius: 2 },
    pine: { trunk: 'spruce_log', leaves: 'spruce_leaves', height: 7, radius: 1 },
    palm: { trunk: 'jungle_log', leaves: 'jungle_leaves', height: 5, radius: 2 },
    willow: { trunk: 'mangrove_log', leaves: 'mangrove_leaves', height: 4, radius: 3 },
    cherry: { trunk: 'cherry_log', leaves: 'cherry_leaves', height: 5, radius: 2 },
    redwood: { trunk: 'dark_oak_log', leaves: 'dark_oak_leaves', height: 10, radius: 2 },
    crystal: { trunk: 'acacia_log', leaves: 'acacia_leaves', height: 6, radius: 2 }
};

const BIOME_GROUND_LIFE = {
    plains: ['short_grass', 'dandelion', 'poppy', 'red_tulip', 'tall_grass_bottom', 'fern', 'wheat'],
    forest: ['short_grass', 'fern', 'mushroom_brown', 'mushroom_red', 'poppy', 'blueberry', 'strawberry', 'tall_grass_bottom'],
    meadow: ['short_grass', 'tall_grass_bottom', 'dandelion', 'poppy', 'orange_tulip', 'red_tulip', 'pink_tulip', 'white_tulip', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'allium', 'blueberry', 'lilac', 'peony', 'rose_bush', 'wheat'],
    swamp: ['mushroom_brown', 'mushroom_red', 'fern', 'blueberry'],
    desert: ['dead_bush', 'tomato', 'fern'],
    badlands: ['dead_bush', 'carrot', 'fern'],
    canyon: ['dead_bush', 'carrot'],
    highlands: ['potato', 'fern', 'poppy'],
    alpine: ['potato', 'fern', 'wheat'],
    tundra: ['potato', 'fern']
};

const STAGED_CROPS = ['blueberry', 'strawberry', 'tomato', 'potato', 'carrot', 'wheat'];

let workerRouter = null;
let workerNoise = null;
let currentSeedString = null;
let currentSeed = 1;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getNumericSeed(seedString) {
    const numeric = Number(seedString);
    if (Number.isFinite(numeric)) {
        return Math.floor(Math.abs(numeric)) + 1;
    }

    let hash = 2166136261;
    for (let i = 0; i < seedString.length; i++) {
        hash ^= seedString.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0) + 1;
}

function hash2D(x, z, seed) {
    const value = Math.sin((x * 127.1) + (z * 311.7) + seed) * 43758.5453;
    return value - Math.floor(value);
}

function smoothstep(t) {
    return t * t * (3 - (2 * t));
}

function lerp(a, b, t) {
    return a + ((b - a) * t);
}

function valueNoise2D(x, z, scale, seed) {
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
    const nx0 = lerp(n00, n10, tx);
    const nx1 = lerp(n01, n11, tx);
    return lerp(nx0, nx1, tz);
}

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

function getTerrainHeight(router, x, z) {
    const raw = Math.round(router.getTerrainHeight(x, z) - 63);
    return clamp(raw, MIN_TERRAIN_Y, MAX_TERRAIN_Y);
}

function getColumnHeight(router, x, z) {
    let height = getTerrainHeight(router, x, z);
    const dist = Math.max(Math.abs(x), Math.abs(z));
    if (dist <= 20) {
        const flatHeight = SEA_LEVEL + 4;
        const blend = Math.min(1, dist / 20);
        height = Math.round(flatHeight + ((height - flatHeight) * blend));
        height = Math.max(height, SEA_LEVEL + 2);
    }
    return height;
}

function shouldForceSpawnZone(x, z) {
    return Math.abs(x) <= 6 && Math.abs(z) <= 6;
}

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

function isCorruptedAt(x, z, corruptionEnabled) {
    if (!corruptionEnabled) return false;
    return hash2D((x * 0.7) - 991, (z * 0.7) + 417, currentSeed) > 0.982;
}

function isPathAt(x, z) {
    const trunk = Math.abs(workerNoise.simplex2D((x * 0.02) + 1307, (z * 0.02) - 811));
    const branch = Math.abs(workerNoise.simplex2D((x * 0.04) - 547, (z * 0.04) + 199));
    return trunk < 0.03 || branch < 0.02;
}

function isHighwayAt(x, z) {
    const corridorA = Math.abs(workerNoise.simplex2D((x * 0.008) + 2143, (z * 0.008) - 937));
    const corridorB = Math.abs(workerNoise.simplex2D((x * 0.007) - 1841, (z * 0.007) + 221));
    return corridorA < 0.015 || corridorB < 0.018;
}

function getClumpedDensityMask(x, z, type = 'trees') {
    if (!workerNoise) return 0.5;
    const freq = type === 'trees' ? 0.02 : 0.04;
    const n = (workerNoise.simplex2D(x * freq, z * freq) * 0.5) + 0.5;
    return Math.pow(n, 1.3) > 0.4 ? 1.0 : 0.0;
}

function shouldPlaceTree(x, z, height, biome) {
    if (height <= SEA_LEVEL + 1) return false;
    const density = biome.treeDensity ?? 0.05;
    if (density <= 0) return false;
    
    // Feature: Clumped Generation (groves vs clearings)
    const clumpMask = getClumpedDensityMask(x, z, 'trees');
    if (clumpMask < 0.5) return false;

    const n = valueNoise2D(x, z, 1.8, currentSeed + 555);
    return n < density * 1.5; // Slightly buffed since we are masking large areas
}

function shouldCarveCave(x, y, z, terrainHeight, cavesEnabled) {
    if (!cavesEnabled) return false;
    if (y > terrainHeight) return false;
    if (y <= DEEP_MIN_Y + 2) return false;

    const nA = (workerNoise.simplex3D(x * 0.04, y * 0.03, z * 0.04) * 0.5) + 0.5;
    const nB = (workerNoise.simplex3D((x * 0.01) + 17, (y * 0.015) - 9, (z * 0.01) + 4) * 0.5) + 0.5;
    const nC = (workerNoise.simplex3D((x * 0.005) - 41, (y * 0.05) + 12, (z * 0.005) + 63) * 0.5) + 0.5;
    const caveValue = (nA * 0.5) + (nB * 0.35) + (nC * 0.15);
    const depthRatio = Math.max(0, Math.min(1, (terrainHeight - y) / 40));

    const surfacePenalty = Math.max(0, 0.08 * (1 - depthRatio));
    const chamber = caveValue > (0.84 - (depthRatio * 0.06) + surfacePenalty);
    
    // Tunnels are great for surface access
    const tunnelBand = Math.abs(nC - 0.5) < 0.045 && nA > 0.4;
    const fissureNoise = (workerNoise.simplex3D((x * 0.002) + 9, (y * 0.02) - 31, (z * 0.002) - 21) * 0.5) + 0.5;
    const fissure = Math.abs(fissureNoise - 0.5) < 0.03 && y < terrainHeight - 3;
    
    return chamber || tunnelBand || fissure;
}

function chooseTreeType(x, z, biome, corruptionEnabled) {
    const hash = hash2D(x, z, currentSeed);
    if (isCorruptedAt(x, z, corruptionEnabled)) return 'crystal';
    if (biome.id === 'desert') return 'palm';
    if (biome.id === 'forest') return hash > 0.6 ? 'birch' : (hash > 0.3 ? 'oak' : 'pine');
    if (biome.id === 'swamp') return 'willow';
    if (biome.id === 'plains' || biome.id === 'meadow') return hash > 0.8 ? 'cherry' : 'oak';
    if (biome.id === 'highlands') return hash > 0.6 ? 'redwood' : 'pine';
    if (biome.id === 'alpine' || biome.id === 'tundra') return 'pine';
    if (biome.id === 'badlands' || biome.id === 'canyon') return 'palm';
    return 'oak';
}

function getNumericKey(x, y, z) {
    return (Math.round(x) + 1000000) * 4294967296 + (Math.round(z) + 1000000) * 2048 + (Math.round(y) + 512);
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

function addTree(planMap, changedMap, x, y, z, biome, corruptionEnabled) {
    const treeType = chooseTreeType(x, z, biome, corruptionEnabled);
    const config = TREE_CONFIGS[treeType] ?? TREE_CONFIGS.oak;

    const trunkHeight = config.height + Math.floor(hash2D(x + 7, z - 19, currentSeed) * 2);
    for (let i = 0; i < trunkHeight; i++) {
        setPlannedBlock(planMap, changedMap, x, y + i, z, config.trunk);
    }

    const leafBase = y + trunkHeight - 2;
    const radius = config.radius;
    for (let lx = -radius; lx <= radius; lx++) {
        for (let lz = -radius; lz <= radius; lz++) {
            for (let ly = 0; ly <= 3; ly++) {
                const distSq = (lx * lx) + (lz * lz);
                if (distSq > radius * radius) continue;
                if (ly === 3 && distSq > 0) continue;
                setPlannedBlock(planMap, changedMap, x + lx, leafBase + ly, z + lz, config.leaves);
            }
        }
    }
}

function addGroundLife(planMap, changedMap, x, y, z, biome) {
    const lifeList = BIOME_GROUND_LIFE[biome.id] || [];
    if (lifeList.length === 0) return;

    // Feature: Clumped Generation for deco plants
    const clumpMask = getClumpedDensityMask(x, z, 'plants');
    
    const noise = valueNoise2D(x, z, 1.2, currentSeed + 999);
    // Reduced base density for more natural clearings
    if (noise < 0.12 * clumpMask) {
        const idx = Math.floor(noise * 100) % lifeList.length;
        let decoId = lifeList[idx];
        
        // Feature: Staged Crops (0-3)
        if (STAGED_CROPS.includes(decoId)) {
            const stage = Math.floor(hash2D(x, z, currentSeed + 444) * 4);
            decoId = `${decoId}_stage${stage}`;
        }

        setPlannedPlant(planMap, changedMap, x, y + 1, z, decoId);
    }
}

function chunkCoord(worldValue, chunkSize) {
    return Math.floor(worldValue / chunkSize);
}

const api = {
    async generateChunk({
        cx,
        cz,
        chunkSize,
        seedString,
        changedEntries = [],
        corruptionEnabled = false,
        cavesEnabled = true
    }) {
        const router = getRouter(seedString);
        const changedMap = new Map(changedEntries);
        const planMap = new Map();
        const startX = cx * chunkSize;
        const startZ = cz * chunkSize;

        for (let lx = 0; lx < chunkSize; lx++) {
            for (let lz = 0; lz < chunkSize; lz++) {
                const wx = startX + lx;
                const wz = startZ + lz;
                const biome = getBiomeById(router.getBiomeID(wx, wz));
                const inForcedSpawnZone = shouldForceSpawnZone(wx, wz);

                const terrainHeight = getColumnHeight(router, wx, wz);
                const waterLevel = SEA_LEVEL + (biome.waterLevelOffset ?? 0);

                let surfaceId = terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;
                const hasRoad = !inForcedSpawnZone && terrainHeight > waterLevel && isPathAt(wx, wz);
                const hasHighway = !inForcedSpawnZone && terrainHeight > waterLevel && isHighwayAt(wx, wz);
                if (hasHighway) {
                    surfaceId = 'cobblestone';
                } else if (hasRoad) {
                    surfaceId = 'path_block';
                }
                if (!inForcedSpawnZone && terrainHeight > 58 && surfaceId !== 'path_block') {
                    surfaceId = 'snow_block';
                }
                
                const surfaceCarved = shouldCarveCave(wx, terrainHeight, wz, terrainHeight, cavesEnabled);
                if (!surfaceCarved) {
                    setPlannedBlock(planMap, changedMap, wx, terrainHeight, wz, surfaceId);
                }

                const nx = getColumnHeight(router, wx + 1, wz);
                const px = getColumnHeight(router, wx - 1, wz);
                const nz = getColumnHeight(router, wx, wz + 1);
                const pz = getColumnHeight(router, wx, wz - 1);
                const minNeighbor = Math.min(nx, px, nz, pz);
                const exposedDepth = Math.max(0, terrainHeight - minNeighbor);

                for (let d = 1; d <= 3; d++) {
                    const y = terrainHeight - d;
                    if (y < MIN_TERRAIN_Y) break;
                    if (shouldCarveCave(wx, y, wz, terrainHeight, cavesEnabled)) continue;
                    setPlannedBlock(planMap, changedMap, wx, y, wz, biome.fillerBlock);
                }

                const totalDepth = terrainHeight - MIN_TERRAIN_Y;
                for (let d = 4; d <= totalDepth; d++) {
                    const y = terrainHeight - d;
                    if (y < MIN_TERRAIN_Y) break;
                    if (shouldCarveCave(wx, y, wz, terrainHeight, cavesEnabled)) continue;
                    setPlannedBlock(planMap, changedMap, wx, y, wz, 'stone');
                }

                if (!inForcedSpawnZone) {
                    for (let y = terrainHeight + 1; y <= waterLevel; y++) {
                        setPlannedBlock(planMap, changedMap, wx, y, wz, 'water');
                    }
                }

                if (shouldPlaceVirus(wx, wz, terrainHeight, corruptionEnabled)) {
                    setPlannedBlock(planMap, changedMap, wx, terrainHeight + 1, wz, 'virus');
                } else if (shouldPlaceArlo(wx, wz, terrainHeight, corruptionEnabled)) {
                    setPlannedBlock(planMap, changedMap, wx, terrainHeight + 1, wz, 'arlo');
                }

                if (!inForcedSpawnZone && terrainHeight > waterLevel) {
                    const tntRoll = hash2D(wx + 777, wz - 313, currentSeed);
                    if (tntRoll > 0.9989) {
                        setPlannedBlock(planMap, changedMap, wx, terrainHeight + 1, wz, 'tnt');
                    }
                    const nukeRoll = hash2D(wx - 1441, wz + 918, currentSeed);
                    if (nukeRoll > 0.99972) {
                        setPlannedBlock(planMap, changedMap, wx, terrainHeight + 1, wz, 'nuke');
                    }
                }

                // Trees & Deco shouldn't float if the surface block was carved into a cave
                const isHighAltitude = terrainHeight > 46;
                if (!surfaceCarved && !inForcedSpawnZone && !isHighAltitude && shouldPlaceTree(wx, wz, terrainHeight, biome)) {
                    addTree(planMap, changedMap, wx, terrainHeight + 1, wz, biome, corruptionEnabled);
                }

                if (!surfaceCarved && !inForcedSpawnZone && !isHighAltitude && terrainHeight > waterLevel) {
                    addGroundLife(planMap, changedMap, wx, terrainHeight, wz, biome);
                }
            }
        }

        for (const [key, id] of changedMap.entries()) {
            const [x, y, z] = api.keyToCoords(key);
            if (chunkCoord(x, chunkSize) !== cx || chunkCoord(z, chunkSize) !== cz) continue;
            if (id === null) {
                planMap.delete(key);
            } else {
                planMap.set(key, id);
            }
        }

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

        return transfer({
            data,
            palette,
            cx,
            cz
        }, [data.buffer]);
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
    }
};

expose(api);
