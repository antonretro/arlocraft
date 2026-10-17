/**
 * Village buildings: Minecraft-style houses built from a biome palette.
 *
 * Every builder works in a local frame: the footprint is W blocks along x
 * and D blocks along z, local y 0 is the foundation/floor layer and the
 * front (with the door) is the wall at z = 0, facing local north (-z).
 * `Blueprint` rotates that frame into the world so the front faces the
 * village road, turning stairs and doors with it.
 */

const DIRS = ['n', 'e', 's', 'w'];
// Stair geometry raises its back half towards +z unrotated ('_s'); the
// mesher's rotations map the remaining suffixes to the high side below.
const STAIR_SUFFIX_FOR_HIGH_SIDE = { n: 'n', s: 's', e: 'w', w: 'e' };

export const VILLAGE_STYLES = {
  oak: {
    frame: 'oak_log',
    wall: 'oak_planks',
    trim: 'stripped_oak_log',
    floor: 'oak_planks',
    foundation: 'cobblestone',
    stone: 'cobblestone',
    stoneAccent: 'stone_bricks',
    roof: 'spruce_planks_stairs',
    roofSlab: 'spruce_planks_slab',
    gable: 'oak_planks',
    door: 'spruce_planks_door',
    step: 'cobblestone_stairs',
    stoneSlab: 'cobblestone_slab',
    window: 'glass',
    box: 'podzol',
    flowers: ['poppy', 'dandelion', 'cornflower', 'oxeye_daisy'],
    ground: 'grass_block',
    path: 'path_block',
  },
  birch: {
    frame: 'birch_log',
    wall: 'birch_planks',
    trim: 'stripped_birch_log',
    floor: 'oak_planks',
    foundation: 'stone_bricks',
    stone: 'stone_bricks',
    stoneAccent: 'mossy_stone_bricks',
    roof: 'dark_oak_planks_stairs',
    roofSlab: 'dark_oak_planks_slab',
    gable: 'birch_planks',
    door: 'dark_oak_planks_door',
    step: 'stone_bricks_stairs',
    stoneSlab: 'stone_bricks_slab',
    window: 'glass',
    box: 'podzol',
    flowers: ['lily_of_the_valley', 'allium', 'azure_bluet'],
    ground: 'grass_block',
    path: 'path_block',
  },
  cherry: {
    frame: 'cherry_log',
    wall: 'cherry_planks',
    trim: 'stripped_oak_log',
    floor: 'oak_planks',
    foundation: 'stone_bricks',
    stone: 'stone_bricks',
    stoneAccent: 'mossy_stone_bricks',
    roof: 'dark_oak_planks_stairs',
    roofSlab: 'dark_oak_planks_slab',
    gable: 'cherry_planks',
    door: 'cherry_planks_door',
    step: 'stone_bricks_stairs',
    stoneSlab: 'stone_bricks_slab',
    window: 'glass',
    box: 'podzol',
    flowers: ['pink_tulip', 'allium', 'white_tulip'],
    ground: 'grass_block',
    path: 'path_block',
  },
  spruce: {
    frame: 'spruce_log',
    wall: 'spruce_planks',
    trim: 'stripped_spruce_log',
    floor: 'spruce_planks',
    foundation: 'cobblestone',
    stone: 'cobblestone',
    stoneAccent: 'mossy_cobblestone',
    roof: 'dark_oak_planks_stairs',
    roofSlab: 'dark_oak_planks_slab',
    gable: 'spruce_planks',
    door: 'spruce_planks_door',
    step: 'cobblestone_stairs',
    stoneSlab: 'cobblestone_slab',
    window: 'glass',
    box: 'podzol',
    flowers: ['fern', 'poppy', 'cornflower'],
    ground: 'grass_block',
    path: 'path_block',
  },
  snowy: {
    frame: 'spruce_log',
    wall: 'spruce_planks',
    trim: 'stripped_spruce_log',
    floor: 'spruce_planks',
    foundation: 'stone_bricks',
    stone: 'stone_bricks',
    stoneAccent: 'cobblestone',
    roof: 'spruce_planks_stairs',
    roofSlab: 'spruce_planks_slab',
    gable: 'spruce_planks',
    door: 'spruce_planks_door',
    step: 'stone_bricks_stairs',
    stoneSlab: 'stone_bricks_slab',
    window: 'glass',
    box: 'spruce_planks',
    flowers: [],
    ground: 'snow_block',
    path: 'path_block',
  },
  acacia: {
    frame: 'acacia_log',
    wall: 'acacia_planks',
    trim: 'stripped_acacia_log',
    floor: 'acacia_planks',
    foundation: 'cobblestone',
    stone: 'terracotta_orange',
    stoneAccent: 'terracotta_white',
    roof: 'acacia_planks_stairs',
    roofSlab: 'acacia_planks_slab',
    gable: 'terracotta_orange',
    door: 'acacia_planks_door',
    step: 'cobblestone_stairs',
    stoneSlab: 'cobblestone_slab',
    window: 'glass',
    box: 'podzol',
    flowers: ['dandelion', 'orange_tulip', 'red_tulip'],
    ground: 'grass_block',
    path: 'path_block',
  },
  desert: {
    frame: 'sandstone',
    wall: 'sandstone',
    trim: 'terracotta_orange',
    floor: 'smooth_stone',
    foundation: 'sandstone',
    stone: 'sandstone',
    stoneAccent: 'terracotta_yellow',
    roof: 'sandstone_stairs',
    roofSlab: 'sandstone_slab',
    gable: 'sandstone',
    door: 'jungle_planks_door',
    step: 'sandstone_stairs',
    stoneSlab: 'sandstone_slab',
    window: 'glass',
    box: 'sand',
    flowers: ['dead_bush'],
    ground: 'sand',
    path: 'path_block',
    flat: true,
  },
};

