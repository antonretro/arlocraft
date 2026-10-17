/**
 * Terrain v2: height, climate and biome for any column. Pure and
 * deterministic per seed; shared by the chunk generator (worker) and the
 * main thread (physics, spawning, structures, minimap) so both always agree.
 *
 * Shape comes from three large noise fields, loosely modelled on Minecraft:
 *   continentalness - ocean ... coast ... inland
 *   erosion         - low erosion = rugged mountains, high = flat plains
 *   peaks           - ridged noise that forms mountain ranges
 * plus small-scale hills and river valleys that cut down to water level.
 */
import { Noise } from '../../world/Noise.js';
import { BIOME_BY_ID } from '../../data/biomes.js';

export const SEA_LEVEL = 1;
export const MIN_Y = -64;
export const MAX_Y = 160;

const SPAWN_FLAT_RADIUS = 20;
const SPAWN_BLEND_RADIUS = 34;
const RIVER_WIDTH = 0.04;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fbm(noise, x, z, octaves) {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise.simplex2D(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

export class TerrainSampler {
  constructor(seedString) {
    const seed = String(seedString);
    this.continent = new Noise(`${seed}:continent`);
    this.erosion = new Noise(`${seed}:erosion`);
    this.peaks = new Noise(`${seed}:peaks`);
    this.hills = new Noise(`${seed}:hills`);
    this.river = new Noise(`${seed}:river`);
    this.temperature = new Noise(`${seed}:temperature`);
    this.humidity = new Noise(`${seed}:humidity`);
    this.weird = new Noise(`${seed}:weird`);
  }

  /** Raw shape fields for a column (no spawn flattening). */
  sampleShape(x, z) {
    const c = fbm(this.continent, x / 1100, z / 1100, 3) + 0.12;
    const e = fbm(this.erosion, x / 700, z / 700, 2);
    const pv = 1 - Math.abs(fbm(this.peaks, x / 320, z / 320, 3));
    const hills = fbm(this.hills, x / 70, z / 70, 3);
    const riverRaw = Math.abs(fbm(this.river, x / 780, z / 780, 2));
    return { c, e, pv, hills, riverRaw };
  }

  heightFromShape({ c, e, pv, hills, riverRaw }) {
    // Base elevation from continentalness.
    let base;
    if (c < -0.45) base = lerp(-34, -18, (c + 1) / 0.55);
    else if (c < -0.15) base = lerp(-18, -4, (c + 0.45) / 0.3);
    else if (c < 0.02) base = lerp(-4, 2, (c + 0.15) / 0.17);
    else base = lerp(2, 20, smoothstep((c - 0.02) / 0.6));

    const inland = smoothstep((c - 0.02) / 0.35);
    // Low erosion inland grows mountain ranges along the ridges.
    const rugged = smoothstep((0.15 - e) / 0.65) * inland;
    const ridge = Math.pow(clamp(pv, 0, 1), 2.2);
    const mountains = ridge * 105 * rugged;
    // Rolling hills, flatter where erosion is high.
    const hillAmp = lerp(9, 3, smoothstep((e + 0.6) / 1.2)) * inland + 1.5;
    let h = SEA_LEVEL + base + mountains + hills * hillAmp;

    // Rivers carve down to just below sea level on land.
    if (c > -0.12 && riverRaw < RIVER_WIDTH) {
      const t = smoothstep(1 - riverRaw / RIVER_WIDTH);
      const bed = SEA_LEVEL - 3;
      // Mountains keep a gorge instead of being flattened completely.
      h = lerp(h, Math.min(h, bed + mountains * 0.35), t);
    }
    return h;
  }

  /** Terrain surface height (integer) of a column. */
  height(x, z) {
    return this.heightWithSpawn(
      this.heightFromShape(this.sampleShape(x, z)),
      x,
      z
    );
  }

  heightWithSpawn(h, x, z) {
    const dist = Math.sqrt(x * x + z * z);
    if (dist < SPAWN_BLEND_RADIUS) {
      const spawnY = SEA_LEVEL + 2;
      const t = smoothstep(
        (dist - SPAWN_FLAT_RADIUS) / (SPAWN_BLEND_RADIUS - SPAWN_FLAT_RADIUS)
      );
      h = lerp(spawnY, Math.max(h, spawnY), t);
    }
    return clamp(Math.round(h), MIN_Y + 4, MAX_Y);
  }

  /** River strength 0..1 at a column (1 = river centre). */
  riverAt(x, z) {
    const { c, riverRaw } = this.sampleShape(x, z);
    if (c <= -0.12 || riverRaw >= RIVER_WIDTH) return 0;
    return 1 - riverRaw / RIVER_WIDTH;
  }

  climate(x, z, h) {
    const altitude = Math.max(0, h - SEA_LEVEL);
    return {
      // Cools with altitude so tall mountains get snow caps.
      temperature:
        fbm(this.temperature, x / 1300, z / 1300, 3) * 1.5 +
        0.1 -
        altitude / 130,
      humidity: fbm(this.humidity, x / 1000, z / 1000, 3) * 1.4,
      weird: fbm(this.weird, x / 400, z / 400, 2),
    };
  }

  /** Height, biome id and river strength for a column in one pass. */
  column(x, z) {
    const shape = this.sampleShape(x, z);
    const h = this.heightWithSpawn(this.heightFromShape(shape), x, z);
    const river =
      shape.c > -0.12 && shape.riverRaw < RIVER_WIDTH
        ? 1 - shape.riverRaw / RIVER_WIDTH
        : 0;
    return {
      h,
      biomeId: this.biomeId(x, z, h, shape),
      river,
      erosion: shape.e,
    };
  }

  /** Biome id for a column of height `h`. */
  biomeId(x, z, h = this.height(x, z), shape = this.sampleShape(x, z)) {
    const { temperature: t, humidity: m, weird: w } = this.climate(x, z, h);

    if (h < SEA_LEVEL - 1) {
      if (shape.c > -0.12 && shape.riverRaw < RIVER_WIDTH * 0.85) {
        return t < -0.5 ? 'frozen_ocean' : 'river';
      }
      if (t < -0.5) return 'frozen_ocean';
      if (t > 0.45) return 'warm_ocean';
      return 'ocean';
    }

    if (h <= SEA_LEVEL + 2 && shape.c < 0.03) {
      if (t < -0.5) return 'snowy_plains';
      if (shape.e < -0.35) return 'stony_shore';
      if (m > 0.45 && t > 0.2) return 'mangrove_swamp';
      return 'beach';
    }

    const elevation = h - SEA_LEVEL;
    if (elevation > 85) return t < 0.05 ? 'snowy_peaks' : 'stony_peaks';
    if (elevation > 52) {
      if (t < -0.25) return 'snowy_slopes';
      if (t < 0 && m > 0.1) return 'grove';
      if (w > 0.35 && t > 0) return 'cherry_grove';
      return 'windswept_hills';
    }

    // Cold
    if (t < -0.5) {
      if (w > 0.55 && m < 0) return 'ice_spikes';
      return m > 0.15 ? 'snowy_taiga' : 'snowy_plains';
    }
    if (t < -0.2) return m > -0.1 ? 'taiga' : 'plains';

    // Hot
    if (t > 0.4) {
      if (m < -0.25) return shape.e < -0.1 ? 'badlands' : 'desert';
      if (m < 0.05) return 'savanna';
      if (m > 0.4) return 'jungle';
      return 'sparse_jungle';
    }

    // Temperate
    if (m > 0.5 && elevation < 6) return t > 0.25 ? 'mangrove_swamp' : 'swamp';
    if (m > 0.45) return 'dark_forest';
    if (m > 0.15) return w > 0.45 ? 'flower_forest' : 'forest';
    if (m > -0.05) return w < -0.4 ? 'cherry_grove' : 'birch_forest';
    if (m < -0.4 && w > 0.3) return 'sunflower_plains';
    return w > 0.5 ? 'meadow' : 'plains';
  }

  biome(x, z, h) {
    return BIOME_BY_ID.get(this.biomeId(x, z, h)) ?? BIOME_BY_ID.get('plains');
  }
}

const samplers = new Map();

/** Shared sampler per seed (Noise tables are cheap but not free). */
export function getTerrainSampler(seedString) {
  const key = String(seedString);
  let sampler = samplers.get(key);
  if (!sampler) {
    if (samplers.size > 4) samplers.clear();
    sampler = new TerrainSampler(key);
    samplers.set(key, sampler);
  }
  return sampler;
}
