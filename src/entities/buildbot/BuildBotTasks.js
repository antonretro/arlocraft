import { normalizeBlockVariantId } from '../../data/blockIds.js';

/**
 * Task planners for the Build Bot. Each planner looks at the world around
 * the player and returns a list of steps ({ op: 'break' | 'place', x, y, z })
 * that the bot then works through one block at a time.
 */

export const WORK_RADIUS = 24;
export const MAX_BREAK_BLOCKS = 64;
export const MAX_LEAF_BLOCKS = 60;
// Logs per "mine trees" request: two or three trees' worth.
export const MAX_TREE_LOGS = 32;
export const MAX_PLACE_BLOCKS = 128;

const SOIL = new Set([
  'grass_block',
  'dirt',
  'coarse_dirt',
  'podzol',
  'mycelium',
  'rooted_dirt',
  'moss_block',
  'mud',
  'sand',
  'red_sand',
  'snow_block',
  'clay',
  'gravel',
  'farmland',
]);

const STONE = new Set([
  'stone',
  'deepslate',
  'andesite',
  'diorite',
  'granite',
  'tuff',
  'calcite',
  'dripstone_block',
]);

// Natural terrain the bot may dig through. Anything else (planks, bricks,
// cobblestone, chests …) could belong to a build or a structure.
const NATURAL = new Set([
  ...SOIL,
  ...STONE,
  'snow',
  'sandstone',
  'red_sandstone',
  'terracotta',
  'obsidian',
]);

export const ORE_FAMILIES = {
  coal: ['coal_ore', 'deepslate_coal_ore'],
  iron: ['iron_ore', 'deepslate_iron_ore'],
  gold: ['gold_ore', 'deepslate_gold_ore'],
  copper: ['copper_ore', 'deepslate_copper_ore'],
  redstone: ['redstone_ore', 'deepslate_redstone_ore'],
  lapis: ['lapis_ore', 'deepslate_lapis_ore'],
  emerald: ['emerald_ore', 'deepslate_emerald_ore'],
  diamond: ['diamond_ore', 'deepslate_diamond_ore'],
};

const PROTECTED_WORDS = [
  'chest',
  'furnace',
  'barrel',
  'shulker',
  'spawner',
  'hopper',
  'dispenser',
  'dropper',
  'bed',
  'door',
  'sign',
  'command',
  'beacon',
  'enchanting',
  'anvil',
  'brewing',
  'portal',
  'torch',
  'rail',
  'lever',
  'button',
  'pressure',
  'redstone_wire',
  'repeater',
  'comparator',
  'ladder',
  'carpet',
  'banner',
  'flower_pot',
  'crafting_table',
  'bookshelf',
  'lectern',
  'bell',
];

export function baseId(id) {
  return normalizeBlockVariantId(id);
}

export function isTreeLog(id) {
  const n = baseId(id);
  if (!n) return false;
  if (n.startsWith('stripped_')) return false;
  return n.endsWith('_log') || n === 'wood_redwood';
}

export function isLeaves(id) {
  const n = baseId(id);
  return Boolean(n) && (n.endsWith('_leaves') || n.startsWith('leaves_'));
}

export function isOre(id) {
  const n = baseId(id);
  return Boolean(n) && n.endsWith('_ore');
}

export function isFluid(id) {
  const n = baseId(id);
  return (
    Boolean(n) &&
    (n === 'water' ||
      n === 'lava' ||
      n.includes('water_') ||
      n.includes('lava_') ||
      n === 'ice_water')
  );
}

/** Blocks the bot must never break, whatever it was asked. */
export function isProtected(world, id, x, y, z) {
  const n = baseId(id);
  if (!n || n === 'bedrock' || n === 'barrier') return true;
  if (isFluid(n)) return true;
  if (PROTECTED_WORDS.some((w) => n.includes(w))) return true;
  const key = world.getKey(x, y, z);
  if (world.state?.chestInventories?.has(key)) return true;
  if (world.state?.furnaceStates?.has(key)) return true;
  return false;
}