/** Biome id -> village style, or null where no villages grow. */
export function villageStyleForBiome(biomeId) {
  switch (biomeId) {
    case 'plains':
    case 'sunflower_plains':
    case 'meadow':
    case 'forest':
    case 'flower_forest':
      return 'oak';
    case 'birch_forest':
      return 'birch';
    case 'cherry_grove':
      return 'cherry';
    case 'taiga':
      return 'spruce';
    case 'snowy_plains':
    case 'snowy_taiga':
      return 'snowy';
    case 'savanna':
      return 'acacia';
    case 'desert':
      return 'desert';
    default:
      return null;
  }
}

/**
 * Collects a building's blocks in world space. Local (lx, ly, lz) maps to
 * the world through the rotation `rot` (0 = front faces north, 1 = east,
 * 2 = south, 3 = west) and the world-space minimum corner (x0, y0, z0).
 */
export class Blueprint {
  constructor(W, D, rot, x0, y0, z0) {
    this.W = W;
    this.D = D;
    this.rot = rot & 3;
    this.x0 = x0;
    this.y0 = y0;
    this.z0 = z0;
    this.blocks = new Map(); // "x|y|z" -> {x, y, z, id}
  }

  world(lx, lz) {
    const { W, D } = this;
    switch (this.rot) {
      case 1:
        return [this.x0 + D - 1 - lz, this.z0 + lx];
      case 2:
        return [this.x0 + W - 1 - lx, this.z0 + D - 1 - lz];
      case 3:
        return [this.x0 + lz, this.z0 + W - 1 - lx];
      default:
        return [this.x0 + lx, this.z0 + lz];
    }
  }

  dir(localDir) {
    return DIRS[(DIRS.indexOf(localDir) + this.rot) & 3];
  }

  put(lx, ly, lz, id) {
    const [x, z] = this.world(lx, lz);
    const y = this.y0 + ly;
    this.blocks.set(`${x}|${y}|${z}`, { x, y, z, id });
  }

  /** Stairs whose raised half points to local direction `high`. */
  stair(lx, ly, lz, base, high) {
    this.put(
      lx,
      ly,
      lz,
      `${base}_${STAIR_SUFFIX_FOR_HIGH_SIDE[this.dir(high)]}`
    );
  }

