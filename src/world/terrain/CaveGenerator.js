// ---------------------------------------------------------------------------
// CaveGenerator.js
// Minecraft-style layered cave generation with cave regions, aquifers,
// biome-aware carving, ravines, and low-cost domain warping.
// Pure functions for worker-side terrain generation.
// ---------------------------------------------------------------------------

const DEEP_MIN_Y = -220;
const SURFACE_SEAL_DEPTH = 3;
const CLIFF_SURFACE_SEAL_DEPTH = 1;
const WATER_LEVEL = 62;

const CaveBiome = Object.freeze({
  DEFAULT: 'default',
  LUSH: 'lush',
  DRIPSTONE: 'dripstone',
  DEEP_DARK: 'deep_dark',
  ICE: 'ice',
  MUSHROOM: 'mushroom',
});

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function saturate(v) {
  return clamp(v, 0, 1);
}

function smoothstep(edge0, edge1, x) {
  const t = saturate((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

function abs(v) {
  return v < 0 ? -v : v;
}

function sqr(v) {
  return v * v;
}

// ---------------------------------------------------------------------------
// Region sampling
// Large, low-frequency fields control where cave styles cluster.
// ---------------------------------------------------------------------------
function sampleCaveRegion(noise, wx, wz) {
  return noise.simplex2D(wx * 0.0032 + 1200.5, wz * 0.0032 - 810.25);
}

function sampleHumidityRegion(noise, wx, wz) {
  return noise.simplex2D(wx * 0.0041 - 913.7, wz * 0.0041 + 447.2);
}

function sampleTemperatureRegion(noise, wx, wz) {
  return noise.simplex2D(wx * 0.0038 + 622.1, wz * 0.0038 - 1551.4);
}

function sampleSurfaceEntranceAllowance(noise, wx, wz, terrainH) {
  const sx = noise.simplex2D((wx + 1) * 0.02, wz * 0.02);
  const sz = noise.simplex2D(wx * 0.02, (wz + 1) * 0.02);
  const slope = abs(sx - terrainH * 0.01) + abs(sz - terrainH * 0.01);

  const cliffMask = noise.simplex2D(wx * 0.01 + 301, wz * 0.01 - 771);
  return slope > 0.3 || cliffMask > 0.48;
}

// ---------------------------------------------------------------------------
// Cheap domain warp
// Reused by all cave families so shapes feel connected instead of independent.
// ---------------------------------------------------------------------------
function sampleWarp(noise, wx, wy, wz) {
  const warpAmpXZ = 10;
  const warpAmpY = 6;

  return {
    x:
      wx +
      noise.simplex3D(wx * 0.010 + 71.13, wy * 0.010, wz * 0.010) * warpAmpXZ,
    y:
      wy +
      noise.simplex3D(wx * 0.010 - 19.8, wy * 0.010 + 33.1, wz * 0.010) * warpAmpY,
    z:
      wz +
      noise.simplex3D(wx * 0.010, wy * 0.010 + 43.77, wz * 0.010 - 12.2) * warpAmpXZ,
  };
}

// ---------------------------------------------------------------------------
// Cave family samplers
// ---------------------------------------------------------------------------
function sampleWormCaves(noise, x, y, z, depthFactor, regionStrength) {
  const threshold = 0.072 + depthFactor * 0.032 + regionStrength * 0.01;

  const n1 = noise.simplex3D(x * 0.045, y * 0.060, z * 0.045);
  const n2 = noise.simplex3D(x * 0.045 + 31.7, y * 0.060 - 9.3, z * 0.045 + 4.1);
  const n3 = noise.simplex3D(x * 0.051 - 17.4, y * 0.056 + 22.8, z * 0.051 - 8.6);

  const a1 = abs(n1);
  const a2 = abs(n2);
  const a3 = abs(n3);

  return (
    (a1 < threshold && a2 < threshold) ||
    (a1 < threshold && a3 < threshold) ||
    (a2 < threshold && a3 < threshold)
  );
}

function sampleSpaghettiCaves(noise, x, y, z, region, depthFactor) {
  const regionMask = noise.simplex3D(x * 0.018 + 403.2, y * 0.012 - 93.4, z * 0.018 - 201.5);
  const neededMask = 0.06 - Math.max(0, region) * 0.04;
  if (regionMask < neededMask) return false;

  const lineA = abs(noise.simplex3D(x * 0.066, y * 0.028, z * 0.066));
  const lineB = abs(noise.simplex3D(x * 0.062 + 55.1, y * 0.030 - 14.2, z * 0.062 + 81.4));
  const threshold = 0.028 + depthFactor * 0.004;

  return lineA < threshold || lineB < threshold * 0.92;
}

function sampleCheeseCaves(noise, x, y, z, depthFactor, region, biomeBias) {
  const cheese = noise.simplex3D(x * 0.012, y * 0.008, z * 0.012);
  const broad = noise.simplex3D(x * 0.008 + 144.2, y * 0.006 - 29.4, z * 0.008 + 212.7);

  const threshold =
    0.73 - depthFactor * 0.10 - Math.max(0, region) * 0.08 - biomeBias * 0.05;

  return cheese > threshold && broad > -0.2;
}

function sampleCathedralCaves(noise, x, y, z, depthFactor, region) {
  if (depthFactor < 0.45 || region < 0.38) return false;

  const huge = noise.simplex3D(x * 0.0065 + 800.4, y * 0.0052 - 151.3, z * 0.0065 + 370.6);
  const body = noise.simplex3D(x * 0.010 + 210.7, y * 0.0065 - 91.1, z * 0.010 - 76.8);

  return huge > 0.72 && body > 0.1;
}

function sampleRavines(noise, wx, wy, wz, terrainH, depthBelowSurface) {
  if (wy >= terrainH - 8 || depthBelowSurface < 12) return false;

  const line = abs(noise.simplex2D(wx * 0.0075 + 901.4, wz * 0.0075 - 502.8));
  if (line > 0.032) return false;

  const floor = noise.simplex2D(wx * 0.010 + 200.5, wz * 0.010 - 199.8) * 22 - 46;
  const center = floor + 10;
  const dy = wy - center;
  const halfHeight = 22;
  const yShape = 1 - abs(dy / halfHeight);
  if (yShape <= 0) return false;

  const width = 3.5 + yShape * 9.5;
  const cross = abs(noise.simplex2D(wx * 0.021 + 77.3, wz * 0.021 - 90.9)) * 18;
  return cross < width;
}

function sampleAquifer(noise, wx, wy, wz, region, temperature) {
  const levelBase = -18 + noise.simplex2D(wx * 0.010 + 711.9, wz * 0.010 - 103.2) * 13;
  const pressure = noise.simplex3D(wx * 0.015 - 91.2, wy * 0.015 + 41.5, wz * 0.015 + 16.7);
  const level = levelBase + Math.max(0, region) * 5;

  if (wy > level) return null;
  if (pressure < -0.12) return null;

  if (wy < -90) return 'lava';
  if (temperature < -0.35 && wy < WATER_LEVEL - 10) return 'ice_water';
  return 'water';
}

function sampleVerticality(noise, wx, wz) {
  return noise.simplex2D(wx * 0.006 + 1511.1, wz * 0.006 - 733.4);
}

// ---------------------------------------------------------------------------
// Cave biome classification
// Returns a biome label that also lines up with the cave geometry.
// ---------------------------------------------------------------------------
export function getCaveBiome(noise, wx, wy, wz, terrainH, seed = 0) {
  const depthBelowSurface = terrainH - wy;
  const depthFactor = saturate(depthBelowSurface / 90);
  const region = sampleCaveRegion(noise, wx, wz);
  const humidity = sampleHumidityRegion(noise, wx, wz);
  const temperature = sampleTemperatureRegion(noise, wx, wz);
  const verticality = sampleVerticality(noise, wx, wz);

  if (wy < -42) {
    const darkMask = noise.simplex2D(wx * 0.008 + 4701.2, wz * 0.008 - 812.9);
    if (darkMask > -0.08 && region > -0.25) return CaveBiome.DEEP_DARK;
  }

  if (temperature < -0.48) {
    const iceMask = noise.simplex2D(wx * 0.008 + 5531, wz * 0.008 - 3317);
    if (iceMask > 0.18) return CaveBiome.ICE;
  }

  if ((wy < -12 || depthBelowSurface > 56) && humidity < 0.18) {
    const dripField = noise.simplex2D(wx * 0.012 - 2741, wz * 0.012 + 1897);
    if (dripField > -0.22 || verticality > 0.38) return CaveBiome.DRIPSTONE;
  }

  if (depthBelowSurface >= 8 && depthBelowSurface <= 56) {
    const lushField = noise.simplex2D(wx * 0.010 + 7193, wz * 0.010 - 4421);
    if (humidity > 0.2 && temperature > -0.15 && lushField > 0.08) {
      return CaveBiome.LUSH;
    }
    if (humidity > -0.05 && lushField < -0.30) {
      return CaveBiome.MUSHROOM;
    }
  }

  return CaveBiome.DEFAULT;
}

// ---------------------------------------------------------------------------
// isCave(...)
// Fast boolean path for generators that only need carve / no-carve.
// ---------------------------------------------------------------------------
export function isCave(noise, wx, wy, wz, terrainH, cavesEnabled) {
  return getCaveCell(noise, wx, wy, wz, terrainH, cavesEnabled).carve;
}

// ---------------------------------------------------------------------------
// getCaveCell(...)
// Full evaluation path. Returns carve decision, biome, fluid, and shape tags.
// Use this instead of calling isCave() + getCaveBiome() separately if you want
// fewer repeated noise samples.
// ---------------------------------------------------------------------------
export function getCaveCell(noise, wx, wy, wz, terrainH, cavesEnabled, seed = 0) {
  if (!cavesEnabled) {
    return {
      carve: false,
      biome: CaveBiome.DEFAULT,
      fluid: null,
      family: null,
      depthFactor: 0,
    };
  }

  if (wy <= DEEP_MIN_Y + 2) {
    return {
      carve: false,
      biome: CaveBiome.DEFAULT,
      fluid: null,
      family: null,
      depthFactor: 0,
    };
  }

  const depthBelowSurface = terrainH - wy;
  if (depthBelowSurface <= 0) {
    return {
      carve: false,
      biome: CaveBiome.DEFAULT,
      fluid: null,
      family: null,
      depthFactor: 0,
    };
  }

  const allowEntrance = sampleSurfaceEntranceAllowance(noise, wx, wz, terrainH);
  const sealDepth = allowEntrance ? CLIFF_SURFACE_SEAL_DEPTH : SURFACE_SEAL_DEPTH;
  if (wy >= terrainH - sealDepth) {
    return {
      carve: false,
      biome: CaveBiome.DEFAULT,
      fluid: null,
      family: null,
      depthFactor: 0,
    };
  }

  const depthFactor = saturate(depthBelowSurface / 90);
  const region = sampleCaveRegion(noise, wx, wz);
  const humidity = sampleHumidityRegion(noise, wx, wz);
  const temperature = sampleTemperatureRegion(noise, wx, wz);
  const warp = sampleWarp(noise, wx, wy, wz);

  const biomeHint =
    humidity > 0.25 && temperature > -0.1 ? 1 :
    humidity < -0.25 ? -0.5 :
    0;

  const worm = sampleWormCaves(noise, warp.x, warp.y, warp.z, depthFactor, Math.max(0, region));
  const spaghetti = sampleSpaghettiCaves(noise, warp.x, warp.y, warp.z, region, depthFactor);
  const cheese = sampleCheeseCaves(noise, warp.x, warp.y, warp.z, depthFactor, region, biomeHint);
  const cathedral = sampleCathedralCaves(noise, warp.x, warp.y, warp.z, depthFactor, region);
  const ravine = sampleRavines(noise, wx, wy, wz, terrainH, depthBelowSurface);

  const carve = worm || spaghetti || cheese || cathedral || ravine;
  if (!carve) {
    return {
      carve: false,
      biome: CaveBiome.DEFAULT,
      fluid: null,
      family: null,
      depthFactor,
    };
  }

  let family = 'worm';
  if (ravine) family = 'ravine';
  else if (cathedral) family = 'cathedral';
  else if (cheese) family = 'cheese';
  else if (spaghetti) family = 'spaghetti';

  const biome = getCaveBiome(noise, wx, wy, wz, terrainH, seed);
  const fluid = sampleAquifer(noise, wx, wy, wz, region, temperature);

  return {
    carve: true,
    biome,
    fluid,
    family,
    depthFactor,
  };
}

// ---------------------------------------------------------------------------
// Optional helper for generators that want block recommendations.
// This keeps biome decoration rules near cave logic without forcing them.
// ---------------------------------------------------------------------------
export function getCaveMaterialProfile(noise, wx, wy, wz, terrainH, cavesEnabled, seed = 0) {
  const cell = getCaveCell(noise, wx, wy, wz, terrainH, cavesEnabled, seed);
  if (!cell.carve) return null;

  switch (cell.biome) {
    case CaveBiome.LUSH:
      return {
        biome: cell.biome,
        floor: 'moss_block',
        ceiling: 'stone',
        wall: 'stone',
        filler: 'clay',
        vegetationChance: 0.18,
        waterChance: cell.fluid === 'water' ? 1.0 : 0.35,
      };

    case CaveBiome.DRIPSTONE:
      return {
        biome: cell.biome,
        floor: 'stone',
        ceiling: 'stone',
        wall: 'stone',
        filler: 'dripstone_block',
        stalagmiteChance: 0.16,
        stalactiteChance: 0.21,
        waterChance: 0.08,
      };

    case CaveBiome.DEEP_DARK:
      return {
        biome: cell.biome,
        floor: 'deepslate',
        ceiling: 'deepslate',
        wall: 'deepslate',
        filler: 'sculk',
        sculkChance: 0.22,
        waterChance: 0.03,
      };

    case CaveBiome.ICE:
      return {
        biome: cell.biome,
        floor: 'packed_ice',
        ceiling: 'ice',
        wall: 'stone',
        filler: 'snow_block',
        icicleChance: 0.18,
        waterChance: cell.fluid === 'ice_water' ? 1.0 : 0.12,
      };

    case CaveBiome.MUSHROOM:
      return {
        biome: cell.biome,
        floor: 'mycelium',
        ceiling: 'stone',
        wall: 'stone',
        filler: 'mushroom_stem',
        mushroomChance: 0.15,
        waterChance: 0.10,
      };

    default:
      return {
        biome: cell.biome,
        floor: wy < -40 ? 'deepslate' : 'stone',
        ceiling: wy < -40 ? 'deepslate' : 'stone',
        wall: wy < -40 ? 'deepslate' : 'stone',
        filler: 'stone',
        waterChance: cell.fluid === 'water' ? 1.0 : 0.05,
      };
  }
}
