// ---------------------------------------------------------------------------
// ContinentShaper.js — Pure-function continent mask and terrain height logic.
// Used by both the chunk worker and the main-thread WorldTerrainService so
// height queries always agree with generated geometry.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// World constants (mirrored in chunkWorker for serialisation clarity)
// ---------------------------------------------------------------------------
export const SEA_LEVEL = 1;
export const MIN_TERRAIN_Y = -64;
export const MAX_TERRAIN_Y = 65;

// Terrain zone targets (relative to SEA_LEVEL)
export const OCEAN_FLOOR_OFFSET = -14;
export const BEACH_OFFSET = 1;
export const PLAINS_MAX_OFFSET = 6;
export const HILLS_MAX_OFFSET = 20;
export const MOUNTAIN_MAX_OFFSET = 40;

// Spawn-zone flattening
export const SPAWN_FLAT_RADIUS = 20;
export const SPAWN_BLEND_RADIUS = 30;
export const SPAWN_FLAT_Y = SEA_LEVEL + 1;

// ---------------------------------------------------------------------------
// Internal math helpers (not exported — callers may have their own)
// ---------------------------------------------------------------------------
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// getContinentMask(noise, x, z, seed) → [0, 1]
// ---------------------------------------------------------------------------
// Returns a value in [0, 1].  >0.5 → land, <0.5 → ocean.
// Built from two overlapping low-frequency simplex fields so continent shapes
// are organic.  The seed offsets ensure different layout per world seed.
export function getContinentMask(noise, x, z, seed) {
  // Large-scale base shape (≈1200 blocks per continent)
  const base =
    noise.simplex2D(x * 0.00055 + seed * 0.0001, z * 0.00055 - seed * 0.00007) *
      0.5 +
    0.5;

  // Medium-scale variation (≈400 blocks) — bays and peninsulas
  const detail =
    noise.simplex2D(
      x * 0.0018 - 1730 + seed * 0.00003,
      z * 0.0018 + 890 + seed * 0.00005
    ) *
      0.5 +
    0.5;

  // Blend: 70 % large shape, 30 % coastal detail
  return clamp(base * 0.7 + detail * 0.3, 0, 1);
}

// ---------------------------------------------------------------------------
// getRawTerrainHeight(router, noise, x, z, seed) → integer block height
// ---------------------------------------------------------------------------
// Five-zone continent-driven height formula.
//   continent < 0.35   → ocean floor
//   continent 0.35-0.5 → shallow coast / beach
//   continent 0.5-0.65 → plains
//   continent 0.65-0.82→ hills
//   continent > 0.82   → mountains
//
// The router's fine-detail signal adds variation within each zone.
export function getRawTerrainHeight(router, noise, x, z, seed) {
  const continent = getContinentMask(noise, x, z, seed);
  const routerH = router.getTerrainHeight(x, z) - 63; // centred at 0
  const detailSignal = clamp(routerH / 30, -1, 1);

  let height;

  if (continent < 0.35) {
    const oceanDepth = lerp(OCEAN_FLOOR_OFFSET, -2, continent / 0.35);
    height = SEA_LEVEL + oceanDepth + detailSignal * 3;
  } else if (continent < 0.5) {
    const t = (continent - 0.35) / 0.15;
    const coastBase = lerp(-2, BEACH_OFFSET, smoothstep(t));
    height = SEA_LEVEL + coastBase + detailSignal * 2;
  } else if (continent < 0.65) {
    const t = (continent - 0.5) / 0.15;
    const plainsBase = lerp(BEACH_OFFSET, PLAINS_MAX_OFFSET, smoothstep(t));
    height = SEA_LEVEL + plainsBase + detailSignal * 4;
  } else if (continent < 0.82) {
    const t = (continent - 0.65) / 0.17;
    const hillBase = lerp(PLAINS_MAX_OFFSET, HILLS_MAX_OFFSET, smoothstep(t));
    height = SEA_LEVEL + hillBase + detailSignal * 8;
  } else {
    const t = clamp((continent - 0.82) / 0.18, 0, 1);
    const mountBase = lerp(
      HILLS_MAX_OFFSET,
      MOUNTAIN_MAX_OFFSET,
      smoothstep(t)
    );
    height = SEA_LEVEL + mountBase + detailSignal * 12;
  }

  return clamp(Math.round(height), MIN_TERRAIN_Y, MAX_TERRAIN_Y);
}

// ---------------------------------------------------------------------------
// getColumnHeight(router, noise, x, z, seed) → integer block height
// ---------------------------------------------------------------------------
// Wraps getRawTerrainHeight with a spawn-zone flat guarantee:
//   r ≤ SPAWN_FLAT_RADIUS  → forced flat at SPAWN_FLAT_Y
//   r < SPAWN_BLEND_RADIUS → smooth linear blend to raw height
//   r ≥ SPAWN_BLEND_RADIUS → raw height
export function getColumnHeight(router, noise, x, z, seed) {
  const raw = getRawTerrainHeight(router, noise, x, z, seed);
  const dist = Math.sqrt(x * x + z * z);

  if (dist <= SPAWN_FLAT_RADIUS) {
    return SPAWN_FLAT_Y;
  }
  if (dist < SPAWN_BLEND_RADIUS) {
    const t =
      (dist - SPAWN_FLAT_RADIUS) / (SPAWN_BLEND_RADIUS - SPAWN_FLAT_RADIUS);
    const blended = Math.round(lerp(SPAWN_FLAT_Y, raw, smoothstep(t)));
    return Math.max(blended, SPAWN_FLAT_Y);
  }
  return raw;
}