  /** Two-block door in a wall facing local direction `facing`. */
  door(lx, ly, lz, base, facing = 'n') {
    const d = this.dir(facing);
    this.put(lx, ly, lz, `${base}_${d}`);
    this.put(lx, ly + 1, lz, `${base}_top_${d}`);
  }

  box(lx0, ly0, lz0, lx1, ly1, lz1, id) {
    for (let y = ly0; y <= ly1; y++)
      for (let z = lz0; z <= lz1; z++)
        for (let x = lx0; x <= lx1; x++) this.put(x, y, z, id);
  }

  list() {
    return [...this.blocks.values()];
  }
}

// ---------------------------------------------------------------------------
// Shared building parts
// ---------------------------------------------------------------------------

function isCorner(W, D, x, z) {
  return (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
}

function isEdge(W, D, x, z) {
  return x === 0 || x === W - 1 || z === 0 || z === D - 1;
}

/** Foundation ring and floor at local y 0. */
function foundation(b, p, W, D, floorId = p.floor) {
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++)
      b.put(x, 0, z, isEdge(W, D, x, z) ? p.foundation : floorId);
}

/**
 * Walls from y0 to y1 with log corners. `wallAt(x, y, z)` may return a
 * custom id (windows, doors...) or undefined for the default wall.
 */
function walls(b, p, W, D, y0, y1, wallId = p.wall, wallAt = null) {
  for (let y = y0; y <= y1; y++)
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        if (!isEdge(W, D, x, z)) continue;
        if (isCorner(W, D, x, z)) {
          b.put(x, y, z, p.frame);
          continue;
        }
        const custom = wallAt?.(x, y, z);
        b.put(x, y, z, custom ?? wallId);
      }
}

/** Horizontal beam ring (top plate / floor band). */
function beam(b, p, W, D, y, id = p.trim) {
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (!isEdge(W, D, x, z)) continue;
      b.put(x, y, z, isCorner(W, D, x, z) ? p.frame : id);
    }
}

/** Interior floor (planks) at local y, inside the walls. */
function interiorFloor(b, W, D, y, id) {
  b.box(1, y, 1, W - 2, y, D - 2, id);
}

/**
 * Gable roof with stair slopes and a one-block overhang. With `alongX`
 * the ridge runs along x and the slopes face the front and back walls;
 * otherwise it runs along z. Gable ends are filled with `gableId`.
 * Returns the y of the ridge.
 */
function gableRoof(b, p, W, D, baseY, alongX = true, gableId = p.gable) {
  const span = alongX ? D : W;
  const len = alongX ? W : D;
  const at = (u, v) => (alongX ? [u, v] : [v, u]); // u along ridge, v across
  let ridgeY = baseY;
  for (let k = 0; ; k++) {
    const lo = -1 + k;
    const hi = span - k;
    const y = baseY + k;
    if (lo > hi) break;
    ridgeY = y;
    for (let u = -1; u <= len; u++) {
      if (lo === hi) {
        const [x, z] = at(u, lo);
        b.put(x, y, z, p.roofSlab);
        continue;
      }
      const [x1, z1] = at(u, lo);
      const [x2, z2] = at(u, hi);
      b.stair(x1, y, z1, p.roof, alongX ? 's' : 'e');
      b.stair(x2, y, z2, p.roof, alongX ? 'n' : 'w');
    }
    if (k >= 1) {
      for (let v = lo + 1; v <= hi - 1; v++) {
        const [xa, za] = at(0, v);
        const [xb, zb] = at(len - 1, v);
        b.put(xa, y, za, gableId);
        b.put(xb, y, zb, gableId);
      }
    }
    if (lo === hi || lo + 1 === hi) break;
  }
  return ridgeY;
}

