import * as THREE from 'three';

/**
 * RedstoneSystem
 * Advanced logic engine for ArloCraft.
 * Handles 0-15 signal strength, tick-based delays, and 6-way directional components.
 */
export class RedstoneSystem {
  constructor(world) {
    this.world = world;
    this.powerMap = new Map(); // key -> strength
    this.updateQueue = [];
    this.delayQueue = []; // { x, y, z, power, tickRemaining }
    this._processing = false;

    // Component Sets
    this.sources = new Set([
      'redstone_block',
      'lever',
      'stone_button',
      'redstone_torch',
    ]);
    this.conductors = new Set(['redstone_wire']);
    this.consumers = new Set([
      'redstone_lamp',
      'tnt',
      'command_block',
      'piston',
      'sticky_piston',
    ]);

    // Direction mapping
    this.DIR_MAP = {
      n: { dx: 0, dy: 0, dz: -1 },
      s: { dx: 0, dy: 0, dz: 1 },
      e: { dx: 1, dy: 0, dz: 0 },
      w: { dx: -1, dy: 0, dz: 0 },
      u: { dx: 0, dy: 1, dz: 0 },
      d: { dx: 0, dy: -1, dz: 0 },
    };
  }

  /**
   * Main game tick entry point.
   * Call this from World.update()
   */
  tick() {
    const nextQueue = [];
    for (const task of this.delayQueue) {
      task.tickRemaining--;
      if (task.tickRemaining <= 0) {
        const key = this.world.coords.getKey(task.x, task.y, task.z);
        this.powerMap.set(key, task.power);
        this.applyConsequences(
          task.x,
          task.y,
          task.z,
          task.power,
          task.id || this.world.getBlockAt(task.x, task.y, task.z)
        );
        this.notifyNeighbors(task.x, task.y, task.z);
      } else {
        nextQueue.push(task);
      }
    }
    this.delayQueue = nextQueue;
  }

  onBlockChanged(x, y, z, operation) {
    // Check for Observers nearby
    this.notifyObservers(x, y, z);
    this.scheduleUpdate(x, y, z);
  }

  scheduleUpdate(x, y, z) {
    this.updateQueue.push({ x, y, z });
    if (!this._processing) {
      this._processing = true;
      setTimeout(() => this.processQueue(), 0);
    }
  }

  processQueue() {
    const limit = 400;
    let count = 0;
    while (this.updateQueue.length > 0 && count < limit) {
      const { x, y, z } = this.updateQueue.shift();
      this.evaluateBlock(x, y, z);
      count++;
    }
    this._processing = false;
  }

  evaluateBlock(x, y, z) {
    const fullId = this.world.getBlockAt(x, y, z);
    const key = this.world.coords.getKey(x, y, z);
    if (!fullId || fullId === 'air') {
      this.powerMap.delete(key);
      this.notifyNeighbors(x, y, z);
      return;
    }

    const baseId = fullId.split('_')[0].split(':')[0]; // Normalize
    const oldPower = this.powerMap.get(key) || 0;

    // Special Repeater Handling
    if (fullId.startsWith('repeater')) {
      const targetPower = this.getRepeaterOutput(x, y, z, fullId);
      if (targetPower !== oldPower) {
        const delay = this.world.state.blockData.get(key + ':delay') || 1;
        this.delayQueue.push({
          x,
          y,
          z,
          power: targetPower,
          tickRemaining: delay,
          id: fullId,
        });
      }
      return;
    }

    const newPower = this.calculatePower(x, y, z, fullId);

    if (oldPower !== newPower) {
      this.powerMap.set(key, newPower);
      this.applyConsequences(x, y, z, newPower, fullId);
      this.notifyNeighbors(x, y, z);
    }
  }

  calculatePower(x, y, z, id) {
    // Standard Sources
    if (id === 'redstone_block') return 15;

    const key = this.world.coords.getKey(x, y, z);
    if (id === 'lever' || id === 'stone_button') {
      return this.world.state.blockData.get(key + ':active') ? 15 : 0;
    }

    // Redstone Torch (Inversion)
    if (id === 'redstone_torch') {
      // Check supporting block (usually below, but could be on side)
      // For simple version, check all neighbors. If any are powered, torch is OFF.
      return this.getHighestNeighborPower(x, y, z) > 0 ? 0 : 15;
    }

    // Advanced Gates (Directional)
    if (id.startsWith('repeater')) {
      // Repeaters use delayQueue and don't update powerMap immediately in calculatePower
      // We handle them specifically in evaluateBlock
      return this.powerMap.get(key) || 0;
    }
    if (id.startsWith('comparator')) {
      return this.getComparatorOutput(x, y, z, id);
    }
    if (id.startsWith('observer')) {
      return this.powerMap.get(key) || 0; // Handled by pulse
    }

    // Redstone Wire (Propagation)
    if (id === 'redstone_wire') {
      const max = this.getHighestNeighborPower(x, y, z);
      return Math.max(0, max - 1);
    }

    return 0;
  }

