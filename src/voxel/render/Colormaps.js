/**
 * Minecraft-style biome colours. Grass and foliage colours come from the
 * pack's colormap images (textures/colormap/grass.png, foliage.png),
 * looked up by each biome's temperature and downfall like in Minecraft, with a few
 * biomes using fixed colours (swamps, badlands, dark forest).
 */
const SIZE = 256;

// Minecraft's temperature and downfall for each biome. The colour maps are
// indexed by these, not by raw terrain climate, so a biome always gets its
// familiar colour and borders blend through the 4-block lattice.
const BIOME_CLIMATE = {
  plains: [0.8, 0.4],
  sunflower_plains: [0.8, 0.4],
  meadow: [0.5, 0.8],
  forest: [0.7, 0.8],
  flower_forest: [0.7, 0.8],
  birch_forest: [0.6, 0.6],
  dark_forest: [0.7, 0.8],
  lush_grove: [0.75, 0.85],
  taiga: [0.25, 0.8],
  snowy_taiga: [-0.5, 0.4],
  snowy_plains: [0, 0.5],
  ice_spikes: [0, 0.5],
  snow: [0, 0.5],
  tundra: [0.05, 0.3],
  grove: [-0.2, 0.8],
  snowy_slopes: [-0.3, 0.9],
  snowy_peaks: [-0.7, 0.9],
  void_peaks: [-0.7, 0.9],
  alpine: [0.1, 0.5],
  stony_peaks: [1, 0.3],
  highlands: [0.4, 0.5],
  windswept_hills: [0.2, 0.3],
  desert: [2, 0],
  savanna: [2, 0],
  badlands: [2, 0],
  canyon: [2, 0],
  jungle: [0.95, 0.9],
  sparse_jungle: [0.95, 0.8],
  swamp: [0.8, 0.9],
  mangrove_swamp: [0.8, 0.9],
  cherry_grove: [0.5, 0.8],
  beach: [0.8, 0.4],
  stony_shore: [0.2, 0.3],
  river: [0.5, 0.5],
  ocean: [0.5, 0.5],
  warm_ocean: [0.5, 0.5],
  frozen_ocean: [0, 0.5],
};
const DEFAULT_CLIMATE = [0.8, 0.4];

// Minecraft's fixed leaf colours for trees that ignore the biome.
export const FIXED_FOLIAGE = {
  spruce_leaves: 0x619961,
  birch_leaves: 0x80a755,
};

const GRASS_OVERRIDES = {
  swamp: 0x6a7039,
  mangrove_swamp: 0x6a7039,
  badlands: 0x90814d,
  dark_forest: 0x507a32,
  cherry_grove: 0xb6db61,
};
const FOLIAGE_OVERRIDES = {
  swamp: 0x6a7039,
  mangrove_swamp: 0x8db127,
  badlands: 0x9e814d,
};

function loadImageData(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      resolve(ctx.getImageData(0, 0, SIZE, SIZE).data);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export class Colormaps {
  constructor(baseAssetPath) {
    const dir = `${baseAssetPath}resource_pack/assets/minecraft/textures/colormap/`;
    this.grass = null;
    this.foliage = null;
    this.ready = Promise.all([
      loadImageData(`${dir}grass.png`),
      loadImageData(`${dir}foliage.png`),
    ]).then(([grass, foliage]) => {
      this.grass = grass;
      this.foliage = foliage;
    });
  }

  get loaded() {
    return Boolean(this.grass && this.foliage);
  }

  /**
   * Looks up a colour map with Minecraft's biome temperature and downfall.
   * Like Minecraft, temperature drops a little with height above y=16.
   */
  sample(map, biomeId, y = 0) {
    if (!map) return null;
    const [temperature, downfall] = BIOME_CLIMATE[biomeId] ?? DEFAULT_CLIMATE;
    const cooled = temperature - Math.max(0, y - 16) * 0.0016;
    const t = Math.min(1, Math.max(0, cooled));
    const h = Math.min(1, Math.max(0, downfall)) * t;
    const x = Math.round((1 - t) * (SIZE - 1));
    const row = Math.round((1 - h) * (SIZE - 1));
    const i = (row * SIZE + x) * 4;
    return (map[i] << 16) | (map[i + 1] << 8) | map[i + 2];
  }

  grassColor(biomeId, y, fallback) {
    return (
      GRASS_OVERRIDES[biomeId] ??
      this.sample(this.grass, biomeId, y) ??
      fallback
    );
  }

  foliageColor(biomeId, y, fallback) {
    return (
      FOLIAGE_OVERRIDES[biomeId] ??
      this.sample(this.foliage, biomeId, y) ??
      fallback
    );
  }
}