export function isPlant(world, id) {
  const n = baseId(id);
  if (!n) return false;
  const data = world.getBlockData(n);
  return Boolean(data?.deco) && !PROTECTED_WORDS.some((w) => n.includes(w));
}

/** Natural terrain (soil, stone, ore) or a plant growing on it. */
export function isDiggable(world, id) {
  const n = baseId(id);
  if (!n) return false;
  return NATURAL.has(n) || isOre(n) || isPlant(world, n);
}

export function isStone(id) {
  return STONE.has(baseId(id));
}

const keyOf = (x, y, z) => `${x},${y},${z}`;

/** Cardinal direction the player faces, as a unit step on x or z. */
export function facingStep(yaw) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return { x: Math.sign(fx), z: 0 };
  return { x: 0, z: Math.sign(fz) };
}

function solidAt(world, x, y, z) {
  return world.isSolidAt(x, y, z);
}

/** Y of the highest solid block at or below `fromY` in a column (or null). */
export function surfaceBlockY(world, x, z, fromY, depth = 24) {
  for (let y = Math.floor(fromY); y >= fromY - depth; y--) {
    if (solidAt(world, x, y, z)) return y;
  }
  return null;
}

// --- Trees ---------------------------------------------------------------

/**
 * Finds the nearest natural trees (log clusters that touch leaves and stand
 * on soil) and plans their logs bottom-up, then the leaves left floating.
 */
export function planTrees(world, origin, claims = new Set()) {
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  const oz = Math.floor(origin.z);
  const logs = [];
  for (let dx = -WORK_RADIUS; dx <= WORK_RADIUS; dx++) {
    for (let dz = -WORK_RADIUS; dz <= WORK_RADIUS; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > WORK_RADIUS * WORK_RADIUS) continue;
      for (let dy = -10; dy <= 16; dy++) {
        const x = ox + dx;
        const y = oy + dy;
        const z = oz + dz;
        const id = world.getBlockAt(x, y, z);
        if (!id || !isTreeLog(id)) continue;
        if (claims.has(keyOf(x, y, z))) continue;
        logs.push({ x, y, z, d2: d2 + dy * dy * 0.25 });
      }
    }
  }
  logs.sort((a, b) => a.d2 - b.d2);

  const seen = new Set();
  const trees = [];
  let total = 0;
  for (const start of logs) {
    if (trees.length >= 3 || total >= MAX_TREE_LOGS) break;
    const startKey = keyOf(start.x, start.y, start.z);
    if (seen.has(startKey)) continue;
    const cluster = floodFill(
      world,
      start,
      (id) => isTreeLog(id),
      48,
      seen,
      claims
    );
    if (cluster.length === 0) continue;
    if (!isNaturalTree(world, cluster)) continue;
    const room = MAX_TREE_LOGS - total;
    const chosen = cluster.sort((a, b) => a.y - b.y).slice(0, room);
    trees.push(chosen);
    total += chosen.length;
  }
  if (trees.length === 0) return null;

  const steps = [];
  const removed = new Set();
  for (const tree of trees) {
    for (const b of tree) {
      steps.push({ op: 'break', x: b.x, y: b.y, z: b.z, want: 'log' });
      removed.add(keyOf(b.x, b.y, b.z));
    }
  }
  const leaves = planFloatingLeaves(world, trees.flat(), removed);
  for (const b of leaves) {
    steps.push({
      op: 'break',
      x: b.x,
      y: b.y,
      z: b.z,
      want: 'leaf',
      fast: true,
    });
  }
  return { steps, trees: trees.length, logs: total, keys: [...removed] };
}

