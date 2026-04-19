import { BIOME_BY_ID } from '../../data/biomes.js';
import { Noise } from '../Noise.js';
import { NoiseRouter } from '../NoiseRouter.js';
import { generateSettlementName } from '../naming/SettlementNameGenerator.js';
import {
    getContinentMask,
    getRawTerrainHeight,
    getColumnHeight as shapeColumnHeight
} from './ContinentShaper.js';

export class WorldTerrainService {
    constructor(world) {
        this.world = world;
        this.seedString = 'antoncraft';
        this.seed = 1;
        this.noise = null;
        this.router = null;
        
        // Cache references
        this.terrainHeightCache = world.state.terrainHeightCache;
        this.biomeCache = world.state.biomeCache;
        
        this._blendedColorCache = new Map();

        // Initialize with default seed immediately
        this.setSeed(this.seedString);
    }

    setSeed(seedValue) {
        this.seedString = String(seedValue ?? 'antoncraft').trim() || 'antoncraft';

        const numeric = Number(this.seedString);
        if (Number.isFinite(numeric)) {
            this.seed = Math.floor(Math.abs(numeric)) + 1;
        } else {
            let hash = 2166136261;
            for (let i = 0; i < this.seedString.length; i++) {
                hash ^= this.seedString.charCodeAt(i);
                hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
            }
            this.seed = Math.abs(hash >>> 0) + 1;
        }

        this.noise = new Noise(this.seedString);
        this.router = new NoiseRouter(this.seedString);
        this.terrainHeightCache.clear();
        this.biomeCache.clear();
        this._blendedColorCache.clear();
    }

    getBiomeAt(x, z) {
        const gx = Math.round(x);
        const gz = Math.round(z);
        const key = (gx + 1000000) * 2097152 + (gz + 1000000);
        let id = this.biomeCache.get(key);
        if (!id) {
            id = this.router.getBiomeID(gx, gz);
            if (this.biomeCache.size > 120000) this.biomeCache.clear();
            this.biomeCache.set(key, id);
        }
        return BIOME_BY_ID.get(id) ?? BIOME_BY_ID.get('plains');
    }

    // ── Continent mask ──────────────────────────────────────────────────────
    _getContinentMask(x, z) {
        return getContinentMask(this.noise, x, z, this.seed);
    }

    getTerrainHeight(x, z) {
        const gx = Math.round(x);
        const gz = Math.round(z);
        const key = (gx + 1000000) * 2097152 + (gz + 1000000);
        const cached = this.terrainHeightCache.get(key);
        if (cached !== undefined) return cached;

        const clamped = getRawTerrainHeight(this.router, this.noise, gx, gz, this.seed);
        if (this.terrainHeightCache.size > 120000) this.terrainHeightCache.clear();
        this.terrainHeightCache.set(key, clamped);
        return clamped;
    }

    getColumnHeight(x, z) {
        return shapeColumnHeight(this.router, this.noise, x, z, this.seed);
    }

    isCorruptedAt(x, z) {
        if (!this.world.corruptionEnabled) return false;
        const corruption = this.noise.simplex2D(x * 0.005, z * 0.005);
        return corruption > 0.4;
    }

