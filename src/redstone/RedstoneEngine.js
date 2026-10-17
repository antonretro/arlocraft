/**
 * RedstoneEngine — redstone simulation on a fixed 10 Hz "redstone tick".
 *
 * Model (a simplified version of Minecraft's):
 * - Sources emit 0-15: redstone_block, lever / buttons / pressure plates
 *   while active, redstone torches while lit, daylight detectors, and the
 *   fronts of repeaters, comparators and observers.
 * - redstone_wire carries power, losing 1 per block; it also steps up and
 *   down one block.
 * - A solid block next to a source (or under a lit torch's... above it) is
 *   "strongly powered" and itself powers wire and components around it.
 *   Wire only "weakly" powers the block it sits on and the blocks it
 *   touches: enough for lamps, pistons and doors, not for more wire.
 * - Repeaters, comparators, torches and observers act after a delay;
 *   wire updates instantly within a tick.
 * - Consumers react to being powered: lamps, pistons, doors, trapdoors,
 *   note blocks, TNT and command blocks.
 *
 * Directional parts carry their facing in the id (`repeater_n`,
 * `piston_e`, ...). The facing is the direction the part outputs towards
 * (pistons: the direction they push). Per-block state (lever on, repeater
 * delay, comparator mode, piston extended) lives in world.state.blockData
 * under `${key}:<field>` so it is saved with the world.
 */

const TICK_SECONDS = 0.1;
const MAX_EVALUATIONS_PER_TICK = 6000;
const PISTON_PUSH_LIMIT = 12;

const DIRS = {
  n: [0, 0, -1],
  s: [0, 0, 1],
  e: [1, 0, 0],
  w: [-1, 0, 0],
  u: [0, 1, 0],
  d: [0, -1, 0],
};
const SIDES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const DIRECTIONAL = new Set([
  'repeater',
  'comparator',
  'observer',
  'piston',
  'sticky_piston',
]);
const BUTTON_TICKS = { stone_button: 10, oak_button: 15 };
const PLATES = new Set(['stone_pressure_plate', 'oak_pressure_plate']);

/** Splits `repeater_n` into { base: 'repeater', dir: 'n' }. */
export function parseRedstoneId(id) {
  if (!id) return { base: null, dir: null, open: false };
  const open = id.includes(':open');
  const plain = id.replace(':open', '');
  const m = plain.match(/^(.*)_([nsewud])$/);
  if (m && DIRECTIONAL.has(m[1])) return { base: m[1], dir: m[2], open };
  return { base: plain, dir: null, open };
}

/** Every block id the engine cares about (used to wake chunks on load). */
export const REDSTONE_BASE_IDS = new Set([
  'redstone_wire',
  'redstone_block',
  'redstone_torch',
  'redstone_torch_off',
  'lever',
  'stone_button',
  'oak_button',
  'stone_pressure_plate',
  'oak_pressure_plate',
  'daylight_detector',
  'repeater',
  'comparator',
  'observer',
  'piston',
  'sticky_piston',
  'redstone_lamp',
  'redstone_lamp_on',
  'note_block',
  'tnt',
  'command_block',
]);

export class RedstoneEngine {
  constructor(world) {
    this.world = world;
    this.wire = new Map(); // key -> wire level (0-15)
    this.outputs = new Map(); // key -> current output of delayed parts
    this.dirty = new Set(); // keys to evaluate this tick
    this.scheduled = []; // { due, x, y, z, action }
    this.tickCount = 0;
    this.accumulator = 0;
    this.lastTime = 0;
    this.daylightDetectors = new Set(); // keys
    this.activePlates = new Map(); // key -> ticks left
    this.lastPowered = new Map(); // key -> boolean (consumer edge detection)
  }

  // ─── helpers ──────────────────────────────────────────────────────

  key(x, y, z) {
    return this.world.coords.getKey(x, y, z);
  }

  idAt(x, y, z) {
    return this.world.getBlockAt(x, y, z);
  }

