import { expose } from 'comlink';
import { BIOME_BY_ID } from '../data/biomes.js';
import { NoiseRouter } from '../world/NoiseRouter.js';

const SEA_LEVEL = 64;
const MIN_TERRAIN_Y = 0;
const MAX_TERRAIN_Y = 128;

const DEFAULT_BIOME = BIOME_BY_ID.get('plains');

let workerRouter = null;
let currentSeedString = null;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getRouter(seedString) {
    if (currentSeedString !== seedString || !workerRouter) {
        workerRouter = new NoiseRouter(seedString);
        currentSeedString = seedString;
    }
    return workerRouter;
}

function getBiomeById(id) {
    return BIOME_BY_ID.get(id) ?? DEFAULT_BIOME;
}

function getColumnHeight(router, x, z) {
    let height = Math.round(router.getTerrainHeight(x, z));

    const dist = Math.max(Math.abs(x), Math.abs(z));
    if (dist <= 20) {
        const flatHeight = SEA_LEVEL + 4;
        const blend = Math.min(1, dist / 20);
        height = Math.round(flatHeight + ((height - flatHeight) * blend));
        height = Math.max(height, SEA_LEVEL + 2);
    }

    return clamp(height, MIN_TERRAIN_Y, MAX_TERRAIN_Y);
}

function getDeepBlockId(x, y, z) {
    const r = Math.abs(Math.sin((x * 0.05) + (y * 0.1) + (z * 0.05)) * 10000 % 1);
    if (y > -8) {
        if (r > 0.992) return 'coal';
        if (r > 0.986) return 'copper';
        return 'stone';
    }
    if (y > -20) {
        if (r > 0.994) return 'tin';
        if (r > 0.988) return 'silver';
        if (r > 0.982) return 'iron';
        return 'stone';
    }
    if (y > -40) {
        if (r > 0.996) return 'ruby';
        if (r > 0.992) return 'sapphire';
        if (r > 0.986) return 'gold';
        if (r > 0.978) return 'amethyst';
        return 'stone';
    }
    if (y > -70) {
        if (r > 0.997) return 'platinum';
        if (r > 0.992) return 'uranium';
        if (r > 0.986) return 'diamond';
        if (r > 0.979) return 'obsidian';
        return 'stone';
    }
    if (r > 0.996) return 'mythril';
    if (r > 0.991) return 'diamond';
    if (r > 0.985) return 'uranium';
    return 'obsidian';
}

function shouldForceSpawnZone(x, z) {
    return Math.abs(x) <= 4 && Math.abs(z) <= 4;
}

function shouldPlaceVirus(wx, wz, y, router) {
    if (y < SEA_LEVEL + 2) return false;
    const climate = (router.tempNoise.noise(wx, 0, wz, 1 / 180, 1, 1 / 180) * 0.5) + 0.5;
    const pulse = Math.abs(Math.sin((wx * 0.091) - (wz * 0.073)));
    return climate > 0.76 && pulse > 0.997;
}

function shouldPlaceTree(wx, wz, y, biome, router) {
    if (y <= SEA_LEVEL + 1) return false;
    const density = clamp(biome.treeDensity ?? 0, 0, 0.45);
    if (density <= 0) return false;

    const humiditySignal = Math.abs(router.humidNoise.noise(wx, 0, wz, 1 / 96, 1, 1 / 96));
    const threshold = 1 - density;
    return humiditySignal > threshold;
}

function chunkCoord(worldValue, chunkSize) {
    return Math.floor(worldValue / chunkSize);
}

function makeKey(x, y, z) {
    return `${x}|${y}|${z}`;
}

function addTree(planMap, x, y, z, changedMap, router) {
    const trunkHeight = 4 + Math.floor(Math.abs(router.tempNoise.noise(x, 0, z, 1 / 8, 1, 1 / 8)) * 3);
    for (let i = 0; i < trunkHeight; i++) {
        const k = makeKey(x, y + i, z);
        if (changedMap.get(k) === null) continue;
        planMap.set(k, changedMap.get(k) ?? 'wood');
    }

    const leafBase = y + trunkHeight - 2;
    for (let lx = -2; lx <= 2; lx++) {
        for (let lz = -2; lz <= 2; lz++) {
            for (let ly = 0; ly <= 2; ly++) {
                const isCorner = Math.abs(lx) === 2 && Math.abs(lz) === 2;
                if (isCorner && ly === 2) continue;
                const k = makeKey(x + lx, leafBase + ly, z + lz);
                if (changedMap.get(k) === null) continue;
                planMap.set(k, changedMap.get(k) ?? 'leaves');
            }
        }
    }
}

const api = {
    async generateChunk({
        cx,
        cz,
        chunkSize,
        seedString,
        changedEntries = [],
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

                const biomeId = router.getBiomeID(wx, wz);
                const biome = getBiomeById(biomeId);
                const inForcedSpawnZone = shouldForceSpawnZone(wx, wz);
                const waterLevel = clamp(SEA_LEVEL + (biome.waterLevelOffset ?? 0), MIN_TERRAIN_Y, MAX_TERRAIN_Y);
                const terrainHeight = getColumnHeight(router, wx, wz);

                const surfaceId = terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;
                let cachedCaveDensity = 1;

                for (let y = terrainHeight; y >= MIN_TERRAIN_Y; y--) {
                    const depth = terrainHeight - y;

                    let blockId;
                    if (depth === 0) {
                        blockId = surfaceId;
                    } else if (depth <= 3) {
                        blockId = biome.fillerBlock;
                    } else {
                        if (cavesEnabled && depth > 6) {
                            if ((y & 1) === 0) {
                                cachedCaveDensity = router.getDensity(wx, y, wz);
                            }
                            if (cachedCaveDensity <= 0) continue;
                        }
                        blockId = getDeepBlockId(wx, y, wz);
                    }

                    const key = makeKey(wx, y, wz);
                    if (changedMap.get(key) === null) continue;
                    planMap.set(key, changedMap.get(key) ?? blockId);
                }

                if (!inForcedSpawnZone && waterLevel > terrainHeight) {
                    for (let y = terrainHeight + 1; y <= waterLevel; y++) {
                        const key = makeKey(wx, y, wz);
                        if (changedMap.get(key) === null) continue;
                        planMap.set(key, changedMap.get(key) ?? 'water');
                    }
                }

                if (!inForcedSpawnZone) {
                    if (shouldPlaceVirus(wx, wz, terrainHeight, router)) {
                        const vKey = makeKey(wx, terrainHeight + 1, wz);
                        if (changedMap.get(vKey) !== null) planMap.set(vKey, changedMap.get(vKey) ?? 'virus');
                    } else if (shouldPlaceTree(wx, wz, terrainHeight, biome, router)) {
                        addTree(planMap, wx, terrainHeight + 1, wz, changedMap, router);
                    }
                }
            }
        }

        for (const [key, id] of changedMap.entries()) {
            const [x, y, z] = key.split('|').map(Number);
            if (chunkCoord(x, chunkSize) !== cx || chunkCoord(z, chunkSize) !== cz) continue;
            if (id === null) {
                planMap.delete(key);
            } else {
                planMap.set(key, id);
            }
        }

        const output = [];
        for (const [key, id] of planMap.entries()) {
            const [x, y, z] = key.split('|').map(Number);
            output.push({ x, y, z, id });
        }
        return output;
    }
};

expose(api);
