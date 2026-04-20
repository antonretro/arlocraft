/**
 * GravitySystem
 * Manages physics for falling blocks like Sand and Gravel.
 */
export class GravitySystem {
  constructor(world) {
    this.world = world;
    this.fallingBlocks = new Set(); // Set of block keys that need a gravity check
    this.activeGravityBlocks = new Map(); // key -> falling speed/state if we want animated falls

    this.fallableIds = new Set([
      'sand',
      'gravel',
      'red_sand',
      'concrete_powder',
      'anvil',
    ]);
  }

  /**
   * Check if a block at (x, y, z) should start falling.
   */
  checkBlock(x, y, z) {
    const id = this.world.getBlockAt(x, y, z);
    if (!id) return;

    // Basic check: is it a gravity block?
    if (!this.isGravityBlock(id)) return;

    // Is there air/replaceable below?
    const belowId = this.world.getBlockAt(x, y - 1, z);
    if (this.canFallThrough(belowId)) {
      this.triggerFall(x, y, z, id);
    }
  }

  isGravityBlock(id) {
    if (!id) return false;
    const baseId = id.split(':')[0]; // Handle variant IDs
    return this.fallableIds.has(baseId);
  }

  canFallThrough(id) {
    if (
      !id ||
      id === 'air' ||
      id === 'water' ||
      id === 'fire' ||
      id === 'virus'
    )
      return true;
    // In the future, check for deco/replaceable?
    return false;
  }

  triggerFall(x, y, z, id) {
    console.log(`[Gravity] Block ${id} at ${x},${y},${z} is falling!`);

    // Remove current block
    this.world.removeBlockAt(x, y, z, { silent: false });

    // Find the impact point
    let targetY = y - 1;
    while (
      targetY > 0 &&
      this.canFallThrough(this.world.getBlockAt(x, targetY - 1, z))
    ) {
      targetY--;
    }

    // Place at target (Instant fall for now, can add animation later)
    this.world.addBlock(x, targetY, z, id, 'gravity', true, { silent: false });

    // After impact, check for more chain reactions around the old and new positions
    this.checkNeighbors(x, y, z);
    this.checkNeighbors(x, targetY, z);
  }

  checkNeighbors(x, y, z) {
    // Blocks above the changed position might now be unsupported
    this.checkBlock(x, y + 1, z);
    this.checkBlock(x + 1, y, z);
    this.checkBlock(x - 1, y, z);
    this.checkBlock(x, y, z + 1);
    this.checkBlock(x, y, z - 1);
  }

  /**
   * Hook into the world block updates
   */
  onBlockChanged(x, y, z, operation) {
    // If a block was removed, neighbors might fall
    if (operation === 'remove') {
      this.checkNeighbors(x, y, z);
    } else {
      // If a block was added, it might immediately fall
      this.checkBlock(x, y, z);
    }
  }
}
