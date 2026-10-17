/**
 * StructurePlanner — decides where villages and wilderness structures go.
 *
 * Everything here is a pure function of the seed and the terrain sampler,
 * so the chunk worker (which keeps trees out of building plots) and the
 * main thread (which writes the blocks) always agree, no matter in which
 * order chunks load or how often they reload.
 */
import { getTerrainSampler, SEA_LEVEL } from '../../voxel/gen/terrain.js';
import { BIOME_BY_ID, biomeMatches } from '../../data/biomes.js';
import { STRUCTURES } from './StructureRegistry.js';
import {
  Blueprint,
  VILLAGE_BUILDINGS,
  VILLAGE_STYLES,
  buildWell,
  villageStyleForBiome,
} from './village/VillageBuildings.js';

const CHUNK = 16;
// Villages: at most one per REGION² chunks, anchored at least INSET chunks
// from the region edge so neighbouring villages never overlap.
const REGION = 10;
const INSET = 3;
const VILLAGE_CHANCE = 0.75;
const VILLAGE_RADIUS = 40;
// Trees keep this far from buildings and roads.
const TREE_MARGIN = 4;

const CORRUPTION_KEYS = ['virus_nexus', 'corrupted_lab', 'crashed_beacon'];

/**
 * Wilderness structures and where they fit. Village buildings, theme-park
 * rides and lone market stalls are left out: they look out of place alone.
 */
const WILD_STRUCTURES = [
  {
    key: 'ruined_tower',
    biomes: ['plains', 'forest', 'taiga', 'windswept_hills', 'birch_forest'],
  },
  { key: 'desert_pyramid', biomes: ['desert'] },
  { key: 'desert_oasis_shrine', biomes: ['desert'] },
  { key: 'desert_well', biomes: ['desert', 'badlands'] },
  { key: 'igloo', biomes: ['snowy_plains', 'snowy_taiga', 'grove'] },
  {
    key: 'forest_shrine',
    biomes: ['forest', 'birch_forest', 'dark_forest', 'swamp', 'flower_forest'],
  },
  {
    key: 'abandoned_camp',
    biomes: ['forest', 'taiga', 'savanna', 'plains', 'birch_forest'],
  },
  {
    key: 'stone_henge',
    biomes: ['plains', 'meadow', 'sunflower_plains', 'windswept_hills'],
  },
  { key: 'windmill_outpost', biomes: ['plains', 'meadow', 'sunflower_plains'] },
  {
    key: 'mine_entrance',
    biomes: ['windswept_hills', 'taiga', 'badlands', 'grove'],
  },
  { key: 'graveyard_crypt', biomes: ['dark_forest', 'plains', 'taiga'] },
  {
    key: 'orchard_grove',
    biomes: ['plains', 'meadow', 'flower_forest', 'cherry_grove'],
  },
  { key: 'wizard_tower', biomes: ['dark_forest', 'forest', 'swamp'] },
  { key: 'ancient_temple', biomes: ['jungle', 'sparse_jungle'] },
  { key: 'broken_statue', biomes: ['plains', 'savanna', 'forest', 'meadow'] },
  { key: 'castle', biomes: ['windswept_hills'] },
];