  getRepeaterOutput(x, y, z, id) {
    const dir = id.split('_').pop(); // e.g. repeater_n
    const vec = this.DIR_MAP[dir] || this.DIR_MAP['n'];
    // Input is from BEHIND
    const p =
      this.powerMap.get(
        this.world.coords.getKey(x - vec.dx, y - vec.dy, z - vec.dz)
      ) || 0;
    return p > 0 ? 15 : 0;
  }

  getComparatorOutput(x, y, z, id) {
    const key = this.world.coords.getKey(x, y, z);
    const dir = id.split('_').pop();
    const vec = this.DIR_MAP[dir] || this.DIR_MAP['n'];
    const backPower =
      this.powerMap.get(
        this.world.coords.getKey(x - vec.dx, y - vec.dy, z - vec.dz)
      ) || 0;

    // Side inputs (ortho to dir)
    const s1 = { dx: vec.dz, dy: 0, dz: -vec.dx };
    const s2 = { dx: -vec.dz, dy: 0, dz: vec.dx };
    const sideMax = Math.max(
      this.powerMap.get(this.world.coords.getKey(x + s1.dx, y, z + s1.dz)) || 0,
      this.powerMap.get(this.world.coords.getKey(x + s2.dx, y, z + s2.dz)) || 0
    );

    const isSubtract =
      this.world.state.blockData.get(key + ':mode') === 'subtract';
    if (isSubtract) return Math.max(0, backPower - sideMax);
    return backPower >= sideMax ? backPower : 0;
  }

  getHighestNeighborPower(x, y, z) {
    const neighbors = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    let max = 0;
    for (const [dx, dy, dz] of neighbors) {
      const p =
        this.powerMap.get(this.world.coords.getKey(x + dx, y + dy, z + dz)) ||
        0;
      if (p > max) max = p;
    }
    return max;
  }

  notifyNeighbors(x, y, z) {
    const neighbors = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [dx, dy, dz] of neighbors) {
      this.updateQueue.push({ x: x + dx, y: y + dy, z: z + dz });
    }
  }

  notifyObservers(x, y, z) {
    const neighbors = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [dx, dy, dz] of neighbors) {
      const tx = x + dx,
        ty = y + dy,
        tz = z + dz;
      const tid = this.world.getBlockAt(tx, ty, tz);
      if (tid && tid.startsWith('observer')) {
        const dir = tid.split('_').pop();
        const vec = this.DIR_MAP[dir] || this.DIR_MAP['n'];
        // Does observer face the changed block? (Observer faces dir, so it watches -dir)
        if (tx - vec.dx === x && ty - vec.dy === y && tz - vec.dz === z) {
          this.triggerObserverPulse(tx, ty, tz);
        }
      }
    }
  }

  triggerObserverPulse(x, y, z) {
    const key = this.world.coords.getKey(x, y, z);
    this.powerMap.set(key, 15);
    this.notifyNeighbors(x, y, z);
    // Schedule OFF pulse
    this.delayQueue.push({ x, y, z, power: 0, tickRemaining: 2 });
  }

  applyConsequences(x, y, z, power, id) {
    const key = this.world.coords.getKey(x, y, z);

    if (id.startsWith('redstone_lamp')) {
      const target = power > 0 ? 'redstone_lamp_on' : 'redstone_lamp';
      if (this.world.getBlockAt(x, y, z).split(':')[0] !== target) {
        this.world.mutations.setBlock(x, y, z, target, null, { silent: true });
      }
    }

    if (id === 'command_block') {
      const wasPowered =
        this.world.state.blockData.get(key + ':powered') || false;
      if (power > 0 && !wasPowered) {
        this.world.state.blockData.set(key + ':powered', true);
        this.world.game.blockScripts?.onRedstoneUpdate('command_block', x, y, z, power);
      } else if (power === 0) {
        this.world.state.blockData.set(key + ':powered', false);
      }
    }

    if (id.startsWith('piston')) {
      this.updatePiston(x, y, z, power, id);
    }

    if (id === 'tnt' && power > 0) {
      this.world.mutations.setBlock(x, y, z, 'air', null, { silent: false });
      this.world.explosions?.create(x, y, z, 4);
    }
  }

  updatePiston(x, y, z, power, id) {
    const key = this.world.coords.getKey(x, y, z);
    const extended = this.world.state.blockData.get(key + ':extended') || false;

    const dir = id.split('_').pop();
    const vec = this.DIR_MAP[dir] || this.DIR_MAP['u']; // Default UP
    const tx = x + vec.dx,
      ty = y + vec.dy,
      tz = z + vec.dz;

    if (power > 0 && !extended) {
      const targetId = this.world.getBlockAt(tx, ty, tz);
      if (!targetId || targetId === 'air') {
        this.world.state.blockData.set(key + ':extended', true);
        this.world.mutations.setBlock(tx, ty, tz, 'piston_head', null, {
          silent: true,
        });
        this.world.game.audio?.play('piston-extend');
      }
    } else if (power === 0 && extended) {
      if (this.world.getBlockAt(tx, ty, tz) === 'piston_head') {
        this.world.mutations.setBlock(tx, ty, tz, 'air', null, {
          silent: true,
        });
        this.world.state.blockData.set(key + ':extended', false);
        this.world.game.audio?.play('piston-retract');
      }
    }
  }
}