/** Four-sided pyramid roof over a square-ish footprint. */
function pyramidRoof(b, p, x0, z0, x1, z1, baseY, capId) {
  for (let k = 0; ; k++) {
    const ax = x0 - 1 + k;
    const bx = x1 + 1 - k;
    const az = z0 - 1 + k;
    const bz = z1 + 1 - k;
    const y = baseY + k;
    if (ax >= bx || az >= bz) {
      b.box(
        Math.min(ax, bx),
        y,
        Math.min(az, bz),
        Math.max(ax, bx),
        y,
        Math.max(az, bz),
        capId
      );
      return y;
    }
    for (let x = ax; x <= bx; x++) {
      b.stair(x, y, az, p.roof, 's');
      b.stair(x, y, bz, p.roof, 'n');
    }
    for (let z = az + 1; z <= bz - 1; z++) {
      b.stair(ax, y, z, p.roof, 'e');
      b.stair(bx, y, z, p.roof, 'w');
    }
    // Fill the inside of this layer so the roof is closed from below.
    if (bx - ax >= 2 && bz - az >= 2) {
      b.box(ax + 1, y, az + 1, bx - 1, y, bz - 1, p.gable);
    }
  }
}

/** Flat roof with a parapet of slabs (desert style). */
function flatRoof(b, p, W, D, y) {
  b.box(0, y, 0, W - 1, y, D - 1, p.wall);
  beam(b, p, W, D, y, p.trim);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (!isEdge(W, D, x, z)) continue;
      b.put(x, y + 1, z, isCorner(W, D, x, z) ? p.wall : p.stoneSlab);
    }
  return y + 1;
}

/** Door with a front step and an optional lantern-lit porch. */
function frontDoor(b, p, x, y = 1) {
  b.door(x, y, 0, p.door, 'n');
  b.stair(x, y - 1, -1, p.step, 's');
}

/** Flower box under a front window. */
function flowerBox(b, p, x, y, rng) {
  if (!p.flowers.length) return;
  b.put(x, y, -1, p.box);
  b.put(x, y + 1, -1, p.flowers[Math.floor(rng() * p.flowers.length)]);
}

function chimney(b, p, x, z, y0, top) {
  for (let y = y0; y <= top; y++) b.put(x, y, z, p.stone);
  b.put(x, top + 1, z, p.stoneSlab);
}

function bed(b, x, y, z, alongZ = true) {
  b.put(x, y, z, 'bed');
  if (alongZ) b.put(x, y, z + 1, 'bed');
  else b.put(x + 1, y, z, 'bed');
}

// ---------------------------------------------------------------------------
// Buildings. Each returns { doorLocal: [x, z], villagerSpot: [x, y, z] }.
// ---------------------------------------------------------------------------

/** Small cottage: 7x6, one room, gable roof, chimney and flower boxes. */
function cottage(b, p, rng) {
  const W = 7;
  const D = 6;
  foundation(b, p, W, D);
  walls(b, p, W, D, 1, 3, p.wall, (x, y, z) => {
    if (y !== 2) return undefined;
    if (z === 0 && (x === 1 || x === 5)) return p.window;
    if (z === D - 1 && x === 3) return p.window;
    if ((x === 0 || x === W - 1) && (z === 2 || z === 3)) return p.window;
    return undefined;
  });
  b.box(1, 1, 1, W - 2, 4, D - 2, 'air');
  if (p.flat) {
    flatRoof(b, p, W, D, 4);
  } else {
    beam(b, p, W, D, 4);
    gableRoof(b, p, W, D, 4, true);
    chimney(b, p, W - 2, D - 1, 1, 8);
  }
  frontDoor(b, p, 3);
  flowerBox(b, p, 1, 1, rng);
  flowerBox(b, p, 5, 1, rng);
  // Interior
  bed(b, 1, 1, 3);
  b.put(5, 1, 4, 'chest:common_village');
  b.put(4, 1, 4, 'crafting_table');
  b.put(5, 1, 1, 'barrel');
  b.put(5, 2, 1, 'lantern');
  return { door: [3, 0], villager: [3, 1, 2] };
}

