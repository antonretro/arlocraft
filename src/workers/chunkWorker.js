import { expose, transfer } from 'comlink';
import { BIOME_BY_ID } from '../data/biomes.js';
import { Noise } from '../world/Noise.js';
import { NoiseRouter } from '../world/NoiseRouter.js';

const SEA_LEVEL = 1;
const MIN_TERRAIN_Y = -12;
const MAX_TERRAIN_Y = 65;
const DEEP_MIN_Y = -220;

const DEFAULT_BIOME = BIOME_BY_ID.get('plains');

const TREE_CONFIGS = {
    oak: { trunk: 'wood', leaves: 'leaves', height: 5, radius: 2 },
    birch: { trunk: 'wood_birch', leaves: 'leaves_birch', height: 6, radius: 2 },
    pine: { trunk: 'wood_pine', leaves: 'leaves_pine', height: 7, radius: 1 },
    palm: { trunk: 'wood_palm', leaves: 'leaves_palm', height: 5, radius: 2 },
    willow: { trunk: 'wood_willow', leaves: 'leaves_willow', height: 4, radius: 3 },
    cherry: { trunk: 'wood_cherry', leaves: 'leaves_cherry', height: 5, radius: 2 },
    redwood: { trunk: 'wood_redwood', leaves: 'leaves_redwood', height: 10, radius: 2 },
    crystal: { trunk: 'wood_crystal', leaves: 'leaves_crystal', height: 6, radius: 2 }
};

const BIOME_GROUND_LIFE = {
    plains: ['flower_dandelion', 'flower_rose'],
    forest: ['mushroom_brown', 'blueberry', 'strawberry', 'flower_rose'],
    meadow: ['flower_dandelion', 'flower_rose', 'blueberry'],
    swamp: ['mushroom_brown', 'blueberry'],
    desert: ['tomato'],
    badlands: ['carrot'],
    canyon: ['carrot'],
    highlands: ['potato'],
    alpine: ['potato'],
    tundra: ['potato']
};

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

function shouldPlaceTree(x, z, height, biome) {
    if (height <= SEA_LEVEL + 1) return false;
    if ((biome.treeDensity ?? 0) <= 0) return false;

    const openZone = valueNoise2D(x + 1433, z - 977, 190, currentSeed) > 0.67
        && valueNoise2D(x - 621, z + 299, 72, currentSeed) > 0.55;
    if (openZone) return false;

    const density = hash2D((x * 2) + 11, (z * 2) - 9, currentSeed);
    const spacing = hash2D(x + 301, z - 173, currentSeed);
    const threshold = 1 - Math.max(0, Math.min(0.5, biome.treeDensity ?? 0.08));
    return density > threshold && spacing > 0.55;
}

function shouldCarveCave(x, y, z, terrainHeight, cavesEnabled) {
    if (!cavesEnabled) return false;
    if (y >= terrainHeight - 2) return false;
    if (y <= DEEP_MIN_Y + 2) return false;

    const nA = (workerNoise.simplex3D(x * 0.04, y * 0.03, z * 0.04) * 0.5) + 0.5;
    const nB = (workerNoise.simplex3D((x * 0.01) + 17, (y * 0.015) - 9, (z * 0.01) + 4) * 0.5) + 0.5;
    const nC = (workerNoise.simplex3D((x * 0.005) - 41, (y * 0.05) + 12, (z * 0.005) + 63) * 0.5) + 0.5;
    const caveValue = (nA * 0.5) + (nB * 0.35) + (nC * 0.15);
    const depthRatio = Math.max(0, Math.min(1, (terrainHeight - y) / 96));

    const chamber = caveValue > (0.865 - (depthRatio * 0.08));
    const tunnelBand = Math.abs(nC - 0.5) < 0.04 && nA > 0.44;
    const fissureNoise = (workerNoise.simplex3D((x * 0.002) + 9, (y * 0.02) - 31, (z * 0.002) - 21) * 0.5) + 0.5;
    const fissure = Math.abs(fissureNoise - 0.5) < 0.03 && y < terrainHeight - 8;
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
    const lifeChoices = BIOME_GROUND_LIFE[biome.id];
    if (!lifeChoices || lifeChoices.length === 0) return;
    const roll = hash2D((x * 53) + 17, (z * 61) - 29, currentSeed);
    if (roll > 0.045) return;
    const pick = Math.floor(hash2D(x - 919, z + 771, currentSeed) * lifeChoices.length);
    setPlannedBlock(planMap, changedMap, x, y + 1, z, lifeChoices[pick]);
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
                setPlannedBlock(planMap, changedMap, wx, terrainHeight, wz, surfaceId);

                const nx = getColumnHeight(router, wx + 1, wz);
                const px = getColumnHeight(router, wx - 1, wz);
                const nz = getColumnHeight(router, wx, wz + 1);
                const pz = getColumnHeight(router, wx, wz - 1);
                const minNeighbor = Math.min(nx, px, nz, pz);
                const exposedDepth = Math.max(0, terrainHeight - minNeighbor);

                for (let d = 1; d <= 3; d++) {
                    const y = terrainHeight - d;
                    if (y < MIN_TERRAIN_Y) break;
                    setPlannedBlock(planMap, changedMap, wx, y, wz, biome.fillerBlock);
                }

                const cliffFill = Math.min(exposedDepth, 50);
                for (let d = 4; d <= cliffFill; d++) {
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

                const isHighAltitude = terrainHeight > 46;
                if (!inForcedSpawnZone && !isHighAltitude && shouldPlaceTree(wx, wz, terrainHeight, biome)) {
                    addTree(planMap, changedMap, wx, terrainHeight + 1, wz, biome, corruptionEnabled);
                }

                if (!inForcedSpawnZone && !isHighAltitude && terrainHeight > waterLevel) {
                    const decoHash = hash2D(wx * 22, wz * 33, currentSeed);
                    if (decoHash < 0.08) {
                        const decoId = decoHash < 0.06 ? 'grass_tall' : (decoHash < 0.07 ? 'flower_rose' : 'flower_dandelion');
                        setPlannedBlock(planMap, changedMap, wx, terrainHeight + 1, wz, decoId);
                    } else {
                        addGroundLife(planMap, changedMap, wx, terrainHeight, wz, biome);
                    }
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
    }
};

expose(api);
