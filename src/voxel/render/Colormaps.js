/**
 * Minecraft-style biome colours. Grass and foliage colours come from the
 * pack's colormap images (textures/colormap/grass.png, foliage.png),
 * looked up by temperature and humidity like in Minecraft, with a few
 * biomes using fixed colours (swamps, badlands, dark forest).
 */
const SIZE = 256;

// terrain temperature -> Minecraft temperature
const TEMP_POINTS = [
  [-0.8, 0],
  [-0.35, 0.25],
  [0, 0.75],
  [0.4, 0.95],
  [0.8, 1],
];

function lerpPoints(v, points) {
  if (v <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (v <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

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
   * `temperature` and `humidity` are terrain climate values (about -1.5..1.5).
   * Minecraft indexes the map with temperature and humidity * temperature.
   */
  sample(map, temperature, humidity) {
    if (!map) return null;
    // Map terrain climate onto Minecraft's scales (plains ~0.8 temperature
    // and 0.4 downfall, snowy ~0, deserts/savannas >= 1).
    const t = Math.min(1, Math.max(0, lerpPoints(temperature, TEMP_POINTS)));
    const h = Math.min(1, Math.max(0, 0.45 + humidity * 0.6)) * t;
    const x = Math.round((1 - t) * (SIZE - 1));
    const y = Math.round((1 - h) * (SIZE - 1));
    const i = (y * SIZE + x) * 4;
    return (map[i] << 16) | (map[i + 1] << 8) | map[i + 2];
  }

  grassColor(biomeId, temperature, humidity, fallback) {
    return (
      GRASS_OVERRIDES[biomeId] ??
      this.sample(this.grass, temperature, humidity) ??
      fallback
    );
  }

  foliageColor(biomeId, temperature, humidity, fallback) {
    return (
      FOLIAGE_OVERRIDES[biomeId] ??
      this.sample(this.foliage, temperature, humidity) ??
      fallback
    );
  }
}