  data(x, y, z, field) {
    return this.world.state.blockData.get(`${this.key(x, y, z)}:${field}`);
  }

  setData(x, y, z, field, value) {
    this.world.state.blockData.set(`${this.key(x, y, z)}:${field}`, value);
  }

  isSolid(id) {
    if (!id) return false;
    const { base } = parseRedstoneId(id);
    if (
      REDSTONE_BASE_IDS.has(base) &&
      base !== 'redstone_lamp' &&
      base !== 'redstone_lamp_on' &&
      base !== 'note_block' &&
      base !== 'command_block' &&
      base !== 'tnt'
    ) {
      return false;
    }
    return this.world.isBlockSolid(id);
  }

  markAround(x, y, z) {
    this.dirty.add(this.key(x, y, z));
    for (const [dx, dy, dz] of SIDES) {
      this.dirty.add(this.key(x + dx, y + dy, z + dz));
      // Wire climbs blocks, so its diagonal neighbours care too.
      if (dy === 0) {
        this.dirty.add(this.key(x + dx, y + 1, z + dz));
        this.dirty.add(this.key(x + dx, y - 1, z + dz));
      }
    }
  }

  schedule(x, y, z, delayTicks, action) {
    this.scheduled.push({
      due: this.tickCount + Math.max(1, delayTicks),
      x,
      y,
      z,
      action,
    });
  }

  // ─── power queries ───────────────────────────────────────────────

  /** Power that the block at (sx,sy,sz) sends into the neighbour (tx,ty,tz). */
  emitted(sx, sy, sz, tx, ty, tz) {
    const id = this.idAt(sx, sy, sz);
    if (!id) return 0;
    const { base, dir } = parseRedstoneId(id);
    switch (base) {
      case 'redstone_block':
        return 15;
      case 'lever':
      case 'stone_button':
      case 'oak_button':
        return this.data(sx, sy, sz, 'active') ? 15 : 0;
      case 'stone_pressure_plate':
      case 'oak_pressure_plate':
        return this.activePlates.has(this.key(sx, sy, sz)) ? 15 : 0;
      case 'daylight_detector':
        return this.outputs.get(this.key(sx, sy, sz)) ?? 0;
      case 'redstone_torch':
        // A torch never powers the block it stands on.
        return ty === sy - 1 && tx === sx && tz === sz ? 0 : 15;
      case 'repeater':
      case 'comparator': {
        const [dx, dy, dz] = DIRS[dir] ?? DIRS.n;
        if (tx !== sx + dx || ty !== sy + dy || tz !== sz + dz) return 0;
        return this.outputs.get(this.key(sx, sy, sz)) ?? 0;
      }
      case 'observer': {
        // Observers look forward and pulse out of their back.
        const [dx, dy, dz] = DIRS[dir] ?? DIRS.n;
        if (tx !== sx - dx || ty !== sy - dy || tz !== sz - dz) return 0;
        return this.outputs.get(this.key(sx, sy, sz)) ?? 0;
      }
      default:
        return 0;
    }
  }

