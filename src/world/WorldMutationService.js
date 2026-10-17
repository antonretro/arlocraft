import * as THREE from 'three';

export class WorldMutationService {
  constructor(world) {
    this.world = world;
  }

  // --- Core Mutation API ---

  addBlock(
    x,
    y,
    z,
    id,
    _ownerKey = null, // unused: a block belongs to the chunk it is in
    replace = false,
    options = {},
    data = null
  ) {
    const gx = Math.round(x);
    const gy = Math.round(y);
    const gz = Math.round(z);

    if (id === null || id === 'air') {
      const key = this.world.coords.getKey(gx, gy, gz);
      return this.removeBlockByKey(key, options);
    }

    const allowCorruption = Boolean(options?.allowCorruption);
    if (
      !allowCorruption &&
      !this.world.corruptionEnabled &&
      (id === 'virus' || id === 'arlo')
    )
      return null;

    const key = this.world.coords.getKey(gx, gy, gz);

    const existing = this.world.voxels.get(gx, gy, gz);
    if (existing && !replace) return existing;

    if (existing && replace)
      this.removeBlockByKey(key, {
        ...options,
        skipChangeTracking: true,
        skipParticles: true,
        silent: true,
      });

    this.world.voxels.set(gx, gy, gz, id);
    if (data) this.world.state.blockData.set(key, data);
    // Runtime edits (not terrain generation) must be saved with the world.
    if (options?.persistChange) this.world.state.changedBlocks.set(key, id);

    if (id === 'virus') this.world.state.virusBlockCount++;

    this.world.chunkManager.onBlockChanged(gx, gy, gz);

    if (id === 'virus' || id === 'arlo') {
      const radius = this.world.config.virus?.influenceRadiusBlocks ?? 3;
      this.world.chunkManager.markChunksWithinBlockRadiusDirty(
        gx,
        gy,
        gz,
        radius,
        true
      );
    }

    if ((id === 'water' || id === 'lava') && !options?.skipFluidScheduling) {
      const initialDepth =
        options.fluidDepth !== undefined ? options.fluidDepth : 0;
      this.world.fluids?.scheduleSpread(gx, gy, gz, id, initialDepth);
    }

    if (!options?.skipGravity) {
      this.world.gravity?.onBlockChanged(gx, gy, gz, 'add');
    }
    if (!options?.skipRedstone) {
      this.world.redstone?.onBlockChanged(gx, gy, gz, 'add');
    }

    // --- Multiplayer Broadcast ---
    if (this.world.game?.multiplayer && !options.silent) {
      this.world.game.multiplayer.broadcastBlockUpdate(
        gx,
        gy,
        gz,
        id,
        'add',
        data
      );
    }

    return id;
  }

  removeBlockByKey(key, options = {}) {
    const id = this.world.state.blockMap.get(key);
    if (!id) return false;

    if (!options.skipChangeTracking) {
      this.world.state.changedBlocks.set(key, null);
    }

    const [x, y, z] = this.world.coords.keyToCoords(key);
    this.world.voxels.set(x, y, z, null);
    this.world.state.blockData.delete(key);

    if (id === 'virus' && this.world.state.virusBlockCount > 0)
      this.world.state.virusBlockCount--;

    this.world.chunkManager.onBlockChanged(x, y, z);

    // Spawn breaking particles (Skip for liquids and air/void)
    const isLiquid =
      id === 'water' ||
      id.includes('water_') ||
      id === 'lava' ||
      id.includes('lava_');
    if (!options.skipParticles && !isLiquid && id !== 'air') {
      const blockConfig = this.world.game?.blockRegistry?.blocks?.get(id);
      let particleColor = blockConfig?.color
        ? parseInt(blockConfig.color)
        : 0x888888;

      // Fallback for stained glass colors if not in config
      if (id.includes('stained_glass')) {
        const colorKey = id.split('_').pop();
        const registry = this.world.game?.blockRegistry;
        if (
          registry &&
          registry.stainedGlassColors &&
          registry.stainedGlassColors[colorKey]
        ) {
          particleColor = registry.stainedGlassColors[colorKey];
        }
      }

      this.world.game?.particles?.spawnBurst(
        new THREE.Vector3(x, y, z),
        'DEBRIS',
        8,
        0.15,
        particleColor
      );
    }

    if (id === 'virus' || id === 'arlo') {
      const radius = this.world.config.virus?.influenceRadiusBlocks ?? 3;
      this.world.chunkManager.markChunksWithinBlockRadiusDirty(
        x,
        y,
        z,
        radius,
        true
      );
    }

    this.world.gravity?.onBlockChanged(x, y, z, 'remove');
    this.world.redstone?.onBlockChanged(x, y, z, 'remove');

    // --- Multiplayer Broadcast ---
    if (this.world.game?.multiplayer && !options.silent) {
      this.world.game.multiplayer.broadcastBlockUpdate(x, y, z, null, 'remove');
    }

    return true;
  }

  setBlock(x, y, z, id, owner = null, options = {}) {
    if (id === null || id === 'air') {
      const key = this.world.coords.getKey(x, y, z);
      return this.removeBlockByKey(key, options);
    }
    return this.addBlock(x, y, z, id, owner, true, options, options.data);
  }
}