function floodFill(world, start, match, limit, seen, claims) {
  const out = [];
  const queue = [start];
  const local = new Set([keyOf(start.x, start.y, start.z)]);
  while (queue.length > 0 && out.length < limit) {
    const b = queue.shift();
    const k = keyOf(b.x, b.y, b.z);
    seen.add(k);
    out.push({ x: b.x, y: b.y, z: b.z });
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dy && !dz) continue;
          const x = b.x + dx;
          const y = b.y + dy;
          const z = b.z + dz;
          const nk = keyOf(x, y, z);
          if (local.has(nk) || seen.has(nk) || claims.has(nk)) continue;
          const id = world.getBlockAt(x, y, z);
          if (!id || !match(id)) continue;
          local.add(nk);
          queue.push({ x, y, z });
        }
      }
    }
  }
  return out;
}

/** Trees touch leaves and grow out of soil; log pillars in houses do not. */
function isNaturalTree(world, cluster) {
  let leaves = 0;
  for (const b of cluster) {
    for (let dx = -1; dx <= 1 && leaves < 3; dx++) {
      for (let dy = -1; dy <= 1 && leaves < 3; dy++) {
        for (let dz = -1; dz <= 1 && leaves < 3; dz++) {
          if (isLeaves(world.getBlockAt(b.x + dx, b.y + dy, b.z + dz)))
            leaves++;
        }
      }
    }
    if (leaves >= 3) break;
  }
  if (leaves < 3) return false;
  const lowest = cluster.reduce((m, b) => (b.y < m.y ? b : m), cluster[0]);
  const below = baseId(world.getBlockAt(lowest.x, lowest.y - 1, lowest.z));
  return !below || SOIL.has(below) || STONE.has(below) || isPlant(world, below);
}

/** Leaves near the felled logs that no other log holds up any more. */
function planFloatingLeaves(world, logs, removed) {
  const out = [];
  const seen = new Set();
  const nearOtherLog = (x, y, z) => {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          const k = keyOf(x + dx, y + dy, z + dz);
          if (removed.has(k)) continue;
          if (isTreeLog(world.getBlockAt(x + dx, y + dy, z + dz))) return true;
        }
      }
    }
    return false;
  };
  for (const b of logs) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -2; dy <= 3; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          if (out.length >= MAX_LEAF_BLOCKS) return out;
          const x = b.x + dx;
          const y = b.y + dy;
          const z = b.z + dz;
          const k = keyOf(x, y, z);
          if (seen.has(k)) continue;
          seen.add(k);
          if (!isLeaves(world.getBlockAt(x, y, z))) continue;
          if (nearOtherLog(x, y, z)) continue;
          out.push({ x, y, z });
        }
      }
    }
  }
  // Top-down so the canopy disappears like it is being cleared.
  return out.sort((a, b) => b.y - a.y);
}

// --- Digging -------------------------------------------------------------

/** A 3x3 hole, 4 deep, a few blocks in front of the player. */
export function planHole(world, origin, yaw) {
  const dir = facingStep(yaw);
  const cx = Math.floor(origin.x) + dir.x * 3;
  const cz = Math.floor(origin.z) + dir.z * 3;
  const top = surfaceBlockY(world, cx, cz, Math.floor(origin.y) + 2, 8);
  if (top === null) return null;
  const steps = [];
  // Plants on top first, then each layer.
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const id = world.getBlockAt(cx + dx, top + 1, cz + dz);
      if (id && isPlant(world, id))
        steps.push({
          op: 'break',
          x: cx + dx,
          y: top + 1,
          z: cz + dz,
          want: 'dig',
          fast: true,
        });
    }
  }
  for (let d = 0; d < 4; d++) {
    const y = top - d;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        steps.push({ op: 'break', x: cx + dx, y, z: cz + dz, want: 'dig' });
      }
    }
  }
  return { steps, center: { x: cx, y: top, z: cz } };
}

