import { BIOME_BY_ID } from '../data/biomes.js';
import { JavaRandom, OctavePerlin } from './BetaNoise.js';

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function smoothstep(t) {
    const clamped = clamp01(t);
    return clamped * clamped * (3 - (2 * clamped));
}

function bilerp(v00, v10, v01, v11, tx, tz) {
    const nx0 = v00 + ((v10 - v00) * tx);
    const nx1 = v01 + ((v11 - v01) * tx);
    return nx0 + ((nx1 - nx0) * tz);
}

const DEFAULT_BIOME = BIOME_BY_ID.get('plains');

export class NoiseRouter {
    constructor(seedString = 'antoncraft') {
        this.seed = this.hashSeed(seedString);
        this.biomeBlendCellSize = 24;
        this.maxBiomeCellCacheEntries = 4096;
        this.biomeCellCache = new Map();
        this.init();
    }

    hashSeed(seedString) {
        let hash = 2166136261n;
        for (let i = 0; i < seedString.length; i++) {
            hash ^= BigInt(seedString.charCodeAt(i));
            hash *= 16777619n;
        }
        return hash;
    }

    init() {
        const rand = new JavaRandom(this.seed);

        // 3D generators reused for cave shaping.
        this.minLimit = new OctavePerlin(new JavaRandom(rand.seed + 11n), 16);
        this.maxLimit = new OctavePerlin(new JavaRandom(rand.seed + 37n), 16);
        this.mainLimit = new OctavePerlin(new JavaRandom(rand.seed + 71n), 8);

        // 2D terrain controls.
        this.surfaceNoise = new OctavePerlin(new JavaRandom(rand.seed + 97n), 4);
        this.scaleNoise = new OctavePerlin(new JavaRandom(rand.seed + 131n), 10);
        this.depthNoise = new OctavePerlin(new JavaRandom(rand.seed + 173n), 16);
        this.ridgeNoise = new OctavePerlin(new JavaRandom(rand.seed + 211n), 6);

        // Climate controls.
        this.tempNoise = new OctavePerlin(new JavaRandom(this.seed * 9871n), 4);
        this.humidNoise = new OctavePerlin(new JavaRandom(this.seed * 39811n), 4);
    }

    sample2D(generator, x, z, scale) {
        return generator.noise(x, 0, z, 1 / scale, 1, 1 / scale);
    }

    sample3D(generator, x, y, z, xScale, yScale = xScale, zScale = xScale) {
        return generator.noise(x, y, z, 1 / xScale, 1 / yScale, 1 / zScale);
    }

    getBiomeData(id) {
        return BIOME_BY_ID.get(id) ?? DEFAULT_BIOME;
    }

    getClimate(x, z) {
        const sx = Number(this.seed % 10000n);
        const sz = Number((this.seed / 1000n) % 10000n);

        const continental = clamp01((this.sample2D(this.depthNoise, x + sx, z + sz, 620) * 0.5) + 0.5);
        const erosion = clamp01((this.sample2D(this.scaleNoise, x - 4400 + sx, z + 2800 + sz, 340) * 0.5) + 0.5);
        const ridge = clamp01((this.sample2D(this.ridgeNoise, x + 1200 + sx, z - 1900 + sz, 240) * 0.5) + 0.5);

        const rawTemp = clamp01((this.sample2D(this.tempNoise, x + 9000 + sx, z - 3000 + sz, 560) * 0.5) + 0.5);
        const rawHumidity = clamp01((this.sample2D(this.humidNoise, x - 6000 + sx, z + 7000 + sz, 520) * 0.5) + 0.5);

        const elevation = clamp01((continental * 0.58) + ((1 - erosion) * 0.19) + (ridge * 0.23));
        const distFromOrigin = Math.sqrt(x * x + z * z);
        const warmBias = Math.max(0, 1 - distFromOrigin / 96) * 0.35;
        const temperature = clamp01(rawTemp + warmBias + ((continental - 0.5) * 0.08) - ((elevation - 0.5) * 0.13));
        const humidity = clamp01(rawHumidity + ((0.5 - temperature) * 0.12) - ((continental - 0.5) * 0.06));

        return { temperature, humidity, elevation, ridge };
    }

    selectBiomeID(temperature, humidity, elevation, ridge) {
        if (elevation > 0.88 && temperature < 0.66) return 'alpine';
        if (elevation > 0.8) return ridge > 0.58 ? 'alpine' : 'highlands';

        if (temperature < 0.14) return 'tundra';

        if (temperature > 0.72 && humidity < 0.33) {
            if (elevation > 0.66) return 'badlands';
            return 'desert';
        }

        if (elevation > 0.7 && humidity < 0.38) return 'canyon';
        if (elevation > 0.64 && humidity < 0.44) return 'badlands';
        if (elevation > 0.68 && humidity >= 0.38 && temperature > 0.28) return 'highlands';

        if (humidity > 0.78 && temperature > 0.32) return 'swamp';
        if (humidity > 0.62 && temperature > 0.34 && elevation < 0.66) return 'forest';

        if (
            elevation < 0.54
            && humidity > 0.42
            && humidity < 0.7
            && temperature > 0.32
            && temperature < 0.66
        ) {
            return 'meadow';
        }

        return 'plains';
    }

