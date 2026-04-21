import * as THREE from 'three';

export class FluidSystem {
  constructor(world) {
    this.world = world;
    this.dirtyBlocks = []; // Queue of positions [x, y, z, id, depth]
    this.MAX_DEPTH_WATER = 8;
    this.MAX_DEPTH_LAVA = 4;
    this.UPDATE_INTERVAL_MS = 150;
    this.lastUpdate = 0;

    window.addEventListener('block-placed', (e) => {
      const { x, y, z, id } = e.detail;
      if (this.isLiquid(id)) {
        this.scheduleSpread(Math.round(x), Math.round(y), Math.round(z), id, 0);
      }
    });

    window.addEventListener('block-removed', (e) => {
      const { x, y, z } = e.detail;
      // Check neighbors to see if water should flow into this new hole
      this.checkSurroundings(Math.round(x), Math.round(y), Math.round(z));
    });
  }

  checkSurroundings(x, y, z) {
    const neighbors = [
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [dx, dy, dz] of neighbors) {
      const nx = x + dx,
        ny = y + dy,
        nz = z + dz;
      const id = this.world.state.blockMap.get(
        this.world.coords.getKey(nx, ny, nz)
      );
      if (this.isLiquid(id)) {
        this.scheduleSpread(nx, ny, nz, id, 0);
      }
    }
  }

  scheduleSpread(x, y, z, id, depth) {
    this.dirtyBlocks.push({ x, y, z, id, depth });
  }

  update(time) {
    if (time - this.lastUpdate < this.UPDATE_INTERVAL_MS) return;
    this.lastUpdate = time;

    if (this.dirtyBlocks.length === 0) return;

    // Process a batch of fluid updates
    const batchSize = Math.min(this.dirtyBlocks.length, 128); // Increased batch size since it's now more efficient
    const nextBatch = this.dirtyBlocks.splice(0, batchSize);
    
    const affectedChunks = new Set();

    for (const block of nextBatch) {
      const { x, y, z, id, depth } = block;
      
      const cx = this.world.coords.getChunkCoord(x);
      const cy = this.world.coords.getChunkCoord(y);
      const cz = this.world.coords.getChunkCoord(z);
      const ownerKey = this.world.coords.getChunkKey(cx, cy, cz);
      
      // use silent placement to avoid immediate rebuilds
      this.world.mutations.setBlock(x, y, z, id, ownerKey, { silent: true });
      
      affectedChunks.add(ownerKey);
      
      this.processSpread(block);
    }

    // Trigger chunk rebuilds once for all affected chunks in this batch
    for (const chunkKey of affectedChunks) {
      const chunk = this.world.chunks.get(chunkKey);
      if (chunk) {
        chunk.dirty = true;
        this.world.chunkManager.priorityDirtyChunkKeys.add(chunkKey);
      }
    }
  }

  processSpread(block) {
    const { x, y, z, id, depth } = block;

    // 0. Check if this air block should become an infinite source
    const currentId = this.world.state.blockMap.get(
      this.world.coords.getKey(x, y, z)
    );
    if (!currentId || currentId === 'air') {
      let waterNeighbors = 0;
      const sides = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      for (const [dx, dy, dz] of sides) {
        const nid = this.world.state.blockMap.get(
          this.world.coords.getKey(x + dx, y, z + dz)
        );
        if (nid === id) waterNeighbors++;
      }
      // If air has 2+ liquid neighbors and a solid/liquid base, it becomes liquid
      const downId = this.world.state.blockMap.get(
        this.world.coords.getKey(x, y - 1, z)
      );
      if (waterNeighbors >= 2 && downId && downId !== 'air') {
        this.placeFluid(x, y, z, id, 0);
        return;
      }
    }

    const maxDepth =
      id === 'water' ? this.MAX_DEPTH_WATER : this.MAX_DEPTH_LAVA;
    if (depth >= maxDepth) return;

    // 1. Try flowing DOWN first
    const downKey = this.world.coords.getKey(x, y - 1, z);
    const downId = this.world.state.blockMap.get(downKey);

    if (
      y > this.world.minTerrainY &&
      (!downId || downId === 'air' || (downId !== id && this.isLiquid(downId)))
    ) {
      this.placeFluid(x, y - 1, z, id, 0);
      return;
    }

    // 2. Try flowing HORIZONTALLY
    const neighbors = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    for (const [dx, dy, dz] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      const key = this.world.coords.getKey(nx, ny, nz);
      const existing = this.world.state.blockMap.get(key);

      if (!existing || existing === 'air') {
        this.placeFluid(nx, ny, nz, id, depth + 1);
      }
    }
  }

  isLiquid(id) {
    return id === 'water' || id === 'lava';
  }

  placeFluid(x, y, z, id, depth) {
    // This is now just a scheduling helper; mutations are handled in the update() batch
    this.scheduleSpread(x, y, z, id, depth);
  }
}
