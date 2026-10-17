/**
 * Tree and large-plant shapes for world generation.
 *
 * Every builder takes the trunk base (x, y, z), a seeded `rng()` returning
 * [0, 1) and two writers: `log(x, y, z, id)` replaces whatever is there and
 * `leaf(x, y, z, id)` only fills air, so canopies never cut into terrain or
 * other trees' trunks. Shapes follow Minecraft's silhouettes closely enough
 * to read at a glance.
 */

function range(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Round canopy layer; corners are dropped at random for a natural edge. */
function leafDisc(leaf, rng, cx, y, cz, radius, id, cornerChance = 0.5) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
      if (corner && (radius > 1 ? true : rng() > cornerChance)) continue;
      if (dx * dx + dz * dz > radius * radius + radius) continue;
      leaf(cx + dx, y, cz + dz, id);
    }
  }
}

function leafBlob(leaf, rng, cx, cy, cz, rx, ry, id) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      for (let dz = -rx; dz <= rx; dz++) {
        const d =
          (dx * dx) / (rx * rx + 0.5) +
          (dy * dy) / (ry * ry + 0.5) +
          (dz * dz) / (rx * rx + 0.5);
        if (d > 1 || (d > 0.75 && rng() < 0.35)) continue;
        leaf(cx + dx, cy + dy, cz + dz, id);
      }
    }
  }
}

function oak(
  log,
  leaf,
  rng,
  x,
  y,
  z,
  logId = 'oak_log',
  leafId = 'oak_leaves',
  minH = 4,
  maxH = 6
) {
  const h = range(rng, minH, maxH);
  for (let i = 0; i < h; i++) log(x, y + i, z, logId);
  const top = y + h;
  leafDisc(leaf, rng, x, top - 3, z, 2, leafId);
  leafDisc(leaf, rng, x, top - 2, z, 2, leafId);
  leafDisc(leaf, rng, x, top - 1, z, 1, leafId, 0.6);
  leafDisc(leaf, rng, x, top, z, 1, leafId, 0.9);
}

function bigOak(log, leaf, rng, x, y, z) {
  const h = range(rng, 7, 10);
  for (let i = 0; i < h; i++) log(x, y + i, z, 'oak_log');
  const top = y + h;
  leafBlob(leaf, rng, x, top - 1, z, 3, 2, 'oak_leaves');
  // A couple of short branches with their own leaf clusters.
  const branches = range(rng, 2, 3);
  for (let b = 0; b < branches; b++) {
    const angle = rng() * Math.PI * 2;
    const dx = Math.round(Math.cos(angle) * 2);
    const dz = Math.round(Math.sin(angle) * 2);
    const by = y + range(rng, Math.floor(h / 2), h - 2);
    log(x + Math.sign(dx), by, z + Math.sign(dz), 'oak_log');
    log(x + dx, by + 1, z + dz, 'oak_log');
    leafBlob(leaf, rng, x + dx, by + 2, z + dz, 2, 1, 'oak_leaves');
  }
}

function birch(log, leaf, rng, x, y, z) {
  oak(log, leaf, rng, x, y, z, 'birch_log', 'birch_leaves', 5, 7);
}

function spruce(log, leaf, rng, x, y, z, snowy = false) {
  const h = range(rng, 6, 10);
  for (let i = 0; i < h; i++) log(x, y + i, z, 'spruce_log');
  const top = y + h;
  // Alternating rings that taper towards a pointed top.
  let radius = range(rng, 2, 3);
  for (let ly = top; ly >= y + 2; ly--) {
    const fromTop = top - ly;
    const r =
      fromTop === 0
        ? 0
        : fromTop % 2 === 1
          ? Math.min(radius, 1 + Math.floor(fromTop / 3))
          : Math.max(0, Math.min(radius, Math.floor(fromTop / 3)));
    leafDisc(leaf, rng, x, ly, z, r, 'spruce_leaves', 1);
  }
  leaf(x, top + 1, z, 'spruce_leaves');
  if (snowy) leaf(x, top + 2, z, 'snow_block');
}

function pine(log, leaf, rng, x, y, z) {
  // Tall bare trunk with a small crown, like Minecraft's pine variant.
  const h = range(rng, 8, 12);
  for (let i = 0; i < h; i++) log(x, y + i, z, 'spruce_log');
  const top = y + h;
  leafDisc(leaf, rng, x, top - 2, z, 2, 'spruce_leaves', 1);
  leafDisc(leaf, rng, x, top - 1, z, 1, 'spruce_leaves', 1);
  leaf(x, top, z, 'spruce_leaves');
  leaf(x, top + 1, z, 'spruce_leaves');
}

function acacia(log, leaf, rng, x, y, z) {
  const straight = range(rng, 2, 4);
  for (let i = 0; i < straight; i++) log(x, y + i, z, 'acacia_log');
  // The trunk then leans diagonally before spreading into a flat canopy.
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const [dx, dz] = dirs[Math.floor(rng() * 4)];
  let cx = x;
  let cz = z;
  let cy = y + straight;
  const lean = range(rng, 2, 3);
  for (let i = 0; i < lean; i++) {
    cx += dx;
    cz += dz;
    log(cx, cy, cz, 'acacia_log');
    cy++;
  }
  leafDisc(leaf, rng, cx, cy, cz, 3, 'acacia_leaves', 1);
  leafDisc(leaf, rng, cx, cy + 1, cz, 1, 'acacia_leaves', 1);
}