/** A staircase going down 8 steps in the direction the player faces. */
export function planStaircase(world, origin, yaw) {
  const dir = facingStep(yaw);
  const sx = Math.floor(origin.x) + dir.x * 2;
  const sz = Math.floor(origin.z) + dir.z * 2;
  const top = surfaceBlockY(world, sx, sz, Math.floor(origin.y) + 2, 8);
  if (top === null) return null;
  const steps = [];
  for (let i = 0; i < 8; i++) {
    const x = sx + dir.x * i;
    const z = sz + dir.z * i;
    const floor = top - i - 1;
    for (let y = floor + 3; y >= floor + 1; y--) {
      steps.push({ op: 'break', x, y, z, want: 'dig' });
    }
  }
  return { steps, center: { x: sx, y: top, z: sz } };
}

// --- Mining stone and ore ------------------------------------------------

/** Blocks between a buried target and the open air above it (or null). */
function coverAbove(world, x, y, z, maxCover) {
  const cover = [];
  for (let cy = y + 1; cy <= y + maxCover + 2; cy++) {
    const id = world.getBlockAt(x, cy, z);
    if (!id) {
      // Need two blocks of air for the bot to drop in.
      if (!world.getBlockAt(x, cy + 1, z)) return cover;
      continue;
    }
    if (isFluid(id)) return null;
    if (!isDiggable(world, id)) return null;
    cover.push({ x, y: cy, z });
    if (cover.length > maxCover) return null;
  }
  return null;
}

function isExposed(world, x, y, z) {
  const n = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  let air = false;
  for (const [dx, dy, dz] of n) {
    const id = world.getBlockAt(x + dx, y + dy, z + dz);
    if (isFluid(id)) return false; // don't open up lakes or lava
    if (!id) air = true;
  }
  return air;
}

/**
 * Finds the best exposed or shallow block matching `match` near the player,
 * then mines outwards through connected matching blocks.
 */
export function planMining(world, origin, match, options = {}) {
  const { limit = 20, maxCover = 6, depth = 20, claims = new Set() } = options;
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  const oz = Math.floor(origin.z);
  let best = null;
  for (let dx = -WORK_RADIUS; dx <= WORK_RADIUS; dx++) {
    for (let dz = -WORK_RADIUS; dz <= WORK_RADIUS; dz++) {
      const hd = Math.sqrt(dx * dx + dz * dz);
      if (hd > WORK_RADIUS) continue;
      for (let dy = -depth; dy <= 10; dy++) {
        const x = ox + dx;
        const y = oy + dy;
        const z = oz + dz;
        const id = world.getBlockAt(x, y, z);
        if (!id || !match(id)) continue;
        if (claims.has(keyOf(x, y, z))) continue;
        let cover = [];
        if (!isExposed(world, x, y, z)) {
          cover = coverAbove(world, x, y, z, maxCover);
          if (!cover) continue;
        }
        const score = hd + cover.length * 3 + Math.abs(dy) * 0.6;
        if (!best || score < best.score) best = { x, y, z, cover, score };
      }
    }
  }
  if (!best) return null;

  const steps = [];
  for (const c of [...best.cover].sort((a, b) => b.y - a.y)) {
    steps.push({ op: 'break', x: c.x, y: c.y, z: c.z, want: 'dig' });
  }
  const vein = floodFill(world, best, match, limit, new Set(), claims);
  for (const b of vein) {
    steps.push({ op: 'break', x: b.x, y: b.y, z: b.z, want: 'target' });
  }
  return {
    steps,
    target: { x: best.x, y: best.y, z: best.z },
    count: vein.length,
    keys: vein.map((b) => keyOf(b.x, b.y, b.z)),
  };
}

// --- Building ------------------------------------------------------------

function pushPlace(steps, world, x, y, z) {
  const id = world.getBlockAt(x, y, z);
  if (id && !world.isReplaceableForPlacement(id)) return;
  steps.push({ op: 'place', x, y, z });
}