function getNumericSeed(seedString) {
  const numeric = Number(seedString);
  if (Number.isFinite(numeric)) return Math.floor(Math.abs(numeric)) + 1;
  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0) + 1;
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectsOverlap(a, b, gap = 0) {
  return (
    a.x0 - gap <= b.x1 &&
    a.x1 + gap >= b.x0 &&
    a.z0 - gap <= b.z1 &&
    a.z1 + gap >= b.z0
  );
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

// Direction vectors: n = -z, e = +x, s = +z, w = -x.
const DIR_VEC = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const ROT_FOR_FRONT = { n: 0, e: 1, s: 2, w: 3 };

export class StructurePlanner {
  constructor(seedString) {
    this.seedString = String(seedString);
    this.seed = getNumericSeed(this.seedString);
    this.sampler = getTerrainSampler(this.seedString);
    this.heights = new Map();
    this.villages = new Map(); // "rx|rz" -> plan | null
    this.randoms = new Map(); // "cx|cz|corrupt" -> plan | null
    this.exclusions = new Map();
  }

  /** Same hash as WorldTerrainService.hash2D. */
  hash2D(x, z) {
    const v = Math.sin(x * 127.1 + z * 311.7 + this.seed) * 43758.5453;
    return v - Math.floor(v);
  }

  height(x, z) {
    const key = (x + 1048576) * 2097152 + (z + 1048576);
    let h = this.heights.get(key);
    if (h === undefined) {
      if (this.heights.size > 200000) this.heights.clear();
      h = this.sampler.height(x, z);
      this.heights.set(key, h);
    }
    return h;
  }

  biomeId(x, z) {
    return this.sampler.biomeId(x, z, this.height(x, z));
  }

  // -------------------------------------------------------------------------
  // Villages
  // -------------------------------------------------------------------------

  /** The village plan of region (rx, rz), or null. Cached. */
  villageInRegion(rx, rz) {
    const key = `${rx}|${rz}`;
    if (this.villages.has(key)) return this.villages.get(key);
    let plan = null;
    if (this.hash2D(rx * 53 + 17, rz * 59 - 31) < VILLAGE_CHANCE) {
      const span = REGION - 2 * INSET;
      const cx =
        rx * REGION +
        INSET +
        Math.floor(this.hash2D(rx * 7 + 3, rz * 11) * span);
      const cz =
        rz * REGION +
        INSET +
        Math.floor(this.hash2D(rx * 13, rz * 5 + 9) * span);
      plan = this.planVillage(cx, cz);
    }
    if (this.villages.size > 512) this.villages.clear();
    this.villages.set(key, plan);
    return plan;
  }

  /** Village anchored in chunk column (cx, cz), or null. */
  villageAnchoredAt(cx, cz) {
    const plan = this.villageInRegion(
      Math.floor(cx / REGION),
      Math.floor(cz / REGION)
    );
    return plan && plan.cx === cx && plan.cz === cz ? plan : null;
  }

  /** Villages whose area may reach the block rectangle. */
  villagesNear(x0, z0, x1, z1) {
    const out = [];
    const span = REGION * CHUNK;
    const rx0 = Math.floor((x0 - VILLAGE_RADIUS - 16) / span);
    const rx1 = Math.floor((x1 + VILLAGE_RADIUS + 16) / span);
    const rz0 = Math.floor((z0 - VILLAGE_RADIUS - 16) / span);
    const rz1 = Math.floor((z1 + VILLAGE_RADIUS + 16) / span);
    for (let rx = rx0; rx <= rx1; rx++)
      for (let rz = rz0; rz <= rz1; rz++) {
        const plan = this.villageInRegion(rx, rz);
        if (plan && rectsOverlap(plan.bounds, { x0, z0, x1, z1 }))
          out.push(plan);
      }
    return out;
  }

  /** Checks the site and lays out a village centred in chunk (cx, cz). */
  planVillage(cx, cz) {
    if (Math.abs(cx) <= 4 && Math.abs(cz) <= 4) return null; // keep spawn free
    const X = cx * CHUNK + 8;
    const Z = cz * CHUNK + 8;
    const centreBiome = this.biomeId(X, Z);
    const styleId = villageStyleForBiome(centreBiome);
    if (!styleId) return null;
    const H = this.height(X, Z);
    if (H <= SEA_LEVEL + 1) return null;

    // Plaza must be fairly flat and the surroundings mostly the same style.
    let same = 0;
    let total = 0;
    for (let r = 6; r <= 30; r += 12) {
      for (let a = 0; a < 12; a++) {
        const x = Math.round(X + Math.cos((a / 12) * Math.PI * 2) * r);
        const z = Math.round(Z + Math.sin((a / 12) * Math.PI * 2) * r);
        const h = this.height(x, z);
        if (r === 6 && (Math.abs(h - H) > 2 || h <= SEA_LEVEL)) return null;
        total++;
        if (
          h > SEA_LEVEL &&
          villageStyleForBiome(this.biomeId(x, z)) === styleId
        )
          same++;
      }
    }
    if (same / total < 0.7) return null;

    const rng = rngFrom(
      Math.floor(this.hash2D(X * 0.37, Z * 0.53) * 4294967296)
    );
    const style = VILLAGE_STYLES[styleId];
    const plan = {
      id: `village:${X}:${Z}`,
      cx,
      cz,
      x: X,
      z: Z,
      plazaY: H,
      styleId,
      biomeId: centreBiome,
      buildings: [],
      roads: new Map(), // "x|z" -> y
      lamps: [],
      occupied: [], // rects that buildings may not overlap
      bounds: null,
    };
    // Plaza (11x11) with the well in the middle.
    const plaza = { x0: X - 5, z0: Z - 5, x1: X + 5, z1: Z + 5 };
    plan.occupied.push(plaza);
    for (let x = plaza.x0; x <= plaza.x1; x++)
      for (let z = plaza.z0; z <= plaza.z1; z++) plan.roads.set(`${x}|${z}`, H);
    plan.well = { x0: X - 3, z0: Z - 3, y: H };

    // Roads radiate from the plaza; buildings line both sides facing them.
    const dirs = ['n', 'e', 's', 'w'];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    const counts = {};
    const queue = this.buildingQueue(rng, styleId);
    let roadsBuilt = 0;
    for (const dir of dirs) {
      if (roadsBuilt >= 2 && rng() < 0.2) continue;
      const len = 20 + Math.floor(rng() * 16);
      const road = this.traceRoad(plan, X, Z, H, dir, len);
      if (road.length < 8) continue;
      roadsBuilt++;
      for (const side of [-1, 1]) {
        let s = 2 + Math.floor(rng() * 2);
        while (s < road.length - 3) {
          const placed = this.tryPlaceAlongRoad(
            plan,
            dir,
            side,
            road,
            s,
            queue,
            counts,
            style,
            rng
          );
          s += placed ? placed + 3 : 3;
          if (plan.buildings.length >= 16) break;
        }
      }
    }
    // Lamp posts at the plaza corners and road ends.
    for (const [dx, dz] of [
      [-5, -5],
      [5, -5],
      [-5, 5],
      [5, 5],
    ])
      plan.lamps.push([X + dx, Z + dz]);

    if (plan.buildings.length < 4) return null;
    let b = { x0: plaza.x0, z0: plaza.z0, x1: plaza.x1, z1: plaza.z1 };
    for (const bd of plan.buildings) {
      b = {
        x0: Math.min(b.x0, bd.rect.x0 - 2),
        z0: Math.min(b.z0, bd.rect.z0 - 2),
        x1: Math.max(b.x1, bd.rect.x1 + 2),
        z1: Math.max(b.z1, bd.rect.z1 + 2),
      };
    }
    for (const key of plan.roads.keys()) {
      const [x, z] = key.split('|').map(Number);
      b = {
        x0: Math.min(b.x0, x - 1),
        z0: Math.min(b.z0, z - 1),
        x1: Math.max(b.x1, x + 1),
        z1: Math.max(b.z1, z + 1),
      };
    }
    plan.bounds = b;
    return plan;
  }

  buildingQueue(rng, styleId) {
    const landmarks = ['blacksmith', 'library', 'church'].filter(
      () => rng() < 0.8
    );
    const common =
      styleId === 'desert'
        ? ['cottage', 'house', 'cottage', 'two_storey', 'small_farm', 'house']
        : [
            'house',
            'cottage',
            'farm',
            'two_storey',
            'cottage',
            'house',
            'small_farm',
            'farm',
          ];
    const queue = [];
    // Interleave so landmarks land near the plaza but not all at once.
    while (landmarks.length || queue.length < 24) {
      if (landmarks.length && rng() < 0.5) queue.push(landmarks.shift());
      else queue.push(common[Math.floor(rng() * common.length)]);
      if (queue.length > 40) break;
    }
    return queue;
  }

  /** Road cells (centre line) from the plaza edge outward; stops at water/cliffs. */
  traceRoad(plan, X, Z, H, dir, len) {
    const [ux, uz] = DIR_VEC[dir];
    const [vx, vz] = [-uz, ux];
    const cells = [];
    let prev = H;
    for (let i = 6; i < 6 + len; i++) {
      const x = X + ux * i;
      const z = Z + uz * i;
      const h = this.height(x, z);
      if (h <= SEA_LEVEL) break;
      if (Math.abs(h - prev) > 1) break;
      const hl = this.height(x + vx, z + vz);
      const hr = this.height(x - vx, z - vz);
      if (hl <= SEA_LEVEL || hr <= SEA_LEVEL) break;
      cells.push({ x, z, h });
      prev = h;
    }
    for (const c of cells)
      for (const o of [-1, 0, 1]) {
        const x = c.x + vx * o;
        const z = c.z + vz * o;
        plan.roads.set(`${x}|${z}`, this.height(x, z));
      }
    if (cells.length) {
      const end = cells[cells.length - 1];
      plan.lamps.push([end.x + vx * 2, end.z + vz * 2]);
      const xs = cells.map((c) => c.x);
      const zs = cells.map((c) => c.z);
      plan.occupied.push({
        x0: Math.min(...xs) - 1,
        z0: Math.min(...zs) - 1,
        x1: Math.max(...xs) + 1,
        z1: Math.max(...zs) + 1,
      });
    }
    return cells;
  }

  /** Tries buildings from the queue at road position s. Returns width used. */
  tryPlaceAlongRoad(plan, dir, side, road, s, queue, counts, style, rng) {
    const [ux, uz] = DIR_VEC[dir];
    // v points from the road towards the building side.
    const vx = -uz * side;
    const vz = ux * side;
    const front = vx === 1 ? 'w' : vx === -1 ? 'e' : vz === 1 ? 'n' : 's'; // faces road
    const attempts = [queue[0], 'cottage', 'small_farm'];
    for (let a = 0; a < attempts.length; a++) {
      const type = attempts[a];
      const def = VILLAGE_BUILDINGS[type];
      if (!def) continue;
      if (def.max && (counts[type] ?? 0) >= def.max) continue;
      if (s + def.w > road.length) continue;
      // Local frame: W along the road, D away from it, front wall 4 from
      // the road centre (road edge, a path block and the front step).
      const start = road[s];
      const corners = [];
      for (const [along, away] of [
        [0, 4],
        [def.w - 1, 4],
        [0, 4 + def.d - 1],
        [def.w - 1, 4 + def.d - 1],
      ]) {
        corners.push([
          start.x + ux * along + vx * away,
          start.z + uz * along + vz * away,
        ]);
      }
      const rect = {
        x0: Math.min(...corners.map((c) => c[0])),
        z0: Math.min(...corners.map((c) => c[1])),
        x1: Math.max(...corners.map((c) => c[0])),
        z1: Math.max(...corners.map((c) => c[1])),
      };
      if (plan.occupied.some((o) => rectsOverlap(rect, o, 1))) continue;
      if (
        Math.max(Math.abs(rect.x0 - plan.x), Math.abs(rect.x1 - plan.x)) >
          VILLAGE_RADIUS ||
        Math.max(Math.abs(rect.z0 - plan.z), Math.abs(rect.z1 - plan.z)) >
          VILLAGE_RADIUS
      )
        continue;
      const flush = type.endsWith('farm');
      const site = this.checkPlot(rect, plan.styleId, flush ? 2 : 3);
      if (!site) continue;
      const rot = ROT_FOR_FRONT[front];
      const ground = site.median;
      plan.buildings.push({
        type,
        rect,
        rot,
        front,
        floorY: flush ? ground : ground + 1,
        groundY: ground,
        seed: Math.floor(rng() * 4294967296),
      });
      plan.occupied.push({
        x0: rect.x0 - 1,
        z0: rect.z0 - 1,
        x1: rect.x1 + 1,
        z1: rect.z1 + 1,
      });
      counts[type] = (counts[type] ?? 0) + 1;
      if (a === 0) queue.shift();
      // Path from the door to the road (the cell between step and road).
      const bp = new Blueprint(def.w, def.d, rot, rect.x0, 0, rect.z0);
      const [px, pz] = bp.world(def.door, -2);
      plan.roads.set(`${px}|${pz}`, ground);
      return def.w;
    }
    return 0;
  }

  /** Plot must be dry land, gently sloped and in the village's biome style. */
  checkPlot(rect, styleId, maxRange) {
    const hs = [];
    for (let x = rect.x0; x <= rect.x1; x += 2)
      for (let z = rect.z0; z <= rect.z1; z += 2) hs.push(this.height(x, z));
    for (const [x, z] of [
      [rect.x1, rect.z1],
      [rect.x0, rect.z1],
      [rect.x1, rect.z0],
    ])
      hs.push(this.height(x, z));
    const lo = Math.min(...hs);
    const hi = Math.max(...hs);
    if (lo <= SEA_LEVEL || hi - lo > maxRange) return null;
    const mx = (rect.x0 + rect.x1) >> 1;
    const mz = (rect.z0 + rect.z1) >> 1;
    if (villageStyleForBiome(this.biomeId(mx, mz)) !== styleId) return null;
    return { median: median(hs) };
  }

  /**
   * World writes for a village, in order: terrain grading, roads, the well,
   * buildings, lamp posts. Each write is [x, y, z, id].
   */
  buildVillage(plan) {
    const style = VILLAGE_STYLES[plan.styleId];
    const writes = new Map();
    const set = (x, y, z, id) => writes.set(`${x}|${y}|${z}`, [x, y, z, id]);
    const surface = style.ground;
    const groundOverride = new Map();

    // Grade a rectangle to `groundY` with a blended ring around it.
    const grade = (rect, groundY, clearTo) => {
      for (let x = rect.x0 - 2; x <= rect.x1 + 2; x++)
        for (let z = rect.z0 - 2; z <= rect.z1 + 2; z++) {
          const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
          const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
          const ring = Math.max(dx, dz);
          const natural = this.height(x, z);
          if (ring === 2 && plan.roads.has(`${x}|${z}`)) continue;
          const target =
            ring <= 1 ? groundY : Math.round((groundY + natural) / 2);
          if (natural > target) {
            const top = ring === 0 ? Math.max(natural, clearTo) : natural + 1;
            for (let y = target + 1; y <= top; y++) set(x, y, z, 'air');
          } else {
            for (let y = natural; y < target; y++) set(x, y, z, 'dirt');
          }
          set(x, target, z, surface);
          if (ring === 0) {
            // Inside the plot clear everything above the ground for trees
            // and plants of neighbouring chunks.
            for (let y = target + 1; y <= clearTo; y++) set(x, y, z, 'air');
          }
          groundOverride.set(`${x}|${z}`, target);
        }
    };

    for (const bd of plan.buildings) {
      const height =
        bd.type === 'church' ? 20 : bd.type === 'two_storey' ? 15 : 11;
      grade(bd.rect, bd.groundY, bd.floorY + height);
    }
    grade(
      { x0: plan.x - 4, z0: plan.z - 4, x1: plan.x + 4, z1: plan.z + 4 },
      plan.plazaY,
      plan.plazaY + 8
    );

    // Roads: path blocks on the (graded) ground, plants cleared above.
    for (const [key, h] of plan.roads) {
      const [x, z] = key.split('|').map(Number);
      const y = groundOverride.get(key) ?? h;
      if (y <= SEA_LEVEL) continue;
      const roll = this.hash2D(x * 3.1, z * 1.7);
      set(
        x,
        y,
        z,
        roll < 0.08 ? 'gravel' : roll < 0.12 ? 'cobblestone' : style.path
      );
      set(x, y + 1, z, 'air');
      set(x, y + 2, z, 'air');
    }

    // Well in the middle of the plaza.
    const well = new Blueprint(
      6,
      6,
      0,
      plan.well.x0,
      plan.well.y,
      plan.well.z0
    );
    buildWell(well, style);
    for (const b of well.list()) set(b.x, b.y, b.z, b.id);

    // Buildings, with foundations reaching down to the ground.
    plan.doors = [];
    for (const bd of plan.buildings) {
      const def = VILLAGE_BUILDINGS[bd.type];
      const bp = new Blueprint(
        def.w,
        def.d,
        bd.rot,
        bd.rect.x0,
        bd.floorY,
        bd.rect.z0
      );
      const info = def.build(bp, style, rngFrom(bd.seed));
      for (const b of bp.list()) set(b.x, b.y, b.z, b.id);
      if (!info.flush) {
        for (let lx = 0; lx < def.w; lx++)
          for (let lz = 0; lz < def.d; lz++) {
            const [x, z] = bp.world(lx, lz);
            const ground = groundOverride.get(`${x}|${z}`) ?? this.height(x, z);
            for (let y = ground; y < bd.floorY; y++)
              set(
                x,
                y,
                z,
                lx === 0 || lz === 0 || lx === def.w - 1 || lz === def.d - 1
                  ? style.foundation
                  : 'dirt'
              );
          }
      }
      if (info.villager) {
        const [vx, vz] = bp.world(info.villager[0], info.villager[2]);
        plan.doors.push({ x: vx, y: bd.floorY + info.villager[1], z: vz });
      }
    }

    // Lamp posts.
    for (const [x, z] of plan.lamps) {
      const key = `${x}|${z}`;
      if (
        plan.buildings.some((bd) =>
          rectsOverlap(bd.rect, { x0: x, z0: z, x1: x, z1: z }, 1)
        )
      )
        continue;
      const y = (groundOverride.get(key) ?? this.height(x, z)) + 1;
      if (y <= SEA_LEVEL + 1) continue;
      set(x, y - 1, z, style.foundation);
      set(x, y, z, style.stone);
      set(x, y + 1, z, style.frame);
      set(x, y + 2, z, style.frame);
      set(x, y + 3, z, 'lantern');
    }
    return [...writes.values()];
  }

  // -------------------------------------------------------------------------
  // Wilderness structures
  // -------------------------------------------------------------------------

  structureScore(cx, cz) {
    return this.hash2D(cx * 47 + 113, cz * 47 - 271);
  }

  isStructureAnchor(cx, cz, radius = 5) {
    const score = this.structureScore(cx, cz);
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (this.structureScore(cx + dx, cz + dz) >= score) return false;
      }
    return true;
  }

  /** Wilderness structure anchored in chunk (cx, cz), or null. Cached. */
  randomStructureAt(cx, cz, corruptionEnabled = false) {
    const key = `${cx}|${cz}|${corruptionEnabled ? 1 : 0}`;
    if (this.randoms.has(key)) return this.randoms.get(key);
    const plan = this.planRandom(cx, cz, corruptionEnabled);
    if (this.randoms.size > 4096) this.randoms.clear();
    this.randoms.set(key, plan);
    return plan;
  }

  planRandom(cx, cz, corruptionEnabled) {
    if (Math.abs(cx) <= 3 && Math.abs(cz) <= 3) return null;
    if (this.structureScore(cx, cz) < 0.88) return null;
    if (!this.isStructureAnchor(cx, cz, 5)) return null;
    const x = cx * CHUNK + 8;
    const z = cz * CHUNK + 8;
    const biome = BIOME_BY_ID.get(this.biomeId(x, z));
    if (!biome) return null;
    let pool = WILD_STRUCTURES.filter((s) =>
      s.biomes.some((id) => biomeMatches(biome, id))
    ).map((s) => s.key);
    if (corruptionEnabled) pool = pool.concat(CORRUPTION_KEYS);
    pool = pool.filter((k) => STRUCTURES[k]);
    if (pool.length === 0) return null;
    const structKey =
      pool[Math.floor(this.hash2D(x - 99, z + 88) * pool.length)];
    const struct = STRUCTURES[structKey];
    const rel = struct.blueprints(x, 0, z);
    if (!rel?.length) return null;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let maxY = -Infinity;
    for (const b of rel) {
      if (b.x < x0) x0 = b.x;
      if (b.z < z0) z0 = b.z;
      if (b.x > x1) x1 = b.x;
      if (b.z > z1) z1 = b.z;
      if (b.y > maxY) maxY = b.y;
    }
    const rect = { x0, z0, x1, z1 };
    // Dry, gentle ground only, and never inside a village.
    const hs = [];
    for (let px = x0 - 1; px <= x1 + 1; px += 2)
      for (let pz = z0 - 1; pz <= z1 + 1; pz += 2) hs.push(this.height(px, pz));
    const lo = Math.min(...hs);
    const hi = Math.max(...hs);
    const size = Math.max(x1 - x0, z1 - z0);
    if (lo <= SEA_LEVEL + 1 || hi - lo > (size <= 5 ? 3 : 4)) return null;
    if (this.sampler.riverAt(x, z) > 0) return null;
    if (
      this.villagesNear(x0 - 24, z0 - 24, x1 + 24, z1 + 24).some((v) =>
        rectsOverlap(v.bounds, rect, 24)
      )
    )
      return null;
    return {
      id: `structure:${structKey}:${x}:${z}`,
      key: structKey,
      name: struct.name,
      x,
      z,
      y: median(hs) + 1,
      rect,
      height: maxY,
    };
  }

  // -------------------------------------------------------------------------
  // Tree exclusion for the chunk generator
  // -------------------------------------------------------------------------

  /** Uint8Array(256), 1 where trees and tall plants must not grow. */
  treeExclusion(cx, cz, corruptionEnabled = false) {
    const key = `${cx}|${cz}|${corruptionEnabled ? 1 : 0}`;
    let mask = this.exclusions.get(key);
    if (mask !== undefined) return mask;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = x0 + CHUNK - 1;
    const z1 = z0 + CHUNK - 1;
    const rects = [];
    for (const v of this.villagesNear(x0, z0, x1, z1)) {
      for (const bd of v.buildings) rects.push(bd.rect);
      rects.push({ x0: v.x - 5, z0: v.z - 5, x1: v.x + 5, z1: v.z + 5 });
      for (const k of v.roads.keys()) {
        const [x, z] = k.split('|').map(Number);
        if (x < x0 - TREE_MARGIN || x > x1 + TREE_MARGIN) continue;
        if (z < z0 - TREE_MARGIN || z > z1 + TREE_MARGIN) continue;
        rects.push({ x0: x + 2, z0: z + 2, x1: x - 2, z1: z - 2, road: true });
      }
    }
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const s = this.randomStructureAt(cx + dx, cz + dz, corruptionEnabled);
        if (s) rects.push(s.rect);
      }
    mask = null;
    for (const r of rects) {
      const m = r.road ? 0 : TREE_MARGIN;
      const rx0 = Math.min(r.x0, r.x1) - m;
      const rx1 = Math.max(r.x0, r.x1) + m;
      const rz0 = Math.min(r.z0, r.z1) - m;
      const rz1 = Math.max(r.z0, r.z1) + m;
      if (rx1 < x0 || rx0 > x1 || rz1 < z0 || rz0 > z1) continue;
      mask ??= new Uint8Array(CHUNK * CHUNK);
      for (let x = Math.max(rx0, x0); x <= Math.min(rx1, x1); x++)
        for (let z = Math.max(rz0, z0); z <= Math.min(rz1, z1); z++)
          mask[x - x0 + (z - z0) * CHUNK] = 1;
    }
    if (this.exclusions.size > 2048) this.exclusions.clear();
    this.exclusions.set(key, mask);
    return mask;
  }
}

const planners = new Map();

/** Shared planner per seed. */
export function getStructurePlanner(seedString) {
  const key = String(seedString);
  let planner = planners.get(key);
  if (!planner) {
    if (planners.size > 4) planners.clear();
    planner = new StructurePlanner(key);
    planners.set(key, planner);
  }
  return planner;
}