/** Family house: 9x7 with a porch roof over the door. */
function house(b, p, rng) {
  const W = 9;
  const D = 7;
  foundation(b, p, W, D);
  walls(b, p, W, D, 1, 3, p.wall, (x, y, z) => {
    if (x === 4 && (z === 0 || z === D - 1)) return p.frame; // mid post
    if (y !== 2) return undefined;
    if (z === 0 && (x === 2 || x === 6)) return p.window;
    if (z === D - 1 && (x === 2 || x === 6)) return p.window;
    if ((x === 0 || x === W - 1) && (z === 2 || z === 4)) return p.window;
    return undefined;
  });
  b.box(1, 1, 1, W - 2, 4, D - 2, 'air');
  if (p.flat) {
    flatRoof(b, p, W, D, 4);
  } else {
    beam(b, p, W, D, 4);
    gableRoof(b, p, W, D, 4, true);
    chimney(b, p, 1, D - 1, 1, 8);
  }
  // Door off-centre so the mid post stays.
  frontDoor(b, p, 3);
  flowerBox(b, p, 2, 1, rng);
  flowerBox(b, p, 6, 1, rng);
  // Lantern posts either side of the step.
  b.put(5, 1, -1, p.frame);
  b.put(5, 2, -1, 'lantern');
  // Interior
  bed(b, 7, 1, 3);
  bed(b, 6, 1, 4);
  b.put(1, 1, 4, 'furnace');
  b.put(1, 1, 5, 'smoker');
  b.put(3, 1, 5, 'crafting_table');
  b.put(4, 1, 5, 'chest:common_village');
  b.put(7, 1, 1, 'barrel');
  b.put(7, 2, 1, 'lantern');
  b.put(1, 1, 1, 'bookshelf');
  return { door: [3, 0], villager: [4, 1, 2] };
}

/** Two-storey house: stone ground floor, timber upper floor, staircase. */
function twoStorey(b, p, rng) {
  const W = 9;
  const D = 7;
  foundation(b, p, W, D);
  walls(b, p, W, D, 1, 3, p.stone, (x, y, z) => {
    if (y !== 2) return undefined;
    if (z === 0 && (x === 2 || x === 6)) return p.window;
    if (z === D - 1 && (x === 2 || x === 5)) return p.window;
    if ((x === 0 || x === W - 1) && z === 3) return p.window;
    return undefined;
  });
  beam(b, p, W, D, 4);
  walls(b, p, W, D, 5, 7, p.wall, (x, y, z) => {
    if (x === 4 && (z === 0 || z === D - 1)) return p.frame;
    if (y !== 6) return undefined;
    if ((z === 0 || z === D - 1) && (x === 2 || x === 6)) return p.window;
    if ((x === 0 || x === W - 1) && (z === 2 || z === 4)) return p.window;
    return undefined;
  });
  b.box(1, 1, 1, W - 2, 3, D - 2, 'air');
  interiorFloor(b, W, D, 4, p.floor);
  b.box(1, 5, 1, W - 2, 8, D - 2, 'air');
  if (p.flat) {
    flatRoof(b, p, W, D, 8);
  } else {
    beam(b, p, W, D, 8);
    gableRoof(b, p, W, D, 8, true);
    chimney(b, p, W - 2, D - 1, 1, 12);
  }
  frontDoor(b, p, 4);
  flowerBox(b, p, 2, 1, rng);
  flowerBox(b, p, 6, 1, rng);
  // Staircase along the back wall rising to the east.
  const sz = D - 2;
  b.stair(4, 1, sz, p.roof, 'e');
  b.put(5, 1, sz, p.floor);
  b.stair(5, 2, sz, p.roof, 'e');
  b.box(6, 1, sz, 6, 2, sz, p.floor);
  b.stair(6, 3, sz, p.roof, 'e');
  b.box(4, 4, sz, 6, 4, sz, 'air');
  // Ground floor: kitchen.
  b.put(1, 1, 1, 'furnace');
  b.put(1, 1, 2, 'smoker');
  b.put(7, 1, 1, 'crafting_table');
  b.put(7, 1, 2, 'barrel');
  b.put(7, 2, 2, 'lantern');
  b.put(1, 1, sz, 'chest:common_village');
  // Upper floor: bedroom.
  bed(b, 1, 5, 1);
  bed(b, 3, 5, 1);
  b.put(7, 5, 1, 'bookshelf');
  b.put(7, 5, 2, 'bookshelf');
  b.put(1, 5, sz, 'chest:common_village');
  b.put(7, 5, sz, 'lantern');
  return { door: [4, 0], villager: [3, 1, 2] };
}