    // --- FEATURE: Smooth Blending Engine ---
    getBlendedColor(x, z, property = 'color') {
        const gx = Math.round(x);
        const gz = Math.round(z);
        // Numeric key: high bits = position, low bit = property (0=color,1=waterColor)
        const propBit = property === 'color' ? 0 : 1;
        const cacheKey = ((gx + 1000000) * 2097152 + (gz + 1000000)) * 2 + propBit;
        if (this._blendedColorCache.has(cacheKey)) return this._blendedColorCache.get(cacheKey);

        let r = 0, g = 0, b = 0;
        const radius = 4; // 9x9 area for smooth results
        const count = (radius * 2 + 1) * (radius * 2 + 1);

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const biome = this.getBiomeAt(gx + dx, gz + dz);
                const hex = biome[property] ?? 0x91bd59;
                r += (hex >> 16) & 0xff;
                g += (hex >> 8) & 0xff;
                b += hex & 0xff;
            }
        }

        const result = (Math.round(r / count) << 16) | (Math.round(g / count) << 8) | Math.round(b / count);
        if (this._blendedColorCache.size > 50000) this._blendedColorCache.clear();
        this._blendedColorCache.set(cacheKey, result);
        return result;
    }

    // --- FEATURE: Natural Clumping Noise ---
    getClumpedDensityMask(x, z, type = 'trees') {
        const freq = type === 'trees' ? 0.02 : 0.04;
        const n = (this.noise.simplex2D(x * freq, z * freq) * 0.5) + 0.5;
        // Sharpen the noise to create distinct patches
        return Math.pow(n, 1.5) > 0.45 ? 1.0 : 0.0;
    }

    // --- Backward Compatibility Utilities ---
    digDownFrom(x, z) {
        const height = this.getColumnHeight(x, z);
        return { x: Math.floor(x + 0.5), y: height, z: Math.floor(z + 0.5) };
    }

    getWaterSurfaceYAt(x, z) {
        const biome = this.getBiomeAt(x, z);
        const waterLevel = this.world.seaLevel + (biome.waterLevelOffset ?? 0);
        const terrainHeight = this.getTerrainHeight(x, z);
        if (terrainHeight >= waterLevel) return null;
        return waterLevel + 0.5;
    }

    isPositionInWater(x, y, z) {
        const waterSurfaceY = this.getWaterSurfaceYAt(x, z);
        if (waterSurfaceY === null || y > waterSurfaceY) return false;

        // 2. Check actual block at position
        const key = this.world.coords.getKey(Math.round(x), Math.round(y), Math.round(z));
        const blockIdInMap = this.world.state.blockMap.get(key);
        
        if (blockIdInMap) {
            return blockIdInMap === 'water' || blockIdInMap.startsWith('water') || blockIdInMap === 'lava';
        }

        // 3. Fallback for air/void
        // If the chunk is loaded but the block is missing/null, it's AIR (or deleted by player).
        // We should NOT assume it's water even if below sea level.
        const cx = this.world.coords.getChunkCoord(x);
        const cy = this.world.coords.getChunkCoord(y);
        const cz = this.world.coords.getChunkCoord(z);
        const chunk = this.world.chunkManager?.getChunk(cx, cy, cz);
        
        if (chunk && !chunk.destroyed) {
            // Chunk is active and block is null/missing -> definitely air.
            return false;
        }

        // 4. Final Fallback for unloaded chunks: assume water if between terrain and surface
        const terrainHeight = this.getTerrainHeight(x, z);
        return y > terrainHeight;
    }

    getSafeSpawnPoint(x, z, radius = 50) {
        for (let r = 0; r <= radius; r += 2) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                const tx = x + Math.cos(angle) * r;
                const tz = z + Math.sin(angle) * r;
                const height = this.getTerrainHeight(tx, tz);
                if (height > this.world.seaLevel + 1) {
                    return { x: tx, y: height + 2, z: tz };
                }
            }
        }
        return { x: x, y: 70, z: z };
    }

    hash2D(x, z) {
        const v = Math.sin((x * 127.1) + (z * 311.7) + this.seed) * 43758.5453;
        return v - Math.floor(v);
    }

    hash3D(x, y, z) {
        const v = Math.sin((x * 12.9898) + (y * 78.233) + (z * 37.719) + this.seed) * 43758.5453;
        return v - Math.floor(v);
    }

    _smoothstep(t) { return t * t * (3 - 2 * t); }
    _lerp(a, b, t) { return a + (b - a) * t; }

    valueNoise2D(x, z, scale) {
        const sx = x / scale, sz = z / scale;
        const x0 = Math.floor(sx), z0 = Math.floor(sz);
        const tx = this._smoothstep(sx - x0), tz = this._smoothstep(sz - z0);
        return this._lerp(
            this._lerp(this.hash2D(x0, z0), this.hash2D(x0 + 1, z0), tx),
            this._lerp(this.hash2D(x0, z0 + 1), this.hash2D(x0 + 1, z0 + 1), tx),
            tz
        );
    }

    shouldForceSpawnZone(x, z) {
        return Math.abs(x) <= 6 && Math.abs(z) <= 6;
    }

    shouldPlaceTree(x, z, height, biome = null) {
        const b = biome ?? this.getBiomeAt(x, z);
        if (height <= this.world.seaLevel + 1) return false;
        if ((b.treeDensity ?? 0) <= 0) return false;
        const openZone = this.valueNoise2D(x + 1433, z - 977, 190) > 0.67
            && this.valueNoise2D(x - 621, z + 299, 72) > 0.55;
        if (openZone) return false;
        // --- JITTERED GRID TREE PLACEMENT ---
        // Prevents clumping by ensuring at most 1 tree per NxN cell with mandatory gaps.
        const gridSize = 5; 
        const cellX = Math.floor(x / gridSize);
        const cellZ = Math.floor(z / gridSize);
        
        // Compute the "chosen" point for this cell based on its coordinates
        // Use a 1-block inner padding to ensure trees in adjacent cells are never neighbors
        const cellHashX = this.hash2D(cellX * 131, cellZ * 71);
        const cellHashZ = this.hash2D(cellX * 17, cellZ * 91);
        const chosenX = cellX * gridSize + 1 + Math.floor(cellHashX * (gridSize - 2));
        const chosenZ = cellZ * gridSize + 1 + Math.floor(cellHashZ * (gridSize - 2));

        // Only allow tree if this is the chosen coordinate for its grid cell
        if (Math.floor(x) !== chosenX || Math.floor(z) !== chosenZ) return false;

        const density = this.hash2D(x + 11, z - 9);
        const threshold = 1 - Math.max(0, Math.min(0.8, b.treeDensity ?? 0.08));
        return density > threshold;
    }

    shouldPlaceVirus(x, z, height) {
        if (!this.world.corruptionEnabled) return false;
        if (height < this.world.seaLevel + 1) return false;
        return this.hash2D(x - 991, z + 417) > 0.9992;
    }

    shouldPlaceAnton(x, z, height) {
        if (!this.world.corruptionEnabled) return false;
        if (height < this.world.seaLevel + 1) return false;
        return this.hash2D(x + 613, z - 271) > 0.985;
    }

    isPathAt(x, z) {
        const trunk = Math.abs(this.noise.simplex2D(x * 0.02 + 1307, z * 0.02 - 811));
        const branch = Math.abs(this.noise.simplex2D(x * 0.04 - 547, z * 0.04 + 199));
        return trunk < 0.03 || branch < 0.02;
    }

    isHighwayAt(x, z) {
        const a = Math.abs(this.noise.simplex2D(x * 0.008 + 2143, z * 0.008 - 937));
        const b = Math.abs(this.noise.simplex2D(x * 0.007 - 1841, z * 0.007 + 221));
        return a < 0.015 || b < 0.018;
    }

    shouldCarveCave(x, y, z, terrainHeight) {
        if (!this.world.game?.features?.caves) return false;
        if (y >= terrainHeight - 2 || y <= this.world.deepMinY + 2) return false;
        const nA = this.noise.simplex3D(x * 0.04, y * 0.03, z * 0.04) * 0.5 + 0.5;
        const nB = this.noise.simplex3D(x * 0.01 + 17, y * 0.015 - 9, z * 0.01 + 4) * 0.5 + 0.5;
        const nC = this.noise.simplex3D(x * 0.005 - 41, y * 0.05 + 12, z * 0.005 + 63) * 0.5 + 0.5;
        const caveValue = nA * 0.5 + nB * 0.35 + nC * 0.15;
        const depthRatio = Math.max(0, Math.min(1, (terrainHeight - y) / 96));
        const chamber = caveValue > (0.865 - depthRatio * 0.08);
        const tunnelBand = Math.abs(nC - 0.5) < 0.04 && nA > 0.44;
        const fissureNoise = this.noise.simplex3D(x * 0.002 + 9, y * 0.02 - 31, z * 0.002 - 21) * 0.5 + 0.5;
        const fissure = Math.abs(fissureNoise - 0.5) < 0.03 && y < terrainHeight - 8;
        return chamber || tunnelBand || fissure;
    }

    getDeepBlockId(x, y, z) {
        const r = this.hash3D((x * 17) + 13, y * 7, (z * 19) - 5);
        if (y > -8) return r > 0.992 ? 'coal' : r > 0.986 ? 'copper' : 'stone';
        if (y > -20) return r > 0.994 ? 'tin' : r > 0.988 ? 'silver' : r > 0.982 ? 'iron' : 'stone';
        if (y > -40) return r > 0.996 ? 'ruby' : r > 0.992 ? 'sapphire' : r > 0.986 ? 'gold' : r > 0.978 ? 'amethyst' : 'stone';
        if (y > -70) return r > 0.997 ? 'platinum' : r > 0.992 ? 'uranium' : r > 0.986 ? 'diamond' : r > 0.979 ? 'obsidian' : 'stone';
        return r > 0.996 ? 'mythril' : r > 0.991 ? 'diamond' : r > 0.985 ? 'uranium' : 'obsidian';
    }

    getStructureChunkScore(cx, cz) {
        return this.hash2D((cx * 47) + 113, (cz * 47) - 271);
    }

    isStructureChunkAnchor(cx, cz, radius = 2) {
        const score = this.getStructureChunkScore(cx, cz);
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (dx === 0 && dz === 0) continue;
                if (this.getStructureChunkScore(cx + dx, cz + dz) >= score) return false;
            }
        }
        return true;
    }

    shouldPlaceVillageChunk(cx, cz) {
        if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return false;
        if (this.hash2D((cx * 31) + 71, (cz * 31) - 19) < 0.992) return false;
        const wx = cx * this.world.chunkSize + Math.floor(this.world.chunkSize * 0.5);
        const wz = cz * this.world.chunkSize + Math.floor(this.world.chunkSize * 0.5);
        const biome = this.getBiomeAt(wx, wz);
        return biome.id === 'plains' || biome.id === 'forest' || biome.id === 'meadow';
    }

    getSettlementNameAt(x, z) {
        return generateSettlementName(this.seed, Math.round(x), Math.round(z));
    }

    shouldPlaceStructureChunk(cx, cz) {
        if (Math.abs(cx) <= 2 && Math.abs(cz) <= 2) return false;
        if (this.shouldPlaceVillageChunk(cx, cz)) return false;
        if (this.getStructureChunkScore(cx, cz) < 0.82) return false;
        // Increased radius from 2 to 3 (7x7 chunks or ~112x112 blocks) to prevent clumping
        return this.isStructureChunkAnchor(cx, cz, 3);
    }
}