/** Simple builds next to the player. Returns { steps, label }. */
export function planBuild(world, origin, yaw, shape) {
  const dir = facingStep(yaw);
  const right = { x: -dir.z, z: dir.x };
  const px = Math.floor(origin.x);
  const py = Math.floor(origin.y);
  const pz = Math.floor(origin.z);
  const steps = [];
  const at = (f, r) => ({
    x: px + dir.x * f + right.x * r,
    z: pz + dir.z * f + right.z * r,
  });
  // Build on the ground in front of the player.
  const groundAt = (x, z) => {
    const top = surfaceBlockY(world, x, z, py + 3, 8);
    return top === null ? py : top + 1;
  };

  if (shape === 'house') {
    // 5x5 room with 3-high walls, a doorway facing the player and a flat roof.
    const c = at(5, 0);
    const base = groundAt(c.x, c.z);
    for (let y = base; y < base + 3; y++) {
      for (let f = -2; f <= 2; f++) {
        for (let r = -2; r <= 2; r++) {
          if (Math.abs(f) !== 2 && Math.abs(r) !== 2) continue;
          if (f === -2 && r === 0 && y < base + 2) continue; // doorway
          const p = at(5 + f, r);
          pushPlace(steps, world, p.x, y, p.z);
        }
      }
    }
    for (let f = -2; f <= 2; f++) {
      for (let r = -2; r <= 2; r++) {
        const p = at(5 + f, r);
        pushPlace(steps, world, p.x, base + 3, p.z);
      }
    }
    return { steps, label: 'a house', torchAt: { ...at(5, 0), y: base } };
  }

  if (shape === 'wall') {
    // 7 wide, 3 high, three blocks ahead, across the player's view.
    for (let y = 0; y < 3; y++) {
      for (let r = -3; r <= 3; r++) {
        const p = at(3, r);
        const base = groundAt(p.x, p.z);
        pushPlace(steps, world, p.x, base + y, p.z);
      }
    }
    return { steps, label: 'a wall' };
  }

  if (shape === 'tower') {
    // Hollow 3x3 tower, 7 high, with corner battlements.
    const c = at(4, 0);
    const base = groundAt(c.x, c.z);
    for (let y = base; y < base + 7; y++) {
      for (let f = -1; f <= 1; f++) {
        for (let r = -1; r <= 1; r++) {
          if (f === 0 && r === 0) continue;
          const p = at(4 + f, r);
          pushPlace(steps, world, p.x, y, p.z);
        }
      }
    }
    for (const [f, r] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const p = at(4 + f, r);
      pushPlace(steps, world, p.x, base + 7, p.z);
    }
    return { steps, label: 'a tower' };
  }

  if (shape === 'bridge') {
    // 3 wide, 14 long deck at foot level, only over gaps.
    const deckY = py - 1;
    for (let f = 1; f <= 14; f++) {
      for (let r = -1; r <= 1; r++) {
        const p = at(f, r);
        pushPlace(steps, world, p.x, deckY, p.z);
      }
    }
    return { steps, label: 'a bridge' };
  }
  return null;
}

/** Spots on the ground around the player that are dark enough for a torch. */
export function planTorches(world, origin, count = 8) {
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  const oz = Math.floor(origin.z);
  const spots = [];
  const ring = [4, 9];
  for (const radius of ring) {
    const n = radius < 6 ? 4 : 8;
    for (let i = 0; i < n && spots.length < count; i++) {
      const a = (i / n) * Math.PI * 2 + (radius < 6 ? Math.PI / 4 : 0);
      const x = ox + Math.round(Math.cos(a) * radius);
      const z = oz + Math.round(Math.sin(a) * radius);
      const top = surfaceBlockY(world, x, z, oy + 4, 10);
      if (top === null) continue;
      const ground = world.getBlockAt(x, top, z);
      if (!ground || isLeaves(ground) || isFluid(ground)) continue;
      const y = top + 1;
      const above = world.getBlockAt(x, y, z);
      if (above && !world.isReplaceableForPlacement(above)) continue;
      if (isFluid(above)) continue;
      spots.push({ op: 'place', x, y, z, block: 'torch' });
    }
  }
  return spots;
}
