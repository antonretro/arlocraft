import { expose } from 'comlink';
import { Noise } from '../world/Noise.js';

const SEA_LEVEL = 1;
const MIN_TERRAIN_Y = -12;
const MAX_TERRAIN_Y = 126;
const DEEP_MIN_Y = -220;

const BIOMES = {
    plains: { surfaceBlock: 'grass', fillerBlock: 'dirt', terrainBias: 0, terrainRoughness: 1, waterLevelOffset: 0, treeDensity: 0.08 },
    forest: { surfaceBlock: 'grass', fillerBlock: 'dirt', terrainBias: 0.3, terrainRoughness: 1.12, waterLevelOffset: 0, treeDensity: 0.18 },
    desert: { surfaceBlock: 'sand', fillerBlock: 'sand', terrainBias: -0.25, terrainRoughness: 0.9, waterLevelOffset: -1, treeDensity: 0.01 },
    swamp: { surfaceBlock: 'grass', fillerBlock: 'dirt', terrainBias: -0.6, terrainRoughness: 0.8, waterLevelOffset: 1, treeDensity: 0.1 },
    highlands: { surfaceBlock: 'stone', fillerBlock: 'stone', terrainBias: 1.1, terrainRoughness: 1.35, waterLevelOffset: -1, treeDensity: 0.03 }
};

let workerNoise = null;
let currentSeedString = null;

function getNoise(seedString) {
    if (currentSeedString !== seedString || !workerNoise) {
        workerNoise = new Noise(seedString);
        currentSeedString = seedString;
    }
    return workerNoise;
}


function getBiomeAt(x, z, noise) {
    const temperature = noise.fbm2D(x + 911, z - 1441, 3, 0.5, 2.0) * 0.5 + 0.5;
    const moisture = noise.fbm2D(x - 1283, z + 677, 3, 0.5, 2.0) * 0.5 + 0.5;
    const continental = noise.fbm2D(x + 2057, z + 111, 2, 0.5, 2.0) * 0.5 + 0.5;

    if (temperature > 0.68 && moisture < 0.38) return BIOMES.desert;
    if (moisture > 0.74 && temperature < 0.56) return BIOMES.swamp;
    if (continental > 0.72 && moisture < 0.46) return BIOMES.highlands;
    if (moisture > 0.62) return BIOMES.forest;
    return BIOMES.plains;
}

function getTerrainHeight(x, z, noise) {
    const biome = getBiomeAt(x, z, noise);
    const roughness = biome.terrainRoughness ?? 1;

    // Base continental shapes
    const continental = noise.fbm2D(x * 0.003, z * 0.003, 4) * 28;
    // Regional hills
    const regional = noise.fbm2D(x * 0.008, z * 0.008, 3) * 18 * roughness;
    // Fine detail
    const detail = noise.simplex2D(x * 0.03, z * 0.03) * 10 * roughness;
    // Even finer detail
    const fine = noise.simplex2D(x * 0.08, z * 0.08) * 4.5 * roughness;

    // Mountains
    const mountainMask = noise.fbm2D(x * 0.004, z * 0.004, 2) * 0.5 + 0.5;
    const mountainStrength = Math.max(0, (mountainMask - 0.58) / 0.42);
    const mountainLift = (mountainStrength ** 1.9) * 72;

    const cliffBand = Math.abs(noise.simplex2D(x * 0.02, z * 0.02));
    const cliffLift = cliffBand < 0.07 ? ((0.07 - cliffBand) / 0.07) * 26 : 0;
    
    const canyonCut = Math.max(0, (0.2 - Math.abs(noise.fbm2D(x * 0.015, z * 0.015, 2))) / 0.2) * 14;

    const h = Math.floor(10 + continental + regional + detail + fine + mountainLift + cliffLift - canyonCut + (biome.terrainBias ?? 0));
    return Math.max(MIN_TERRAIN_Y + 2, Math.min(MAX_TERRAIN_Y, h));
}

function shouldCarveCave(x, y, z, terrainHeight, noise, cavesEnabled) {
    if (!cavesEnabled) return false;
    if (y >= terrainHeight - 2) return false;
    if (y <= DEEP_MIN_Y + 2) return false;
    const nA = noise.simplex3D(x * 0.04, y * 0.03, z * 0.04) * 0.5 + 0.5;
    const nB = noise.simplex3D(x * 0.01 + 17, y * 0.015 - 9, z * 0.01 + 4) * 0.5 + 0.5;
    const nC = noise.simplex3D(x * 0.005 - 41, y * 0.05 + 12, z * 0.005 + 63) * 0.5 + 0.5;
    const caveValue = (nA * 0.5) + (nB * 0.35) + (nC * 0.15);
    const depthRatio = Math.max(0, Math.min(1, (terrainHeight - y) / 96));

    const chamber = caveValue > (0.865 - (depthRatio * 0.08));
    const tunnelBand = Math.abs(nC - 0.5) < 0.04 && nA > 0.44;
    const fissureNoise = noise.simplex3D(x * 0.002 + 9, y * 0.02 - 31, z * 0.002 - 21) * 0.5 + 0.5;
    const fissure = Math.abs(fissureNoise - 0.5) < 0.03 && y < terrainHeight - 8;

    return chamber || tunnelBand || fissure;
}

