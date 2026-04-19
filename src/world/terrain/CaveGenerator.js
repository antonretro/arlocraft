// ---------------------------------------------------------------------------
// CaveGenerator.js — Worm-cave carving with biome classification.
// Pure functions; called by chunkWorker during chunk generation.
// ---------------------------------------------------------------------------

const DEEP_MIN_Y = -220;

// ---------------------------------------------------------------------------
// getCaveBiome(noise, wx, wy, wz, terrainH, seed) → string
// ---------------------------------------------------------------------------
// Classifies a carved cave voxel into one of several cave biomes.
// The noise offsets are large enough that each field is independent of the
// carving fields used in isCave(), avoiding correlation artefacts.
//
//   'dripstone'  — deep (wy < terrainH - 60  OR  wy < -10), rocky drip caves
//   'lush'       — mid-depth (surface - 10 to surface - 50), mossy & green
//   'deep_dark'  — very deep (wy < -40), deepslate & obsidian
//   'ice'        — cold noise region at any depth
//   'mushroom'   — mid-depth alternate, fungal
//   'default'    — everything else (plain stone caves)
// ---------------------------------------------------------------------------
export function getCaveBiome(noise, wx, wy, wz, terrainH, seed) {
    const depthBelowSurface = terrainH - wy;

    // Very deep → deep_dark always wins
    if (wy < -40) return 'deep_dark';

    // Ice biome — driven by a 2D noise field offset far from terrain noise
    const iceField = noise.simplex2D(wx * 0.008 + 5531, wz * 0.008 - 3317);
    if (iceField > 0.55) return 'ice';

    // Deep dripstone — absolute depth OR far below surface
    if (wy < -10 || depthBelowSurface > 60) {
        const dripField = noise.simplex2D(wx * 0.012 - 2741, wz * 0.012 + 1897);
        if (dripField > -0.3) return 'dripstone';
    }

    // Mid-depth zone: lush vs mushroom decided by noise
    if (depthBelowSurface >= 10 && depthBelowSurface <= 50) {
        const biomeField = noise.simplex2D(wx * 0.01 + 7193, wz * 0.01 - 4421);
        if (biomeField > 0.2)  return 'lush';
        if (biomeField < -0.3) return 'mushroom';
    }

    return 'default';
}

// ---------------------------------------------------------------------------
// isCave(noise, wx, wy, wz, terrainH, cavesEnabled) → boolean
// ---------------------------------------------------------------------------
// Three overlapping worm fields give naturalistic branching.
//
// Tunnel width scales with depth:
//   shallow  → narrow tubes (threshold 0.09)
//   deep     → wider tubes (threshold 0.14)
//
// Spaghetti corridors: one field alone very near zero → hair-thin passages.
// Chamber pockets:     two fields both near zero together → spherical voids.
// ---------------------------------------------------------------------------
export function isCave(noise, wx, wy, wz, terrainH, cavesEnabled) {
    if (!cavesEnabled) return false;
    // Nothing carved near or above the surface
    if (wy >= terrainH - 3) return false;
    // Nothing at the absolute world bottom
    if (wy <= DEEP_MIN_Y + 2) return false;

    // Depth factor 0 (surface) → 1 (deep) used for width scaling
    const depthFactor = Math.max(0, Math.min(1, (terrainH - wy) / 60));

    // Base tunnel half-width: thin at shallow depth, wider deeper
    const wormThreshold = 0.09 + depthFactor * 0.05; // 0.09 … 0.14

    // Three simplex fields with distinct offsets and slightly different scales
    // so each "worm" travels in a different direction.
    const n1 = noise.simplex3D(wx * 0.048,        wy * 0.065,        wz * 0.048);
    const n2 = noise.simplex3D(wx * 0.048 + 31.7, wy * 0.065 - 9.3,  wz * 0.048 + 4.1);
    const n3 = noise.simplex3D(wx * 0.052 - 17.4, wy * 0.060 + 22.8, wz * 0.052 - 8.6);

    const a1 = Math.abs(n1);
    const a2 = Math.abs(n2);
    const a3 = Math.abs(n3);

    // ── Worm tunnels ─────────────────────────────────────────────────────────
    // Tunnel forms where ANY two of the three fields are both near zero.
    const tube12 = a1 < wormThreshold && a2 < wormThreshold;
    const tube13 = a1 < wormThreshold && a3 < wormThreshold;
    const tube23 = a2 < wormThreshold && a3 < wormThreshold;
    if (tube12 || tube13 || tube23) return true;

    // ── Spaghetti corridors ──────────────────────────────────────────────────
    // Very thin passage: a single field extremely close to zero.
    const spagThreshold = 0.038;
    if (a1 < spagThreshold || a2 < spagThreshold || a3 < spagThreshold) return true;

    // ── Chamber pockets ───────────────────────────────────────────────────────
    // Spherical voids: sum-of-squares for each field pair below threshold.
    // Threshold grows with depth → bigger chambers deep underground.
    const chamberThresh = 0.030 + depthFactor * 0.025;
    if (n1 * n1 + n2 * n2 < chamberThresh) return true;
    if (n1 * n1 + n3 * n3 < chamberThresh) return true;
    if (n2 * n2 + n3 * n3 < chamberThresh) return true;

    return false;
}