function darkOak(log, leaf, rng, x, y, z) {
  const h = range(rng, 6, 8);
  for (let i = 0; i < h; i++) {
    log(x, y + i, z, 'dark_oak_log');
    log(x + 1, y + i, z, 'dark_oak_log');
    log(x, y + i, z + 1, 'dark_oak_log');
    log(x + 1, y + i, z + 1, 'dark_oak_log');
  }
  const top = y + h;
  leafBlob(leaf, rng, x, top - 1, z, 4, 1, 'dark_oak_leaves');
  leafBlob(leaf, rng, x + 1, top, z + 1, 3, 1, 'dark_oak_leaves');
}

function jungle(log, leaf, rng, x, y, z) {
  const h = range(rng, 9, 14);
  for (let i = 0; i < h; i++) log(x, y + i, z, 'jungle_log');
  const top = y + h;
  leafBlob(leaf, rng, x, top, z, 3, 2, 'jungle_leaves');
}

function megaJungle(log, leaf, rng, x, y, z) {
  const h = range(rng, 16, 24);
  for (let i = 0; i < h; i++) {
    log(x, y + i, z, 'jungle_log');
    log(x + 1, y + i, z, 'jungle_log');
    log(x, y + i, z + 1, 'jungle_log');
    log(x + 1, y + i, z + 1, 'jungle_log');
  }
  const top = y + h;
  leafBlob(leaf, rng, x, top, z, 5, 2, 'jungle_leaves');
  // Side canopies part way up.
  for (let b = 0; b < 2; b++) {
    const by = y + range(rng, Math.floor(h * 0.5), h - 4);
    const side = b === 0 ? -3 : 4;
    leafBlob(leaf, rng, x + side, by, z, 2, 1, 'jungle_leaves');
    log(x + Math.sign(side) * 2, by - 1, z, 'jungle_log');
  }
}

function jungleBush(log, leaf, rng, x, y, z) {
  log(x, y, z, 'jungle_log');
  leafBlob(leaf, rng, x, y + 1, z, 2, 1, 'oak_leaves');
}

function mangrove(log, leaf, rng, x, y, z) {
  // Prop roots lift the trunk above the swamp water.
  const lift = range(rng, 2, 3);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let i = 0; i < lift; i++) log(x + dx, y + i, z + dz, 'mangrove_log');
  }
  const h = range(rng, 5, 7);
  for (let i = lift; i < lift + h; i++) log(x, y + i, z, 'mangrove_log');
  leafBlob(leaf, rng, x, y + lift + h, z, 3, 2, 'mangrove_leaves');
}

function cherry(log, leaf, rng, x, y, z) {
  const h = range(rng, 4, 6);
  for (let i = 0; i < h; i++) log(x, y + i, z, 'cherry_log');
  const top = y + h;
  // Two arching branches, each ending in a wide pink canopy.
  for (const side of [-1, 1]) {
    const axisX = rng() < 0.5;
    const bx = x + (axisX ? side * 2 : 0);
    const bz = z + (axisX ? 0 : side * 2);
    log(x + (axisX ? side : 0), top - 1, z + (axisX ? 0 : side), 'cherry_log');
    log(bx, top, bz, 'cherry_log');
    leafBlob(leaf, rng, bx, top + 1, bz, 3, 1, 'cherry_leaves');
  }
  leafBlob(leaf, rng, x, top + 1, z, 2, 1, 'cherry_leaves');
}

function hugeMushroom(log, leaf, rng, x, y, z) {
  const h = range(rng, 4, 6);
  for (let i = 0; i < h; i++) log(x, y + i, z, 'mushroom_stem');
  const cap = rng() < 0.5 ? 'red_mushroom_block' : 'brown_mushroom_block';
  leafDisc(leaf, rng, x, y + h, z, 2, cap, 1);
  leafDisc(leaf, rng, x, y + h + 1, z, 1, cap, 1);
}

function iceSpike(log, leaf, rng, x, y, z) {
  const h = range(rng, 5, 14);
  for (let i = 0; i < h; i++) {
    const r = Math.max(0, Math.round((1 - i / h) * 1.6));
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r) continue;
        log(x + dx, y + i, z + dz, 'packed_ice');
      }
    }
  }
}

export const TREE_BUILDERS = {
  oak,
  big_oak: bigOak,
  birch,
  spruce,
  snowy_spruce: (log, leaf, rng, x, y, z) =>
    spruce(log, leaf, rng, x, y, z, true),
  pine,
  acacia,
  dark_oak: darkOak,
  jungle,
  mega_jungle: megaJungle,
  jungle_bush: jungleBush,
  mangrove,
  cherry,
  huge_mushroom: hugeMushroom,
  ice_spike: iceSpike,
};

/** Largest horizontal reach of any tree from its trunk (for chunk margins). */
export const MAX_TREE_RADIUS = 6;

/** Picks a tree type from a biome's weighted `trees` list. */
export function pickTreeType(trees, roll) {
  if (!trees || trees.length === 0) return null;
  let total = 0;
  for (const [, w] of trees) total += w;
  let t = roll * total;
  for (const [type, w] of trees) {
    t -= w;
    if (t < 0) return type;
  }
  return trees[trees.length - 1][0];
}
