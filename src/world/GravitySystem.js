/**
 * GravitySystem
 * Manages physics for falling blocks like Sand and Gravel.
 * Updated to use a queued tick-based system to prevent main-thread hangs.
 */
export class GravitySystem {
  constructor(world) {
    this.world = world;
    this.pendingUpdates = new Set(); // Set of "x,y,z" strings

    this.fallableIds = new Set([
      'sand',
      'gravel',
      'red_sand',
      'concrete_powder',
      'anvil',
    ]);

    this.updateBatchSize = 16; // Process 16 checks per frame
  }

  /**
   * Queues a block at (x, y, z) for a stability check.
   */
  queueCheck(x, y, z) {
    this.pendingUpdates.add(`${x},${y},${z}`);
  }

  /**
   * Called by World.update() every frame.
   */
  update() {
    if (this.pendingUpdates.size === 0) return;

    let processed = 0;
    const iterator = this.pendingUpdates.values();

    while (processed < this.updateBatchSize) {
      const next = iterator.next();
      if (next.done) break;

      const key = next.value;
      this.pendingUpdates.delete(key);

      const [x, y, z] = key.split(',').map(Number);
      this.processCheck(x, y, z);

      processed++;
    }
  }

  /**
   * Performs the actual physics check and executes the fall if necessary.
   */
  processCheck(x, y, z) {
    const id = this.world.getBlockAt(x, y, z);
    if (!id || !this.isGravityBlock(id)) return;

    // Is there air/replaceable below?
    const belowId = this.world.getBlockAt(x, y - 1, z);
    if (this.canFallThrough(belowId)) {
      this.triggerFall(x, y, z, id);
    }
  }

  isGravityBlock(id) {
    if (!id) return false;
    const baseId = id.split(':')[0];
    return this.fallableIds.has(baseId);
  }

  canFallThrough(id) {
    if (
      !id ||
      id === 'air' ||
      id === 'water' ||
      id === 'fire' ||
      id === 'virus'
    ) {
      return true;
    }
    return false;
  }

  triggerFall(x, y, z, id) {
    // Remove current block
    this.world.removeBlockAt(x, y, z, { silent: false });

    // Find the impact point
    let targetY = y - 1;
    const VOID_LIMIT = -128;

    while (
      targetY > VOID_LIMIT &&
      this.canFallThrough(this.world.getBlockAt(x, targetY - 1, z))
    ) {
      targetY--;
    }

    // If block fell into the deep void, just destroyed
    if (targetY <= -120) return;

    // Place at target (Instant column fall)
    this.world.addBlock(x, targetY, z, id, 'gravity', true, { silent: false });

    // Queue checks for neighbors around both old and new positions
    this.queueNeighbors(x, y, z);
    this.queueNeighbors(x, targetY, z);
  }

  queueNeighbors(x, y, z) {
    this.queueCheck(x, y + 1, z); // Block above might be unsupported now
    this.queueCheck(x + 1, y, z);
    this.queueCheck(x - 1, y, z);
    this.queueCheck(x, y, z + 1);
    this.queueCheck(x, y, z - 1);
  }

  /**
   * Hook into the world block updates
   */
  onBlockChanged(x, y, z, operation) {
    if (operation === 'remove') {
      this.queueNeighbors(x, y, z);
    } else {
      this.queueCheck(x, y, z);
    }
  }
}