/** Crop farm: log-bordered farmland with a water channel. */
function farm(b, p, rng, W = 11) {
  const D = 9;
  const crops = [
    'wheat_stage7',
    'carrot_stage3',
    'potato_stage3',
    'beetroot_stage3',
    'wheat_stage5',
  ];
  const a = crops[Math.floor(rng() * crops.length)];
  const c = crops[Math.floor(rng() * crops.length)];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (isEdge(W, D, x, z)) {
        b.put(x, 0, z, p.frame);
        b.put(x, 1, z, 'air');
        continue;
      }
      if (z === 4) {
        b.put(x, 0, z, 'water');
        b.put(x, -1, z, p.foundation);
        b.put(x, 1, z, 'air');
        continue;
      }
      b.put(x, 0, z, 'farmland');
      b.put(x, -1, z, 'dirt');
      b.put(x, 1, z, z < 4 ? a : c);
    }
  // Hay bales and a scarecrow at the back corners.
  b.put(0, 1, D - 1, 'hay_block');
  b.put(1, 1, D - 1, 'hay_block');
  b.put(0, 2, D - 1, 'hay_block');
  b.put(W - 1, 1, D - 1, p.frame);
  b.put(W - 1, 2, D - 1, 'hay_block');
  b.put(W - 1, 3, D - 1, 'pumpkin');
  b.put(W - 1, 1, 0, 'barrel');
  return { door: [Math.floor(W / 2), 0], villager: null, flush: true };
}

/** Blacksmith: stone workshop with an open forge porch and a lava pit. */
function blacksmith(b, p) {
  const W = 9;
  const D = 8;
  foundation(b, p, W, D, p.stone);
  // Closed back room (z >= 3); open porch in front on log posts.
  walls(b, p, W, D, 1, 3, p.stone, (x, y, z) => {
    if (z < 3 && !(x === 0 || x === W - 1)) return 'air';
    if (z < 3 && z > 0) return y === 1 ? p.stoneSlab : 'air';
    if (y === 2 && z === D - 1 && (x === 2 || x === 6)) return p.window;
    if (y === 2 && (x === 0 || x === W - 1) && z === 5) return p.window;
    return undefined;
  });
  for (const x of [0, 4, W - 1]) b.box(x, 1, 0, x, 3, 0, p.frame);
  // Inner wall separating porch and back room, with a doorway.
  for (let x = 1; x < W - 1; x++)
    for (let y = 1; y <= 3; y++)
      b.put(x, y, 3, x === 4 && y <= 2 ? 'air' : p.stone);
  b.put(2, 2, 3, p.window);
  b.box(1, 1, 4, W - 2, 3, D - 2, 'air');
  beam(b, p, W, D, 4);
  if (p.flat) flatRoof(b, p, W, D, 4);
  else gableRoof(b, p, W, D, 4, true);
  if (!p.flat) chimney(b, p, 1, D - 1, 1, 9);
  // Forge porch.
  b.put(1, 1, 2, 'furnace');
  b.put(2, 1, 2, 'blast_furnace');
  b.put(1, 0, 1, 'lava');
  b.put(2, 0, 1, p.stoneSlab);
  b.put(6, 1, 2, 'smithing_table');
  b.put(7, 1, 2, 'stonecutter');
  b.put(7, 1, 1, 'iron_block');
  // Back room storage.
  b.put(1, 1, D - 2, 'chest:common_village');
  b.put(2, 1, D - 2, 'barrel');
  b.put(W - 2, 1, D - 2, 'barrel');
  b.put(W - 2, 2, D - 2, 'lantern');
  b.stair(4, 0, -1, p.step, 's');
  return { door: [4, 0], villager: [4, 1, 1] };
}