  /** Strong power of a solid block: from sources and gates touching it. */
  strongPower(x, y, z) {
    let best = 0;
    for (const [dx, dy, dz] of SIDES) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      const { base } = parseRedstoneId(this.idAt(nx, ny, nz));
      if (base === 'redstone_wire') continue;
      // Torches strongly power only the block above them.
      if (base === 'redstone_torch' && !(dy === -1)) continue;
      best = Math.max(best, this.emitted(nx, ny, nz, x, y, z));
      if (best >= 15) break;
    }
    return best;
  }

  /** Weak power of a solid block: wire on top of or pointing into it. */
  weakPower(x, y, z) {
    let best = this.strongPower(x, y, z);
    const above = this.wire.get(this.key(x, y + 1, z)) ?? 0;
    best = Math.max(best, above);
    for (const [dx, dy, dz] of SIDES) {
      if (dy !== 0) continue;
      best = Math.max(best, this.wire.get(this.key(x + dx, y, z + dz)) ?? 0);
    }
    return best;
  }

  /**
   * Input power arriving at a component from one neighbour position. `forWire`
   * excludes weak power, because wire cannot be powered through blocks that
   * are only weakly powered.
   */
  inputFrom(nx, ny, nz, tx, ty, tz, forWire = false) {
    const id = this.idAt(nx, ny, nz);
    if (!id) return 0;
    const { base } = parseRedstoneId(id);
    if (base === 'redstone_wire')
      return this.wire.get(this.key(nx, ny, nz)) ?? 0;
    const direct = this.emitted(nx, ny, nz, tx, ty, tz);
    if (direct > 0) return direct;
    if (this.isSolid(id)) {
      return forWire
        ? this.strongPower(nx, ny, nz)
        : this.weakPower(nx, ny, nz);
    }
    return 0;
  }

  /** Highest power reaching a consumer from any side. */
  receivedPower(x, y, z) {
    let best = 0;
    for (const [dx, dy, dz] of SIDES) {
      best = Math.max(best, this.inputFrom(x + dx, y + dy, z + dz, x, y, z));
      if (best >= 15) break;
    }
    return best;
  }

  getWirePower(x, y, z) {
    return this.wire.get(this.key(x, y, z)) ?? 0;
  }

  // ─── evaluation ───────────────────────────────────────────────────

  evaluate(key) {
    const [x, y, z] = this.world.coords.keyToCoords(key);
    const id = this.idAt(x, y, z);
    if (!id) {
      if (this.wire.delete(key) || this.outputs.delete(key))
        this.markAround(x, y, z);
      this.lastPowered.delete(key);
      return;
    }
    const { base, dir, open } = parseRedstoneId(id);

    switch (base) {
      case 'redstone_wire':
        return this.evaluateWire(key, x, y, z);
      case 'redstone_torch':
      case 'redstone_torch_off': {
        const lit = base === 'redstone_torch';
        const below = this.idAt(x, y - 1, z);
        const attachedPowered =
          below && this.isSolid(below)
            ? this.weakPower(x, y - 1, z) > 0
            : false;
        if (attachedPowered === lit) {
          this.schedule(x, y, z, 1, 'torch');
        }
        return;
      }
      case 'repeater': {
        const [dx, dy, dz] = DIRS[dir] ?? DIRS.n;
        const input = this.inputFrom(x - dx, y - dy, z - dz, x, y, z) > 0;
        const on = (this.outputs.get(key) ?? 0) > 0;
        if (input !== on && !this.data(x, y, z, 'pending')) {
          this.setData(x, y, z, 'pending', true);
          const delay = this.data(x, y, z, 'delay') ?? 1;
          this.schedule(x, y, z, delay, 'repeater');
        }
        return;
      }
      case 'comparator': {
        const out = this.comparatorOutput(x, y, z, dir);
        if (out !== (this.outputs.get(key) ?? 0))
          this.schedule(x, y, z, 1, 'comparator');
        return;
      }
      case 'daylight_detector': {
        this.daylightDetectors.add(key);
        return;
      }
      case 'redstone_lamp':
      case 'redstone_lamp_on': {
        const powered = this.receivedPower(x, y, z) > 0;
        const lit = base === 'redstone_lamp_on';
        if (powered && !lit) this.swap(x, y, z, 'redstone_lamp_on');
        else if (!powered && lit) this.schedule(x, y, z, 2, 'lamp_off');
        return;
      }
      case 'piston':
      case 'sticky_piston': {
        const powered = this.receivedPowerExceptFront(x, y, z, dir) > 0;
        const extended = Boolean(this.data(x, y, z, 'extended'));
        if (powered !== extended)
          this.schedule(x, y, z, 1, powered ? 'extend' : 'retract');
        return;
      }
      default:
        break;
    }

    // Edge-triggered consumers.
    const blockData = this.world.getBlockData(base);
    const isDoor =
      blockData?.renderType === 'door' || blockData?.renderType === 'trapdoor';
    if (
      isDoor ||
      base === 'note_block' ||
      base === 'tnt' ||
      base === 'command_block'
    ) {
      const power = this.receivedPower(x, y, z);
      const was = this.lastPowered.get(key) ?? false;
      const now = power > 0;
      if (now === was) return;
      this.lastPowered.set(key, now);
      if (isDoor) this.setDoorOpen(x, y, z, id, now, open);
      else if (now && base === 'note_block')
        this.world.game?.audio?.play('action-success');
      else if (now && base === 'tnt') this.ignite(x, y, z);
      else if (now && base === 'command_block')
        this.world.game?.commandBlocks?.run(x, y, z, power);
    }
  }

  evaluateWire(key, x, y, z) {
    let level = 0;
    for (const [dx, dy, dz] of SIDES) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      const nid = this.idAt(nx, ny, nz);
      const { base } = parseRedstoneId(nid);
      if (base === 'redstone_wire') {
        level = Math.max(level, (this.wire.get(this.key(nx, ny, nz)) ?? 0) - 1);
        continue;
      }
      level = Math.max(level, this.inputFrom(nx, ny, nz, x, y, z, true));
      // Wire running up or down the side of a block.
      if (dy === 0) {
        const upCovered = this.isSolid(this.idAt(x, y + 1, z));
        if (
          !upCovered &&
          parseRedstoneId(this.idAt(nx, ny + 1, nz)).base === 'redstone_wire'
        ) {
          level = Math.max(
            level,
            (this.wire.get(this.key(nx, ny + 1, nz)) ?? 0) - 1
          );
        }
        if (
          !this.isSolid(nid) &&
          parseRedstoneId(this.idAt(nx, ny - 1, nz)).base === 'redstone_wire'
        ) {
          level = Math.max(
            level,
            (this.wire.get(this.key(nx, ny - 1, nz)) ?? 0) - 1
          );
        }
      }
    }
    level = Math.max(0, Math.min(15, level));
    const old = this.wire.get(key) ?? 0;
    if (level === old && this.wire.has(key)) return;
    this.wire.set(key, level);
    this.markAround(x, y, z);
    // Wire brightness is drawn per instance, so redraw its chunk.
    this.world.chunkManager?.onBlockChanged(x, y, z);
  }

  comparatorOutput(x, y, z, dir) {
    const [dx, dy, dz] = DIRS[dir] ?? DIRS.n;
    const back = this.inputFrom(x - dx, y - dy, z - dz, x, y, z);
    const s1 = this.inputFrom(x + dz, y, z - dx, x, y, z);
    const s2 = this.inputFrom(x - dz, y, z + dx, x, y, z);
    const side = Math.max(s1, s2);
    if (this.data(x, y, z, 'mode') === 'subtract')
      return Math.max(0, back - side);
    return back >= side ? back : 0;
  }

  receivedPowerExceptFront(x, y, z, dir) {
    const [fx, fy, fz] = DIRS[dir] ?? DIRS.u;
    let best = 0;
    for (const [dx, dy, dz] of SIDES) {
      if (dx === fx && dy === fy && dz === fz) continue;
      best = Math.max(best, this.inputFrom(x + dx, y + dy, z + dz, x, y, z));
    }
    return best;
  }

  // ─── actions ──────────────────────────────────────────────────────

  swap(x, y, z, id) {
    this.world.setBlockAt(x, y, z, id, { silent: true, skipParticles: true });
  }

  runScheduled(task) {
    const { x, y, z, action } = task;
    const key = this.key(x, y, z);
    const id = this.idAt(x, y, z);
    const { base, dir } = parseRedstoneId(id);
    switch (action) {
      case 'torch': {
        if (base !== 'redstone_torch' && base !== 'redstone_torch_off') return;
        const below = this.idAt(x, y - 1, z);
        const powered =
          below && this.isSolid(below)
            ? this.weakPower(x, y - 1, z) > 0
            : false;
        const target = powered ? 'redstone_torch_off' : 'redstone_torch';
        if (target !== id) this.swap(x, y, z, target);
        return;
      }
      case 'repeater': {
        if (base !== 'repeater') return;
        this.setData(x, y, z, 'pending', false);
        const [dx, dy, dz] = DIRS[dir] ?? DIRS.n;
        const input = this.inputFrom(x - dx, y - dy, z - dz, x, y, z) > 0;
        this.setOutput(key, x, y, z, input ? 15 : 0);
        return;
      }
      case 'comparator':
        if (base !== 'comparator') return;
        this.setOutput(key, x, y, z, this.comparatorOutput(x, y, z, dir));
        return;
      case 'observer_on':
        this.setOutput(key, x, y, z, 15);
        this.schedule(x, y, z, 1, 'observer_off');
        return;
      case 'observer_off':
        this.setOutput(key, x, y, z, 0);
        return;
      case 'button_off':
        this.setData(x, y, z, 'active', false);
        this.markAround(x, y, z);
        this.markAround(x, y - 1, z);
        return;
      case 'lamp_off':
        if (base === 'redstone_lamp_on' && this.receivedPower(x, y, z) === 0) {
          this.swap(x, y, z, 'redstone_lamp');
        }
        return;
      case 'extend':
        if (base === 'piston' || base === 'sticky_piston')
          this.extendPiston(x, y, z, dir);
        return;
      case 'retract':
        if (base === 'piston' || base === 'sticky_piston')
          this.retractPiston(x, y, z, dir, base === 'sticky_piston');
        return;
      default:
    }
  }

  setOutput(key, x, y, z, value) {
    if ((this.outputs.get(key) ?? 0) === value) return;
    if (value) this.outputs.set(key, value);
    else this.outputs.delete(key);
    this.markAround(x, y, z);
    // Gates power the block in front of them, which powers its neighbours.
    for (const [dx, dy, dz] of SIDES) this.markAround(x + dx, y + dy, z + dz);
  }

  isPushable(id) {
    if (!id) return true;
    const { base } = parseRedstoneId(id);
    if (base === 'bedrock' || base === 'obsidian' || base === 'piston_head')
      return false;
    if (
      id.startsWith('chest') ||
      base === 'furnace' ||
      base === 'command_block'
    )
      return false;
    return true;
  }

  extendPiston(x, y, z, dir) {
    const [dx, dy, dz] = DIRS[dir] ?? DIRS.u;
    // Find the line of blocks to push.
    const line = [];
    let cx = x + dx;
    let cy = y + dy;
    let cz = z + dz;
    for (let i = 0; i <= PISTON_PUSH_LIMIT; i++) {
      const id = this.idAt(cx, cy, cz);
      if (!id || id === 'water' || id === 'lava') break;
      if (!this.isPushable(id) || i === PISTON_PUSH_LIMIT) return; // blocked
      line.push([cx, cy, cz, id]);
      cx += dx;
      cy += dy;
      cz += dz;
    }
    for (let i = line.length - 1; i >= 0; i--) {
      const [bx, by, bz, id] = line[i];
      this.world.setBlockAt(bx + dx, by + dy, bz + dz, id, { silent: true });
    }
    this.world.setBlockAt(x + dx, y + dy, z + dz, 'piston_head', {
      silent: true,
    });
    this.setData(x, y, z, 'extended', true);
    this.world.game?.audio?.play('block-placed');
  }

  retractPiston(x, y, z, dir, sticky) {
    const [dx, dy, dz] = DIRS[dir] ?? DIRS.u;
    const headId = this.idAt(x + dx, y + dy, z + dz);
    if (headId === 'piston_head')
      this.world.setBlockAt(x + dx, y + dy, z + dz, null, {
        silent: true,
        skipParticles: true,
      });
    if (sticky) {
      const pulled = this.idAt(x + 2 * dx, y + 2 * dy, z + 2 * dz);
      if (pulled && this.isPushable(pulled)) {
        this.world.setBlockAt(x + 2 * dx, y + 2 * dy, z + 2 * dz, null, {
          silent: true,
          skipParticles: true,
        });
        this.world.setBlockAt(x + dx, y + dy, z + dz, pulled, { silent: true });
      }
    }
    this.setData(x, y, z, 'extended', false);
  }

  setDoorOpen(x, y, z, id, open, isOpen) {
    if (open === isOpen) return;
    const baseId = id.replace(':open', '');
    const next = open ? `${baseId}:open` : baseId;
    this.world.setBlockAt(x, y, z, next, { silent: true });
    const blockData = this.world.getBlockData(parseRedstoneId(baseId).base);
    if (blockData?.pairId) {
      const py = y + Number(blockData.pairOffsetY);
      const pairId = this.idAt(x, py, z);
      if (pairId) {
        const pairBase = pairId.replace(':open', '');
        this.world.setBlockAt(x, py, z, open ? `${pairBase}:open` : pairBase, {
          silent: true,
        });
      }
    }
  }

  ignite(x, y, z) {
    this.world.setBlockAt(x, y, z, null, { silent: true, skipParticles: true });
    setTimeout(() => this.world.explode(x, y, z, 5), 1500);
  }

  // ─── public API ───────────────────────────────────────────────────

  /** Called by the world after any block change. */
  onBlockChanged(x, y, z) {
    this.markAround(x, y, z);
    // Observers watching this position fire a pulse.
    for (const [dx, dy, dz] of SIDES) {
      const ox = x - dx;
      const oy = y - dy;
      const oz = z - dz;
      const { base, dir } = parseRedstoneId(this.idAt(ox, oy, oz));
      if (base !== 'observer') continue;
      const [fx, fy, fz] = DIRS[dir] ?? DIRS.n;
      if (fx === dx && fy === dy && fz === dz)
        this.schedule(ox, oy, oz, 1, 'observer_on');
    }
  }

  /** Called when a chunk's blocks arrive so its circuits start working. */
  wakeChunk(cx, cy, cz, blocks) {
    if (!blocks) return;
    const state = this.world.state;
    this._isRedstoneNum ??= new Map();
    const bx = cx * 16;
    const by = cy * 16;
    const bz = cz * 16;
    for (let i = 0; i < blocks.length; i++) {
      const num = blocks[i];
      if (num === 0) continue;
      let hit = this._isRedstoneNum.get(num);
      if (hit === undefined) {
        const id = state.reverseIdMap.get(num);
        const { base } = parseRedstoneId(id);
        const data = this.world.getBlockData(base);
        hit =
          REDSTONE_BASE_IDS.has(base) ||
          data?.renderType === 'door' ||
          data?.renderType === 'trapdoor';
        this._isRedstoneNum.set(num, hit);
      }
      if (hit) {
        this.dirty.add(
          this.key(bx + (i & 15), by + (i >> 8), bz + ((i >> 4) & 15))
        );
      }
    }
  }

  /** Right-click on a redstone part. Returns true when handled. */
  interact(x, y, z, id) {
    const { base } = parseRedstoneId(id);
    const audio = this.world.game?.audio;
    if (base === 'lever') {
      this.setData(x, y, z, 'active', !this.data(x, y, z, 'active'));
    } else if (base in BUTTON_TICKS) {
      if (this.data(x, y, z, 'active')) return true;
      this.setData(x, y, z, 'active', true);
      this.schedule(x, y, z, BUTTON_TICKS[base], 'button_off');
    } else if (base === 'repeater') {
      const delay = ((this.data(x, y, z, 'delay') ?? 1) % 4) + 1;
      this.setData(x, y, z, 'delay', delay);
      this.world.game?.hud?.flashPrompt?.(
        `Repeater delay: ${delay}`,
        '#ff8080'
      );
    } else if (base === 'comparator') {
      const mode =
        this.data(x, y, z, 'mode') === 'subtract' ? 'compare' : 'subtract';
      this.setData(x, y, z, 'mode', mode);
      this.world.game?.hud?.flashPrompt?.(`Comparator: ${mode}`, '#ff8080');
    } else {
      return false;
    }
    audio?.play('action-success');
    this.markAround(x, y, z);
    this.markAround(x, y - 1, z);
    this.world.chunkManager?.onBlockChanged(x, y, z);
    return true;
  }

  /** Per-frame entry point (World.update). */
  tick(delta) {
    const now = performance.now() / 1000;
    const dt = Number.isFinite(delta)
      ? delta
      : this.lastTime
        ? now - this.lastTime
        : 0;
    this.lastTime = now;
    this.accumulator = Math.min(this.accumulator + dt, TICK_SECONDS * 5);
    while (this.accumulator >= TICK_SECONDS) {
      this.accumulator -= TICK_SECONDS;
      this.step();
    }
  }

  step() {
    this.tickCount++;
    this.updatePlates();
    if (this.tickCount % 20 === 0) this.updateDaylight();

    const due = [];
    const later = [];
    for (const task of this.scheduled)
      (task.due <= this.tickCount ? due : later).push(task);
    this.scheduled = later;
    for (const task of due) this.runScheduled(task);

    let budget = MAX_EVALUATIONS_PER_TICK;
    while (this.dirty.size > 0 && budget-- > 0) {
      const key = this.dirty.values().next().value;
      this.dirty.delete(key);
      this.evaluate(key);
    }
  }

  updatePlates() {
    const occupied = new Set();
    const positions = [];
    const player = this.world.game?.getPlayerPosition?.();
    if (player) positions.push(player);
    for (const entity of this.world.game?.entities?.entities ?? []) {
      if (entity?.position) positions.push(entity.position);
    }
    for (const p of positions) {
      const x = Math.floor(p.x);
      const z = Math.floor(p.z);
      for (const y of [Math.floor(p.y), Math.floor(p.y - 0.5)]) {
        if (PLATES.has(this.idAt(x, y, z))) occupied.add(this.key(x, y, z));
      }
    }
    for (const key of occupied) {
      const wasActive = this.activePlates.has(key);
      this.activePlates.set(key, 10);
      if (!wasActive) this.markAroundKey(key);
    }
    for (const [key, ticks] of this.activePlates) {
      if (occupied.has(key)) continue;
      if (ticks <= 1) {
        this.activePlates.delete(key);
        this.markAroundKey(key);
      } else {
        this.activePlates.set(key, ticks - 1);
      }
    }
  }

  markAroundKey(key) {
    const [x, y, z] = this.world.coords.keyToCoords(key);
    this.markAround(x, y, z);
    this.markAround(x, y - 1, z);
  }

  updateDaylight() {
    const t = this.world.game?.dayNight?.timeOfDay ?? 0.3;
    // timeOfDay 0..1 with noon around 0.5.
    const sun = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2 + Math.PI / 2));
    const level = Math.round(sun * 15);
    for (const key of this.daylightDetectors) {
      const [x, y, z] = this.world.coords.keyToCoords(key);
      if (parseRedstoneId(this.idAt(x, y, z)).base !== 'daylight_detector') {
        this.daylightDetectors.delete(key);
        continue;
      }
      if ((this.outputs.get(key) ?? 0) !== level)
        this.setOutput(key, x, y, z, level);
    }
  }

  clear() {
    this.wire.clear();
    this.outputs.clear();
    this.dirty.clear();
    this.scheduled = [];
    this.daylightDetectors.clear();
    this.activePlates.clear();
    this.lastPowered.clear();
  }
}
