import { expose } from 'comlink';

const SEA_LEVEL = 1;
const MIN_TERRAIN_Y = -4;
const MAX_TERRAIN_Y = 7;
const DEEP_MIN_Y = -220;

const BIOMES = {
    plains: { surfaceBlock: 'grass', fillerBlock: 'dirt', terrainBias: 0, terrainRoughness: 1, waterLevelOffset: 0, treeDensity: 0.08 },
    forest: { surfaceBlock: 'grass', fillerBlock: 'dirt', terrainBias: 0.3, terrainRoughness: 1.12, waterLevelOffset: 0, treeDensity: 0.18 },
    desert: { surfaceBlock: 'sand', fillerBlock: 'sand', terrainBias: -0.25, terrainRoughness: 0.9, waterLevelOffset: -1, treeDensity: 0.01 },
    swamp: { surfaceBlock: 'grass', fillerBlock: 'dirt', terrainBias: -0.6, terrainRoughness: 0.8, waterLevelOffset: 1, treeDensity: 0.1 },
    highlands: { surfaceBlock: 'stone', fillerBlock: 'stone', terrainBias: 1.1, terrainRoughness: 1.35, waterLevelOffset: -1, treeDensity: 0.03 }
};

function hashSeed(seedValue) {
    const raw = String(seedValue ?? 'arlocraft').trim() || 'arlocraft';
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return Math.floor(Math.abs(numeric)) + 1;

    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0) + 1;
}

function smoothstep(t) {
    return t * t * (3 - (2 * t));
}

function lerp(a, b, t) {
    return a + ((b - a) * t);
}

function hash2D(x, z, seed) {
    const value = Math.sin((x * 127.1) + (z * 311.7) + seed) * 43758.5453;
    return value - Math.floor(value);
}

function hash3D(x, y, z, seed) {
    const value = Math.sin((x * 12.9898) + (y * 78.233) + (z * 37.719) + seed) * 43758.5453;
    return value - Math.floor(value);
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

function getBiomeAt(x, z, seed) {
    const temperature = valueNoise2D(x + 911, z - 1441, 220, seed);
    const moisture = valueNoise2D(x - 1283, z + 677, 210, seed);
    const continental = valueNoise2D(x + 2057, z + 111, 320, seed);

    if (temperature > 0.68 && moisture < 0.38) return BIOMES.desert;
    if (moisture > 0.74 && temperature < 0.56) return BIOMES.swamp;
    if (continental > 0.72 && moisture < 0.46) return BIOMES.highlands;
    if (moisture > 0.62) return BIOMES.forest;
    return BIOMES.plains;
}

function getTerrainHeight(x, z, seed) {
    const biome = getBiomeAt(x, z, seed);
    const roughness = biome.terrainRoughness ?? 1;
    const broad = (valueNoise2D(x, z, 72, seed) - 0.5) * 6;
    const detail = (valueNoise2D(x, z, 24, seed) - 0.5) * 3.5 * roughness;
    const ridges = (valueNoise2D(x, z, 12, seed) - 0.5) * 1.5 * roughness;
    const h = Math.floor(1 + broad + detail + ridges + (biome.terrainBias ?? 0));
    return Math.max(MIN_TERRAIN_Y + 2, Math.min(MAX_TERRAIN_Y, h));
}

function shouldCarveCave(x, y, z, terrainHeight, seed, cavesEnabled) {
    if (!cavesEnabled) return false;
    if (y >= terrainHeight - 2) return false;
    if (y <= DEEP_MIN_Y + 2) return false;
    const nA = hash3D(x * 0.8, y * 0.6, z * 0.8, seed);
    const nB = hash3D((x * 0.23) + 17, (y * 0.32) - 9, (z * 0.23) + 4, seed);
    const caveValue = (nA * 0.68) + (nB * 0.32);
    return caveValue > 0.83;
}

function getDeepBlockId(x, y, z, seed) {
    const r = hash3D((x * 17) + 13, y * 7, (z * 19) - 5, seed);
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

function shouldPlaceVirus(x, z, height, seed) {
    if (height < SEA_LEVEL + 1) return false;
    return hash2D(x - 991, z + 417, seed) > 0.985;
}

function shouldPlaceTree(x, z, height, biome, seed) {
    if (height <= SEA_LEVEL + 1) return false;
    const density = hash2D((x * 2) + 11, (z * 2) - 9, seed);
    const spacing = hash2D(x + 301, z - 173, seed);
    const threshold = 1 - Math.max(0.01, Math.min(0.45, biome.treeDensity ?? 0.08));
    return density > threshold && spacing > 0.55;
}

function chunkCoord(worldValue, chunkSize) {
    return Math.floor(worldValue / chunkSize);
}

function makeKey(x, y, z) {
    return `${x}|${y}|${z}`;
}

function addTree(planMap, x, y, z, changedMap, seed) {
    const trunkHeight = 4 + Math.floor(hash2D(x + 7, z - 19, seed) * 2);
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
        const seed = hashSeed(seedString);
        const changedMap = new Map(changedEntries);
        const planMap = new Map();
        const startX = cx * chunkSize;
        const startZ = cz * chunkSize;

        for (let lx = 0; lx < chunkSize; lx++) {
            for (let lz = 0; lz < chunkSize; lz++) {
                const wx = startX + lx;
                const wz = startZ + lz;
                const terrainHeight = getTerrainHeight(wx, wz, seed);
                const biome = getBiomeAt(wx, wz, seed);
                const inForcedSpawnZone = shouldForceSpawnZone(wx, wz);
                const waterLevel = SEA_LEVEL + (biome.waterLevelOffset ?? 0);
                const surfaceId = terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;

                const surfaceKey = makeKey(wx, terrainHeight, wz);
                if (changedMap.get(surfaceKey) !== null) planMap.set(surfaceKey, changedMap.get(surfaceKey) ?? surfaceId);

                const nx = getTerrainHeight(wx + 1, wz, seed);
                const px = getTerrainHeight(wx - 1, wz, seed);
                const nz = getTerrainHeight(wx, wz + 1, seed);
                const pz = getTerrainHeight(wx, wz - 1, seed);
                const minNeighbor = Math.min(nx, px, nz, pz);
                const exposedDepth = Math.max(0, terrainHeight - minNeighbor);
                const stableDepth = 6;

                for (let d = 1; d <= Math.max(stableDepth, Math.min(12, exposedDepth + 2)); d++) {
                    const y = terrainHeight - d;
                    if (y < MIN_TERRAIN_Y) break;
                    if (d > 2 && shouldCarveCave(wx, y, wz, terrainHeight, seed, cavesEnabled)) continue;
                    const fillerId = d <= 2 ? biome.fillerBlock : getDeepBlockId(wx, y, wz, seed);
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

                if (shouldPlaceVirus(wx, wz, terrainHeight, seed)) {
                    const key = makeKey(wx, terrainHeight + 1, wz);
                    if (changedMap.get(key) !== null) planMap.set(key, changedMap.get(key) ?? 'virus');
                }

                if (!inForcedSpawnZone && shouldPlaceTree(wx, wz, terrainHeight, biome, seed)) {
                    addTree(planMap, wx, terrainHeight + 1, wz, changedMap, seed);
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
