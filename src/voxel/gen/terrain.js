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
// River shape in units of the (warped) river noise: the water channel sits
// inside a wider valley whose floor slopes gently up to the surrounding land.
const RIVER_CHANNEL = 0.02;
const RIVER_VALLEY = 0.13;

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
    // Ridged noise for mountain ranges plus a craggy detail layer that only
    // shows near the summits (foothills stay smooth, like eroded rock).
    const p = fbm(this.peaks, x / 340, z / 340, 2);
    const detail = this.peaks.simplex2D(x / 72 + 31.7, z / 72 - 18.3);
    const spur = this.peaks.simplex2D(x / 150 - 71.3, z / 150 + 12.9);
    const hills = fbm(this.hills, x / 120, z / 120, 2);
    const hillsFine = this.hills.simplex2D(x / 38 + 9.1, z / 38 - 4.7);
    // Domain-warped river noise makes rivers meander instead of following
    // the smooth contour lines of a single noise field.
    const wx = x + this.river.simplex2D(x / 260 + 50.3, z / 260) * 70;
    const wz = z + this.river.simplex2D(x / 260, z / 260 - 70.1) * 70;
    const riverRaw = Math.abs(fbm(this.river, wx / 820, wz / 820, 2));
    return { c, e, p, detail, spur, hills, hillsFine, riverRaw };
  }

  heightFromShape(shape) {
    const { c, e, p, detail, hills, hillsFine, riverRaw } = shape;
    // Base elevation from continentalness, with a gentle shelf at the coast
    // so shores become wide beaches instead of steps.
    let base;
    if (c < -0.45) base = lerp(-34, -18, (c + 1) / 0.55);
    else if (c < -0.16) base = lerp(-18, -5, (c + 0.45) / 0.29);
    else if (c < 0.04) base = lerp(-5, 2, smoothstep((c + 0.16) / 0.2));
    else base = 2 + 18 * smoothstep((c - 0.04) / 0.6);

    const inland = smoothstep((c - 0.03) / 0.3);
    // Low erosion inland grows mountain ranges along the ridges. The
    // profile is concave (gentle foothills, steep summits), and ridged
    // detail noise carves spurs and gullies into the upper slopes so peaks
    // read as eroded rock rather than smooth domes.
    const rugged = smoothstep((0.12 - e) / 0.6) * inland;
    let mountains = 0;
    if (rugged > 0) {
      const base = smoothstep((1 - Math.abs(p) - 0.25) / 0.75);
      const spurs = 1 - Math.abs(shape.spur);
      const crags = 1 - Math.abs(detail);
      mountains =
        rugged *
        (Math.pow(base, 2.2) * 80 +
          base * base * spurs * spurs * 26 +
          Math.pow(base, 3) * crags * 18);
    }
    // Rolling hills; high erosion flattens them into calm plains.
    const flat = smoothstep((e + 0.4) / 0.9);
    const hillAmp = lerp(6.5, 2, flat) * inland + 1;
    let h = SEA_LEVEL + base + mountains + (hills + hillsFine * 0.22) * hillAmp;
    shape.mountains = mountains;

    // Rivers: a channel below sea level inside a valley that slopes up to
    // the land around it. In mountains the same profile becomes a gorge.
    const fade = smoothstep((c + 0.16) / 0.12);
    if (fade > 0 && riverRaw < RIVER_VALLEY) {
      let target;
      if (riverRaw < RIVER_CHANNEL) {
        target = SEA_LEVEL - 1.6 - 2.4 * (1 - riverRaw / RIVER_CHANNEL);
      } else {
        const t = smoothstep(
          (riverRaw - RIVER_CHANNEL) / (RIVER_VALLEY - RIVER_CHANNEL)
        );
        target = lerp(SEA_LEVEL + 0.6, h, Math.pow(t, 1.3));
      }
      h = Math.min(h, lerp(h, target, fade));
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

  riverStrength(shape) {
    if (shape.c <= -0.16 || shape.riverRaw >= RIVER_CHANNEL * 1.6) return 0;
    return 1 - shape.riverRaw / (RIVER_CHANNEL * 1.6);
  }

  /** River strength 0..1 at a column (1 = river centre). */
  riverAt(x, z) {
    return this.riverStrength(this.sampleShape(x, z));
  }

  climate(x, z, h, shape = null) {
    const altitude = Math.max(0, h - SEA_LEVEL);
    // Jitter the climate lookup a little so biome borders wander naturally
    // instead of tracing smooth noise contours.
    if (shape) {
      x += shape.hillsFine * 12;
      z += shape.detail * 12;
    }
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

  /**
   * Everything the chunk generator needs for a column in one pass:
   * height, biome id, river strength and the raw shape fields.
   */
  column(x, z) {
    const shape = this.sampleShape(x, z);
    const h = this.heightWithSpawn(this.heightFromShape(shape), x, z);
    return {
      h,
      biomeId: this.biomeId(x, z, h, shape),
      river: this.riverStrength(shape),
      erosion: shape.e,
      mountains: shape.mountains,
      shape,
    };
  }

  /** Biome id for a column of height `h`. */
  biomeId(x, z, h, shape = this.sampleShape(x, z)) {
    if (h === undefined) {
      h = this.heightWithSpawn(this.heightFromShape(shape), x, z);
    }
    const {
      temperature: t,
      humidity: m,
      weird: w,
    } = this.climate(x, z, h, shape);

    if (h < SEA_LEVEL - 1) {
      if (shape.c > -0.16 && shape.riverRaw < RIVER_CHANNEL * 1.4) {
        return t < -0.5 ? 'frozen_ocean' : 'river';
      }
      if (t < -0.5) return 'frozen_ocean';
      if (t > 0.45) return 'warm_ocean';
      return 'ocean';
    }

    if (h <= SEA_LEVEL + 1 && shape.c < 0.06) {
      if (t < -0.5) return 'snowy_plains';
      if (shape.e < -0.35) return 'stony_shore';
      if (m > 0.45 && t > 0.2) return 'mangrove_swamp';
      return 'beach';
    }

    // Jittered altitude bands so mountain biomes do not follow contours.
    const elevation = h - SEA_LEVEL + shape.detail * 5;
    if (elevation > 88) return t < 0.05 ? 'snowy_peaks' : 'stony_peaks';
    if (elevation > 55) {
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

  biome(x, z, h, shape) {
    return (
      BIOME_BY_ID.get(this.biomeId(x, z, h, shape)) ?? BIOME_BY_ID.get('plains')
    );
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