    getBiomeID(x, z) {
        const climate = this.getClimate(x, z);
        return this.selectBiomeID(climate.temperature, climate.humidity, climate.elevation, climate.ridge);
    }

    getBiomeIDForCell(cellX, cellZ) {
        const key = `${cellX}|${cellZ}`;
        const cached = this.biomeCellCache.get(key);
        if (cached) return cached;

        const sampleX = (cellX + 0.5) * this.biomeBlendCellSize;
        const sampleZ = (cellZ + 0.5) * this.biomeBlendCellSize;
        const id = this.getBiomeID(sampleX, sampleZ);

        if (this.biomeCellCache.size > this.maxBiomeCellCacheEntries) {
            this.biomeCellCache.clear();
        }
        this.biomeCellCache.set(key, id);
        return id;
    }

    getBlendedBiomeTerrain(x, z) {
        const cell = this.biomeBlendCellSize;
        const gx = Math.floor(x / cell);
        const gz = Math.floor(z / cell);
        const fx = (x / cell) - gx;
        const fz = (z / cell) - gz;
        const tx = smoothstep(fx);
        const tz = smoothstep(fz);

        const b00 = this.getBiomeData(this.getBiomeIDForCell(gx, gz));
        const b10 = this.getBiomeData(this.getBiomeIDForCell(gx + 1, gz));
        const b01 = this.getBiomeData(this.getBiomeIDForCell(gx, gz + 1));
        const b11 = this.getBiomeData(this.getBiomeIDForCell(gx + 1, gz + 1));

        return {
            mcDepth: bilerp(b00.mcDepth, b10.mcDepth, b01.mcDepth, b11.mcDepth, tx, tz),
            mcScale: bilerp(b00.mcScale, b10.mcScale, b01.mcScale, b11.mcScale, tx, tz),
            ridgeStrength: bilerp(
                b00.ridgeStrength ?? 0,
                b10.ridgeStrength ?? 0,
                b01.ridgeStrength ?? 0,
                b11.ridgeStrength ?? 0,
                tx,
                tz
            ),
            detailStrength: bilerp(
                b00.detailStrength ?? 0.5,
                b10.detailStrength ?? 0.5,
                b01.detailStrength ?? 0.5,
                b11.detailStrength ?? 0.5,
                tx,
                tz
            )
        };
    }

    getDepth(x, z) {
        // Base continental shape around sea level.
        const continental = this.sample2D(this.depthNoise, x, z, 460);
        const erosion = this.sample2D(this.scaleNoise, x + 1700, z - 900, 260);
        return 64 + (continental * 14) + (erosion * 4);
    }

    getTerrainHeight(x, z) {
        const blended = this.getBlendedBiomeTerrain(x, z);
        const baseDepth = this.getDepth(x, z);

        const macro = this.sample2D(this.surfaceNoise, x, z, 180);
        const detail = this.sample2D(this.mainLimit, x - 330, z + 710, 72);
        const ridgeRaw = Math.abs(this.sample2D(this.ridgeNoise, x - 1300, z + 900, 210));
        const ridge = ridgeRaw * ridgeRaw;

        const macroVariation = macro * (18 * blended.mcScale);
        const detailVariation = detail * (6 * blended.detailStrength * Math.max(0.25, blended.mcScale));
        const ridgeBoost = ridge * blended.ridgeStrength * 24;

        const height = baseDepth + blended.mcDepth + macroVariation + detailVariation + ridgeBoost;
        return Math.round(Math.max(-24, Math.min(126, height)));
    }

    getSurface(x, z) {
        // Surface roughness used by cave density damping.
        const sample = this.sample2D(this.surfaceNoise, x + 700, z - 700, 220);
        return 0.8 + ((sample + 1) * 0.5);
    }

    getDensity(x, y, z) {
        // Height-aligned density field with cave carving. Coordinates use world-scaled sampling.
        const terrainHeight = this.getTerrainHeight(x, z);
        const vertical = terrainHeight - y;

        const caveA = this.sample3D(this.minLimit, x, y, z, 54, 46, 54);
        const caveB = this.sample3D(this.maxLimit, x + 811, y - 257, z - 499, 32, 28, 32);
        const caveC = this.sample3D(this.mainLimit, x - 233, y + 91, z + 177, 18, 20, 18);
        const caveSignal = (caveA * 0.55) + (caveB * 0.3) + (caveC * 0.15);

        const caveThreshold = -0.14 + Math.min(0.12, Math.max(-0.06, (y - 24) * 0.002));
        return vertical + ((caveSignal - caveThreshold) * this.getSurface(x, z) * 3.6);
    }
}