function getDeepBlockId(x, y, z, noise) {
    const r = noise.simplex3D(x * 0.05 + 13, y * 0.05, z * 0.05 - 5) * 0.5 + 0.5;
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

function shouldPlaceVirus(x, z, height, noise) {
    if (height < SEA_LEVEL + 1) return false;
    return noise.simplex2D(x * 0.1 - 991, z * 0.1 + 417) * 0.5 + 0.5 > 0.985;
}

function shouldPlaceTree(x, z, height, biome, noise) {
    if (height <= SEA_LEVEL + 1) return false;
    const density = noise.simplex2D(x * 0.1 + 11, z * 0.1 - 9) * 0.5 + 0.5;
    const spacing = noise.simplex2D(x * 0.05 + 301, z * 0.05 - 173) * 0.5 + 0.5;
    const threshold = 1 - Math.max(0.01, Math.min(0.45, biome.treeDensity ?? 0.08));
    return density > threshold && spacing > 0.55;
}

function chunkCoord(worldValue, chunkSize) {
    return Math.floor(worldValue / chunkSize);
}

function makeKey(x, y, z) {
    return `${x}|${y}|${z}`;
}

function addTree(planMap, x, y, z, changedMap, noise) {
    const trunkHeight = 4 + Math.floor((noise.simplex2D(x * 0.1 + 7, z * 0.1 - 19) * 0.5 + 0.5) * 2);
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
        const noise = getNoise(seedString);
        const changedMap = new Map(changedEntries);
        const planMap = new Map();
        const startX = cx * chunkSize;
        const startZ = cz * chunkSize;

        for (let lx = 0; lx < chunkSize; lx++) {
            for (let lz = 0; lz < chunkSize; lz++) {
                const wx = startX + lx;
                const wz = startZ + lz;
                const terrainHeight = getTerrainHeight(wx, wz, noise);
                const biome = getBiomeAt(wx, wz, noise);
                const inForcedSpawnZone = shouldForceSpawnZone(wx, wz);
                const waterLevel = SEA_LEVEL + (biome.waterLevelOffset ?? 0);
                const surfaceId = terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;

                const surfaceKey = makeKey(wx, terrainHeight, wz);
                if (changedMap.get(surfaceKey) !== null) planMap.set(surfaceKey, changedMap.get(surfaceKey) ?? surfaceId);

                const nx = getTerrainHeight(wx + 1, wz, noise);
                const px = getTerrainHeight(wx - 1, wz, noise);
                const nz = getTerrainHeight(wx, wz + 1, noise);
                const pz = getTerrainHeight(wx, wz - 1, noise);
                const minNeighbor = Math.min(nx, px, nz, pz);
                const exposedDepth = Math.max(0, terrainHeight - minNeighbor);
                const stableDepth = 6;

                for (let d = 1; d <= Math.max(stableDepth, Math.min(12, exposedDepth + 2)); d++) {
                    const y = terrainHeight - d;
                    if (y < MIN_TERRAIN_Y) break;
                    if (d > 2 && shouldCarveCave(wx, y, wz, terrainHeight, noise, cavesEnabled)) continue;
                    const fillerId = d <= 2 ? biome.fillerBlock : getDeepBlockId(wx, y, wz, noise);
                    const key = makeKey(wx, y, wz);
                    if (changedMap.get(key) === null) continue;
                    planMap.set(key, changedMap.get(key) ?? fillerId);
                }

                if (!inForcedSpawnZone) {
                    for (let y = terrainHeight + 1; y <= waterLevel; y++) {
                        const key = makeKey(wx, y, wz);
                        if (changedMap.get(key) === null) continue;
                        planMap.set(key, changedMap.get(key) ?? 'water');
                    }
                }

                if (shouldPlaceVirus(wx, wz, terrainHeight, noise)) {
                    const key = makeKey(wx, terrainHeight + 1, wz);
                    if (changedMap.get(key) !== null) planMap.set(key, changedMap.get(key) ?? 'virus');
                }

                if (!inForcedSpawnZone && shouldPlaceTree(wx, wz, terrainHeight, biome, noise)) {
                    addTree(planMap, wx, terrainHeight + 1, wz, changedMap, noise);
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
