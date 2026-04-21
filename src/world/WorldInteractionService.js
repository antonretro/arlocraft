import * as THREE from 'three';

export class WorldInteractionService {
  constructor(world) {
    this.world = world;
  }

  breakBlockAt(x, y, z, skipGravity = false) {
    const key = this.world.coords.getKey(x, y, z);
    const id = this.world.state.blockMap.get(key);
    if (!id || id === 'bedrock') return false;

    const pairState = this.world.blocks.getBlockPairState(id, x, y, z);
    const dropId = this.world.blocks.getBlockDropId(id);

    if (pairState) {
      this.world.state.changedBlocks.set(pairState.pairKey, null);
      this.world.mutations.removeBlockByKey(pairState.pairKey, {
        skipChangeTracking: true,
      });
      this.world.explosions.spawnBreakParticles(
        x,
        pairState.pairY,
        z,
        pairState.pairId
      );
    }

    this.world.state.changedBlocks.set(key, null);
    this.world.mutations.removeBlockByKey(key, { skipChangeTracking: true });

    this.world.chunkManager.flushPriorityChunkRebuilds(20);
    // ensureSubsurfaceBelow logic can be delegated or kept here
    this.world.explosions.spawnBreakParticles(x, y, z, id);

    const playerPos = this.world.game?.getPlayerPosition?.();
    this.world.explosions.spawnPickupEffect(x, y, z, dropId, playerPos);

    window.dispatchEvent(
      new CustomEvent('block-mined', { detail: { id: dropId, x, y, z } })
    );

    // Gravity collapse
    if (
      !skipGravity &&
      (this.world.blocks.isGravityBlock(id) ||
        ['stone', 'dirt', 'grass_block', 'sand'].includes(id))
    ) {
      this._applyGravityAbove(x, y, z);
    }

    return true;
  }

  _applyGravityAbove(x, y, z) {
    for (let dy = 1; dy <= 28; dy++) {
      const ay = y + dy;
      const aboveId = this.world.state.blockMap.get(
        this.world.coords.getKey(x, ay, z)
      );
      if (!aboveId) break;
      if (!this.world.blocks.isGravityBlock(aboveId)) break;
      if (!this.breakBlockAt(x, ay, z, true)) break; // Skip nested gravity sweep
    }
  }

  resetMiningProgress() {
    this.world.state.miningState.key = null;
    this.world.state.miningState.progress = 0;
    this.world.state.miningState.required = 0;
    if (this.world.visuals.miningCracks) {
      this.world.visuals.miningCracks.visible = false;
    }
    window.dispatchEvent(
      new CustomEvent('mining-progress', {
        detail: { ratio: 0, id: null, done: true },
      })
    );
  }

  mineBlockProgress(x, y, z, id, selectedItem, mode, delta) {
    const key = this.world.coords.getKey(x, y, z);
    if (this.world.state.miningState.key !== key) {
      this.world.state.miningState.key = key;
      this.world.state.miningState.progress = 0;
      this.world.state.miningState.required =
        this.world.blocks.computeMineDuration(id, selectedItem, mode);
    }

    this.world.state.miningState.progress += delta;
    const ratio = Math.min(
      1,
      this.world.state.miningState.progress /
        this.world.state.miningState.required
    );

    if (this.world.visuals.miningCracks) {
      const stage = Math.floor(ratio * 9);
      const mat = this.world.registry.getBreakingMaterial(stage);
      this.world.visuals.updateMiningCracks(x, y, z, true, mat);
    }

    window.dispatchEvent(
      new CustomEvent('mining-progress', {
        detail: { ratio, id, done: ratio >= 1 },
      })
    );

    if (ratio >= 1) {
      this.breakBlockAt(x, y, z, false); // Normal break with gravity
      this.resetMiningProgress();
      return true;
    }
    return false;
  }

  // --- Landmarks & Settlements ---

  getSettlementNameAt(x, z) {
    return this.world.terrain.getSettlementNameAt(x, z);
  }

  registerLandmark(x, z, name, options = {}) {
    if (!name) return;
    const rx = Math.round(x);
    const rz = Math.round(z);
    const key = this.world.coords.getLandmarkStorageKey(rx, rz);

    // Logical extraction of registerLandmark body from World.js
    this.world.state.landmarks.set(key, {
      key,
      x: rx,
      z: rz,
      name,
      restored: this.world.state.restoredLandmarks.has(key),
      ...options,
    });
  }

  getLandmarksNear(x, z, radius = 32) {
    const results = [];
    const maxDistSq = radius * radius;
    for (const landmark of this.world.state.landmarks.values()) {
      if (!landmark) continue;
      const dx = landmark.x - x;
      const dz = landmark.z - z;
      if (dx * dx + dz * dz > maxDistSq) continue;
      results.push(landmark);
    }
    return results.sort((left, right) => {
      const leftDx = left.x - x;
      const leftDz = left.z - z;
      const rightDx = right.x - x;
      const rightDz = right.z - z;
      return leftDx * leftDx + leftDz * leftDz - (rightDx * rightDx + rightDz * rightDz);
    });
  }

  // --- Requirements & Inventory ---

  canAffordRequirements(requirements = []) {
    for (const req of requirements) {
      if (!req?.id || !Number.isFinite(req.count)) continue;
      if (this.countInventoryItem(req.id) < req.count) return false;
    }
    return true;
  }

  countInventoryItem(itemId) {
    const inventory = this.world.game?.gameState?.inventory;
    if (!Array.isArray(inventory)) return 0;
    let total = 0;
    for (const slot of inventory) {
      if (slot?.id === itemId) total += Math.max(0, Number(slot.count) || 0);
    }
    return total;
  }

  consumeRequirements(requirements = []) {
    if (!this.canAffordRequirements(requirements)) return false;
    const inventory = this.world.game?.gameState?.inventory;
    if (!Array.isArray(inventory)) return false;

    for (const req of requirements) {
      let remaining = req.count;
      for (let i = 0; i < inventory.length; i++) {
        if (inventory[i]?.id === req.id) {
          const count = Math.max(0, Number(inventory[i].count) || 0);
          const taken = Math.min(count, remaining);
          inventory[i].count -= taken;
          remaining -= taken;
          if (remaining <= 0) break;
        }
      }
    }
    return true;
  }
}