/** Library: long hall with tall windows and walls of bookshelves. */
function library(b, p) {
  const W = 11;
  const D = 7;
  foundation(b, p, W, D, p.floor);
  for (let x = 0; x < W; x++) {
    b.put(x, 0, 0, p.stoneAccent);
    b.put(x, 0, D - 1, p.stoneAccent);
  }
  walls(b, p, W, D, 1, 4, p.wall, (x, y, z) => {
    if (x === 5 && (z === 0 || z === D - 1)) return p.frame;
    if ((z === 0 || z === D - 1) && (x === 2 || x === 8) && y >= 2 && y <= 3)
      return p.window;
    if ((x === 0 || x === W - 1) && z === 3 && y >= 2 && y <= 3)
      return p.window;
    return undefined;
  });
  b.box(1, 1, 1, W - 2, 5, D - 2, 'air');
  beam(b, p, W, D, 5);
  if (p.flat) flatRoof(b, p, W, D, 5);
  else gableRoof(b, p, W, D, 5, true);
  b.door(5, 1, 0, p.door, 'n');
  b.put(5, 3, 0, p.trim);
  b.stair(5, 0, -1, p.step, 's');
  b.put(4, 1, -1, p.frame);
  b.put(4, 2, -1, 'lantern');
  // Bookshelves along the back and side walls.
  for (let x = 1; x < W - 1; x++) {
    if (x === 2 || x === 8) continue;
    b.box(x, 1, D - 2, x, 3, D - 2, 'bookshelf');
  }
  b.box(1, 1, 1, 1, 2, 2, 'bookshelf');
  b.box(W - 2, 1, 1, W - 2, 2, 2, 'bookshelf');
  b.put(4, 1, 3, 'cartography_table');
  b.put(6, 1, 3, 'crafting_table');
  b.put(5, 1, 3, 'lantern');
  b.put(2, 1, 4, 'chest:common_village');
  return { door: [5, 0], villager: [5, 1, 2] };
}

/** Church: nave with tall windows and a bell tower over the entrance. */
function church(b, p) {
  const W = 7;
  const D = 13;
  const T0 = 1; // tower x range 1..5, z range 0..4
  const T1 = 5;
  foundation(b, p, W, D, p.stoneAccent);
  // Nave walls (z 4..12), stone with tall windows.
  for (let y = 1; y <= 6; y++)
    for (let z = 4; z < D; z++)
      for (let x = 0; x < W; x++) {
        const edge = x === 0 || x === W - 1 || z === D - 1;
        if (!edge) continue;
        const corner = (x === 0 || x === W - 1) && (z === 4 || z === D - 1);
        let id = corner ? p.stoneAccent : p.stone;
        if (
          (x === 0 || x === W - 1) &&
          (z === 6 || z === 9) &&
          y >= 2 &&
          y <= 4
        )
          id = y === 3 ? 'stained_glass_yellow' : p.window;
        if (z === D - 1 && x === 3 && y >= 2 && y <= 5)
          id = 'stained_glass_light_blue';
        b.put(x, y, z, id);
      }
  b.box(1, 1, 5, W - 2, 6, D - 2, 'air');
  b.box(0, 0, 0, 0, 0, 3, 'air');
  b.box(W - 1, 0, 0, W - 1, 0, 3, 'air');
  // Nave roof: ridge along z from the tower to the apse.
  beam(b, p, W, D, 7, p.stone);
  b.box(0, 7, 0, W - 1, 7, 3, 'air');
  for (let k = 0; ; k++) {
    const lo = -1 + k;
    const hi = W - k;
    const y = 7 + k;
    if (lo > hi) break;
    for (let z = 4; z <= D; z++) {
      if (lo === hi) {
        b.put(lo, y, z, p.roofSlab);
        continue;
      }
      b.stair(lo, y, z, p.roof, 'e');
      b.stair(hi, y, z, p.roof, 'w');
    }
    if (k >= 1)
      for (let x = lo + 1; x <= hi - 1; x++) b.put(x, y, D - 1, p.stone);
    if (lo === hi || lo + 1 === hi) break;
  }
  // Tower (x 1..5, z 0..4) up to y 13 with belfry openings.
  for (let y = 1; y <= 13; y++)
    for (let z = 0; z <= 4; z++)
      for (let x = T0; x <= T1; x++) {
        const edge = x === T0 || x === T1 || z === 0 || z === 4;
        if (!edge) {
          b.put(x, y, z, 'air');
          continue;
        }
        const corner = (x === T0 || x === T1) && (z === 0 || z === 4);
        let id = corner ? p.stoneAccent : p.stone;
        const mid = x === 3 || z === 2;
        if (!corner && mid && y >= 10 && y <= 11) id = 'air';
        if (!corner && mid && y === 6 && z !== 4) id = p.window;
        b.put(x, y, z, id);
      }
  b.box(T0 + 1, 9, 1, T1 - 1, 9, 3, p.floor);
  b.put(3, 10, 2, 'gold_block');
  b.box(2, 1, 4, 4, 3, 4, 'air'); // arch into the nave
  pyramidRoof(b, p, T0, 0, T1, 4, 14, p.roofSlab);
  b.door(3, 1, 0, p.door, 'n');
  b.put(3, 3, 0, p.stoneAccent);
  b.stair(3, 0, -1, p.step, 's');
  // Pews and altar.
  for (const z of [6, 8]) {
    b.stair(1, 1, z, p.roof, 's');
    b.stair(2, 1, z, p.roof, 's');
    b.stair(4, 1, z, p.roof, 's');
    b.stair(5, 1, z, p.roof, 's');
  }
  b.put(3, 1, D - 3, p.stoneAccent);
  b.put(3, 2, D - 3, 'lantern');
  b.put(1, 1, D - 2, 'lantern');
  b.put(5, 1, D - 2, 'lantern');
  return { door: [3, 0], villager: [3, 1, 6] };
}

/** Village well: stone basin with water, log posts and a slab roof. */
export function buildWell(b, p) {
  // 6x6: rim ring at 1..4, water 2x2 at 2..3 down three blocks.
  for (let z = 1; z <= 4; z++)
    for (let x = 1; x <= 4; x++) {
      const inner = x >= 2 && x <= 3 && z >= 2 && z <= 3;
      b.box(x, -5, z, x, -3, z, p.foundation);
      for (let y = -2; y <= 0; y++)
        b.put(x, y, z, inner ? 'water' : p.foundation);
      b.put(x, 1, z, inner ? 'air' : p.foundation);
    }
  for (const [x, z] of [
    [1, 1],
    [4, 1],
    [1, 4],
    [4, 4],
  ]) {
    b.put(x, 2, z, p.frame);
    b.put(x, 3, z, p.frame);
  }
  b.box(1, 4, 1, 4, 4, 4, p.stoneSlab);
  b.put(2, 4, 2, p.stone);
  b.put(3, 4, 2, p.stone);
  b.put(2, 4, 3, p.stone);
  b.put(3, 4, 3, p.stone);
  b.put(2, 3, 2, 'lantern');
}

/**
 * Building catalogue. `w`/`d` are the local footprint, `big` buildings are
 * landmarks a village has at most one of.
 */
export const VILLAGE_BUILDINGS = {
  cottage: { w: 7, d: 6, door: 3, build: cottage },
  house: { w: 9, d: 7, door: 3, build: house },
  two_storey: { w: 9, d: 7, door: 4, build: twoStorey, max: 2 },
  farm: {
    w: 11,
    d: 9,
    door: 5,
    build: (b, p, rng) => farm(b, p, rng, 11),
    max: 3,
  },
  small_farm: {
    w: 7,
    d: 9,
    door: 3,
    build: (b, p, rng) => farm(b, p, rng, 7),
    max: 2,
  },
  blacksmith: { w: 9, d: 8, door: 4, build: blacksmith, max: 1 },
  library: { w: 11, d: 7, door: 5, build: library, max: 1 },
  church: { w: 7, d: 13, door: 3, build: church, max: 1 },
};
