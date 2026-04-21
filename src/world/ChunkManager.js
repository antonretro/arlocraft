import { Chunk } from './Chunk.js';

/**
 * ChunkManager — owns the lifecycle of every Chunk in the world.
 *
 * Responsibilities:
 *   • Loading / generating new chunks (sync or queued-async)
 *   • Unloading chunks that are too far from the player
 *   • Managing the pending-load queue with distance-priority sorting
 *   • Dirty-mesh rebuild budgeting (emergency + budgeted passes)
 *   • Chunk visibility auditing (forces all loaded chunks visible)
 *   • Priority flush for chunks flagged by block edits
 */
export class ChunkManager {
  constructor(world) {
    this.world = world;

    // --- state owned by ChunkManager ---
    this.chunks = new Map(); // chunkKey → Chunk
    this.pendingChunkLoads = []; // { cx, cz, key }
    this.pendingChunkSet = new Set();
    this.priorityDirtyChunkKeys = new Set();
    this.needsQueueSort = true;
    this.lastPlayerChunkKey = null;

    // --- tunables ---
    this.chunkMeshRebuildCursor = 0;
    this.forceFullRemeshPending = true;
    this.forceVisibilityResetPending = true;
    this.chunkRefreshTick = 0;
    this.criticalChunkTick = 0;
    this.visibilityScanTick = 0;
    this.meshSanityTick = 0;
    this.colorSanityTick = 0;
    this.lastStreamingWindow = {
      mode: 'balanced',
      minCy: 0,
      maxCy: 0,
      aboveRadius: 0,
      belowRadius: 0,
      surfaceChunkCy: 0,
    };
  }

  getQualityTier() {
    return this.world.game?.qualityTier ?? 'balanced';
  }

  pickAmbientWaterMob(wx, wz, biomeId, waterDepth = 0) {
    if (waterDepth >= 5 && this.world.hash2D(wx * 0.37 + 7, wz * 0.41 - 3) > 0.74) {
      return this.world.hash2D(wx * 0.19 + 5, wz * 0.23 - 11) > 0.55
        ? 'glow_squid'
        : 'void_jelly';
    }

    if (biomeId === 'desert' || biomeId === 'lush_grove' || biomeId === 'swamp') {
      return 'tropical_fish';
    }
    if (biomeId === 'alpine' || biomeId === 'tundra' || biomeId === 'snow' || biomeId === 'highlands') {
      return 'salmon';
    }
    return 'cod';
  }

  getVerticalStreamingWindow(playerPosition, centerCy) {
    const configuredVertical = Math.max(
      1,
      Number(this.world.config.renderDistance.vertical) || 2
    );
    const tier = this.getQualityTier();
    const tierVerticalCap =
      tier === 'low' ? 1 : tier === 'high' ? configuredVertical + 1 : configuredVertical;
    const surfaceY = this.world.getTerrainHeight(
      playerPosition.x,
      playerPosition.z
    );
    const surfaceChunkCy = this.world.getChunkCoord(surfaceY);
    const deltaFromSurface = playerPosition.y - surfaceY;

    let mode = 'surface';
    let belowRadius = 0;
    let aboveRadius = tier === 'high' ? 2 : 1;

    if (deltaFromSurface < -8) {
      mode = 'underground';
      belowRadius = tierVerticalCap;
      aboveRadius = Math.max(1, tierVerticalCap - 1);
    } else if (deltaFromSurface > this.world.chunkSize * 1.5) {
      mode = 'elevated';
      belowRadius = Math.max(1, Math.floor(tierVerticalCap / 2));
      aboveRadius = tierVerticalCap;
    }

    const minCy = centerCy - belowRadius;
    const maxCy = centerCy + aboveRadius;
    return {
      mode,
      minCy,
      maxCy,
      aboveRadius,
      belowRadius,
      surfaceChunkCy,
    };
  }

  // ─── Chunk accessors ──────────────────────────────────────────────

  has(key) {
    return this.chunks.has(key);
  }

  get(key) {
    return this.chunks.get(key);
  }

  getChunk(cx, cy, cz) {
    return this.chunks.get(this.world.getChunkKey(cx, cy, cz));
  }

  getBlockAt(x, y, z) {
    return (
      this.world.state.blockMap.get(
        this.world.getKey(Math.round(x), Math.round(y), Math.round(z))
      ) ?? null
    );
  }

  updateNeighborsDirty(x, y, z) {
    const cs = this.world.chunkSize;
    const lx = ((x % cs) + cs) % cs;
    const ly = ((y % cs) + cs) % cs;
    const lz = ((z % cs) + cs) % cs;

    // Neighbor dirtying for all 6 faces in 3D
    if (lx === 0) this._dirtyChunkAt(x - 1, y, z);
    if (lx === cs - 1) this._dirtyChunkAt(x + 1, y, z);
    if (ly === 0) this._dirtyChunkAt(x, y - 1, z);
    if (ly === cs - 1) this._dirtyChunkAt(x, y + 1, z);
    if (lz === 0) this._dirtyChunkAt(x, y, z - 1);
    if (lz === cs - 1) this._dirtyChunkAt(x, y, z + 1);
  }

  _dirtyChunkAt(wx, wy, wz) {
    const cx = this.world.getChunkCoord(wx);
    const cy = this.world.getChunkCoord(wy);
    const cz = this.world.getChunkCoord(wz);
    const chunk = this.getChunk(cx, cy, cz);
    if (chunk) {
      // Cooldown protection: don't re-dirty if we just meshed this chunk in the last 400ms
      // This prevents "burst" meshing stutters.
      const now = performance.now();
      if (now - chunk.lastRebuildTime < 400 && chunk.meshes.size > 0) return;

      chunk.dirty = true;
      this.priorityDirtyChunkKeys.add(chunk.key);
    }
  }

  markChunksWithinBlockRadiusDirty(x, y, z, radius, prioritize = false) {
    const minCx = this.world.getChunkCoord(x - radius);
    const maxCx = this.world.getChunkCoord(x + radius);
    const minCy = this.world.getChunkCoord(y - radius);
    const maxCy = this.world.getChunkCoord(y + radius);
    const minCz = this.world.getChunkCoord(z - radius);
    const maxCz = this.world.getChunkCoord(z + radius);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = this.world.getChunkKey(cx, cy, cz);
          const chunk = this.chunks.get(key);
          if (!chunk) continue;
          chunk.dirty = true;
          if (prioritize) this.priorityDirtyChunkKeys.add(key);
        }
      }
    }
  }

  getByCoord(cx, cy, cz) {
    return this.chunks.get(this.world.getChunkKey(cx, cy, cz));
  }

  values() {
    return this.chunks.values();
  }

  entries() {
    return this.chunks.entries();
  }

  get size() {
    return this.chunks.size;
  }

  // ─── Loading ──────────────────────────────────────────────────────

  loadChunk(cx, cy, cz, forceSync = false) {
    const key = this.world.getChunkKey(cx, cy, cz);
    if (this.chunks.has(key)) {
      this.pendingChunkSet.delete(key);
      return;
    }
    const chunk = new Chunk(this.world, cx, cy, cz);
    this.chunks.set(key, chunk);
    try {
      chunk.resyncBlockKeysFromWorld?.();
      if (forceSync) {
        chunk.generateSync();
      } else {
        chunk.generate();
      }
      // Ensure any generated chunk is marked dirty so it rebuilds meshes on the next update
      if (!chunk.destroyed && (forceSync || chunk.blockKeys.size > 0)) {
        chunk.dirty = true;
        this.priorityDirtyChunkKeys.add(key);
        if (forceSync) chunk.update();
      }
    } catch (error) {
      console.warn('[ArloCraft] Chunk generation failed:', key, error);
      chunk.destroy();
      this.chunks.delete(key);
    } finally {
      this.pendingChunkSet.delete(key);
    }

    // --- Ambient Mob Spawning on Chunk Load ---
    const spawnRoll = this.world.hash2D(cx + 811, cz - 293);
    const canSpawn =
      spawnRoll > 0.94 &&
      this.world.game?.entities?.entities?.length <
        this.world.game?.entities?.maxEntities;

    if (canSpawn) {
      // Find a random surface point in the chunk
      const rx = Math.floor(this.world.hash2D(cx, cz) * this.world.chunkSize);
      const rz = Math.floor(this.world.hash2D(cz, cx) * this.world.chunkSize);
      const wx = cx * this.world.chunkSize + rx;
      const wz = cz * this.world.chunkSize + rz;
      const terrainY = this.world.getTerrainHeight(wx, wz);
      const waterSurfaceY = this.world.getWaterSurfaceYAt(wx, wz);
      const biomeId = this.world.getBiomeAt(wx, wz).id;
      const waterDepth =
        waterSurfaceY === null ? 0 : Math.max(0, Math.floor(waterSurfaceY - terrainY));
      const inWater = waterSurfaceY !== null && waterDepth >= 1;
      const wy = inWater ? waterSurfaceY - 0.9 : terrainY + 1.2;

      const isNight = this.world.game?.dayNight?.isNight?.() ?? false;
      const inCorruptedArea =
        this.world.isCorruptedAt?.(wx, wz) || this.world.corruptionEnabled;

      if (inWater) {
        const aquaticId = this.pickAmbientWaterMob(wx, wz, biomeId, waterDepth);
        this.world.game.entities.spawn(aquaticId, wx + 0.5, wy, wz + 0.5);
        return;
      }

      // Spawn hostile in dark/night/corrupted areas, otherwise passive friendlies
      if (isNight || inCorruptedArea) {
        this.world.game.entities.spawn('virus_grunt', wx + 0.5, wy, wz + 0.5);
      } else {
        const passives = ['cow', 'sheep', 'pig'];
        const picker = Math.floor(
          this.world.hash2D(wx + 77, wz - 31) * passives.length
        );
        this.world.game.entities.spawn(
          passives[picker],
          wx + 0.5,
          wy,
          wz + 0.5
        );
      }
    }
  }

  // ─── Unloading ────────────────────────────────────────────────────

  unloadFarChunks(centerCx, centerCz, minCy, maxCy) {
    const unloadRadius = this.world.renderDistance + 2;

    for (const [key, chunk] of this.chunks.entries()) {
      const dx = Math.abs(chunk.cx - centerCx);
      const dz = Math.abs(chunk.cz - centerCz);
      const withinVertical = chunk.cy >= minCy - 1 && chunk.cy <= maxCy + 1;
      if (dx <= unloadRadius && withinVertical && dz <= unloadRadius)
        continue;
      chunk.destroy();
      this.chunks.delete(key);
    }

    if (this.pendingChunkLoads.length > 0) {
      this.pendingChunkLoads = this.pendingChunkLoads.filter((pending) => {
        const dx = Math.abs(pending.cx - centerCx);
        const dz = Math.abs(pending.cz - centerCz);
        const keep =
          dx <= unloadRadius &&
          pending.cy >= minCy - 1 &&
          pending.cy <= maxCy + 1 &&
          dz <= unloadRadius;
        if (!keep) this.pendingChunkSet.delete(pending.key);
        return keep;
      });
    }
  }

  setRenderDistance(distance) {
    const val = Math.max(2, Math.min(6, Math.round(distance)));
    this.world.renderDistance = val;
    this.world.config.renderDistance = val;
  }

  // ─── Queued loading ───────────────────────────────────────────────

  queueChunkLoad(cx, cy, cz) {
    const key = this.world.getChunkKey(cx, cy, cz);
    if (this.chunks.has(key) || this.pendingChunkSet.has(key)) return;
    this.pendingChunkSet.add(key);
    this.pendingChunkLoads.push({ cx, cy, cz, key });
  }

  ensureChunksAround(centerCx, centerCz, minCy, maxCy) {
    const preloadRadius = this.world.renderDistance;
    for (let dx = -preloadRadius; dx <= preloadRadius; dx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let dz = -preloadRadius; dz <= preloadRadius; dz++) {
          this.queueChunkLoad(centerCx + dx, cy, centerCz + dz);
        }
      }
    }
  }

  ensureCriticalChunksWindow(centerCx, centerCy, centerCz, minCy, maxCy) {
    for (let dx = -1; dx <= 1; dx++) {
      for (
        let cy = Math.max(minCy, centerCy - 1);
        cy <= Math.min(maxCy, centerCy + 1);
        cy++
      ) {
        for (let dz = -1; dz <= 1; dz++) {
          const cx = centerCx + dx;
          const cz = centerCz + dz;
          const key = this.world.getChunkKey(cx, cy, cz);
          const chunk = this.chunks.get(key);
          if (!chunk) {
            const isInner = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
            this.loadChunk(cx, cy, cz, isInner);
            continue;
          }
          if (chunk.dirty && !chunk.destroyed) {
            this.priorityDirtyChunkKeys.add(key);
          }
        }
      }
    }
  }

  ensureCriticalChunks(centerCx, centerCy, centerCz, radius = 1) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const cx = centerCx + dx;
          const cy = centerCy + dy;
          const cz = centerCz + dz;
          const key = this.world.getChunkKey(cx, cy, cz);
          const chunk = this.chunks.get(key);
          if (!chunk) {
            const isInner =
              Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && Math.abs(dz) <= 1;
            this.loadChunk(cx, cy, cz, isInner);
            continue;
          }
          if (chunk.dirty && !chunk.destroyed) {
            this.priorityDirtyChunkKeys.add(key);
          }
        }
      }
    }
  }

  processChunkLoadQueue(centerCx, centerCy, centerCz, explicitBudget = null) {
    if (this.pendingChunkLoads.length === 0) return;

    let budget = explicitBudget;
    if (!Number.isFinite(budget)) {
      const tier = this.getQualityTier();
      if (tier === 'low') budget = 4;
      else if (tier === 'high') budget = 10;
      else budget = 6;
    }

    budget = Math.max(1, Math.floor(budget));
    const cx = Number.isFinite(centerCx) ? centerCx : 0;
    const cy = Number.isFinite(centerCy) ? centerCy : 0;
    const cz = Number.isFinite(centerCz) ? centerCz : 0;

    if (this.needsQueueSort) {
      this.pendingChunkLoads.sort((a, b) => {
        const adx = Math.abs(a.cx - cx);
        const ady = Math.abs(a.cy - cy);
        const adz = Math.abs(a.cz - cz);
        const bdx = Math.abs(b.cx - cx);
        const bdy = Math.abs(b.cy - cy);
        const bdz = Math.abs(b.cz - cz);
        return (
          adx * adx +
          ady * ady +
          adz * adz -
          (bdx * bdx + bdy * bdy + bdz * bdz)
        );
      });
      this.needsQueueSort = false;
    }

    while (budget > 0 && this.pendingChunkLoads.length > 0) {
      const next = this.pendingChunkLoads.shift();
      if (!next) break;
      this.loadChunk(next.cx, next.cy, next.cz);
      budget -= 1;
    }
  }

  // ─── Dirty-mesh rebuilds ──────────────────────────────────────────

  flushPriorityChunkRebuilds(limit = 4) {
    if (this.priorityDirtyChunkKeys.size === 0) return;
    let rebuilt = 0;
    const keys = Array.from(this.priorityDirtyChunkKeys);
    for (let i = 0; i < keys.length; i++) {
      if (rebuilt >= limit) break;
      const key = keys[i];
      const chunk = this.chunks.get(key);
      if (!chunk || chunk.destroyed || !chunk.dirty) {
        this.priorityDirtyChunkKeys.delete(key);
        continue;
      }
      chunk.update();
      rebuilt += 1;
      this.priorityDirtyChunkKeys.delete(key);
    }
  }

  processDirtyChunkRebuilds(playerPosition) {
    if (!playerPosition) return;

    const pcx = this.world.getChunkCoord(playerPosition.x);
    const pcy = this.world.getChunkCoord(playerPosition.y);
    const pcz = this.world.getChunkCoord(playerPosition.z);

    const settings = this.world.game?.settings || {};
    const tier = this.getQualityTier();
    const rebuildCap = tier === 'low' ? 1 : tier === 'high' ? 3 : 2;
    const maxRebuildsPerFrame = Math.min(
      settings.chunkRebuildBudget ?? 2,
      rebuildCap
    );
    const stabilityMode = settings.stabilityMode ?? false;

    // 1. Emergency rebuilds: keep the current chunk responsive without
    // invalidating a whole cube around the player every time they move.
    let rebuildsDone = 0;

    const emergencyRadius = tier === 'high' ? 1 : 0;
    for (let dx = -emergencyRadius; dx <= emergencyRadius; dx++) {
      for (let dy = -emergencyRadius; dy <= emergencyRadius; dy++) {
        for (let dz = -emergencyRadius; dz <= emergencyRadius; dz++) {
          if (rebuildsDone >= maxRebuildsPerFrame) break;
          const key = this.world.getChunkKey(pcx + dx, pcy + dy, pcz + dz);
          const chunk = this.chunks.get(key);
          if (chunk?.dirty && !chunk.destroyed) {
            chunk.update();
            chunk.lastRebuildTime = performance.now();
            rebuildsDone++;
          }
        }
      }
    }

    // Adjust priority flush based on stability mode (slower but smoother in stability mode)
    const priorityLimit = stabilityMode ? 1 : tier === 'high' ? 2 : 1;
    this.flushPriorityChunkRebuilds(priorityLimit);

    const cs = this.world.chunkSize;
    const px = playerPosition.x,
      py = playerPosition.y,
      pz = playerPosition.z;

    // Precompute sort keys — avoids getTerrainHeight calls inside comparator
    const chunks = [];
    for (const c of this.chunks.values()) {
      if (!c.dirty || c.destroyed) continue;
      const wx = c.cx * cs,
        wy = c.cy * cs,
        wz = c.cz * cs;
      const h = wy + cs / 2; // Center height of cube for distance sorting
      const dSq = (wx - px) ** 2 + (h - py) ** 2 + (wz - pz) ** 2;
      chunks.push({ chunk: c, dSq });
    }

    if (chunks.length === 0) return;
    chunks.sort((a, b) => a.dSq - b.dSq);

    const remainingRebuildBudget = Math.max(
      0,
      maxRebuildsPerFrame - rebuildsDone
    );
    if (remainingRebuildBudget === 0) return;

    const startTime = performance.now();
    const frameBudgetMs = stabilityMode
      ? 1.0
      : tier === 'high'
        ? 2.2
        : 1.4;
    let rebuilt = 0;

    for (let i = 0; i < chunks.length; i++) {
      if (performance.now() - startTime > frameBudgetMs) break;
      if (rebuilt >= remainingRebuildBudget) break;
      const c = chunks[i].chunk;
      c.update();
      c.lastRebuildTime = performance.now();
      rebuilt += 1;
    }

    if (rebuilt > 0) {
      // console.debug(`[ChunkManager] Rebuilt ${rebuilt} chunks in ${(performance.now() - startTime).toFixed(2)}ms`);
    }
  }

  // ─── Mesh-color sanity audit ──────────────────────────────────────

  ensureChunkMeshColorSanity(limit = 10) {
    this.colorSanityTick = (this.colorSanityTick + 1) % 60;
    if (this.colorSanityTick !== 0) return;

    let flagged = 0;
    for (const [key, chunk] of this.chunks.entries()) {
      if (flagged >= limit) break;
      if (!chunk || chunk.destroyed || chunk.dirty) continue;

      let needsRebuild = false;
      for (const mesh of chunk.meshes.values()) {
        if (!mesh) continue;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        let hasVertexColors = false;
        for (let i = 0; i < materials.length; i++) {
          if (materials[i]?.vertexColors) {
            hasVertexColors = true;
            break;
          }
        }
        const hasGeometryColors = Boolean(mesh.geometry?.getAttribute?.('color'));
        const isInstanced = Boolean(mesh.isInstancedMesh);
        const hasInstanceColor = Boolean(mesh.instanceColor);
        if (hasVertexColors) {
          if (isInstanced) {
            if (!hasInstanceColor && !hasGeometryColors) {
              needsRebuild = true;
              break;
            }
          } else if (!hasGeometryColors) {
            needsRebuild = true;
            break;
          }
        } else if (hasGeometryColors || hasInstanceColor) {
          needsRebuild = true;
          break;
        }
      }

      if (!needsRebuild) continue;
      chunk.dirty = true;
      this.priorityDirtyChunkKeys.add(key);
      flagged += 1;
    }
  }

  // ─── Visibility ───────────────────────────────────────────────────

  forceAllVisible() {
    for (const chunk of this.chunks.values()) {
      if (!chunk.visible) chunk.setVisible(true);
    }
  }

  // ─── Clear all ────────────────────────────────────────────────────

  clearAll() {
    for (const chunk of this.chunks.values()) {
      chunk.destroy();
    }
    this.chunks.clear();
    this.pendingChunkLoads.length = 0;
    this.pendingChunkSet.clear();
    this.priorityDirtyChunkKeys.clear();
    this.lastPlayerChunkKey = null;
    this.forceVisibilityResetPending = true;
    this.forceFullRemeshPending = true;
  }

  // ─── Per-frame update ─────────────────────────────────────────────

  update(playerPosition, delta) {
    if (!playerPosition) return;

    const playerCx = this.world.getChunkCoord(playerPosition.x);
    const playerCy = this.world.getChunkCoord(playerPosition.y);
    const playerCz = this.world.getChunkCoord(playerPosition.z);
    const verticalWindow = this.getVerticalStreamingWindow(
      playerPosition,
      playerCy
    );
    this.lastStreamingWindow = verticalWindow;
    const key = this.world.getChunkKey(playerCx, playerCy, playerCz);

    // Force visibility re-sync during resume grace period
    if (this.world.game?.resumeGraceFrames > 0) {
      this.forceVisibilityResetPending = true;
    }

    if (this.forceFullRemeshPending) {
      for (const chunk of this.chunks.values()) chunk.dirty = true;
      this.forceFullRemeshPending = false;
    }

    this.ensureChunkMeshColorSanity();
    this.processDirtyChunkRebuilds(playerPosition);

    // Always ensure current chunk is loaded and meshed
    if (!this.chunks.has(key)) {
      this.loadChunk(playerCx, playerCy, playerCz, true);
    }

    if (this.lastPlayerChunkKey !== key) {
      this.unloadFarChunks(
        playerCx,
        playerCz,
        verticalWindow.minCy,
        verticalWindow.maxCy
      );
      this.ensureChunksAround(
        playerCx,
        playerCz,
        verticalWindow.minCy,
        verticalWindow.maxCy
      );

      // Prioritize already-dirty nearby chunks instead of dirtying clean ones.
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const ck = this.world.getChunkKey(
              playerCx + dx,
              playerCy + dy,
              playerCz + dz
            );
            const c = this.chunks.get(ck);
            if (c?.dirty) this.priorityDirtyChunkKeys.add(ck);
          }
        }
      }

      this.lastPlayerChunkKey = key;
      this.chunkRefreshTick = 0;
      this.needsQueueSort = true; // Trigger sort on next process
    }

    this.chunkRefreshTick = (this.chunkRefreshTick + 1) % 24;
    if (this.chunkRefreshTick === 0) {
      this.ensureChunksAround(
        playerCx,
        playerCz,
        verticalWindow.minCy,
        verticalWindow.maxCy
      );
    }

    this.criticalChunkTick = (this.criticalChunkTick + 1) % 8;
    if (this.criticalChunkTick === 0) {
      this.ensureCriticalChunksWindow(
        playerCx,
        playerCy,
        playerCz,
        verticalWindow.minCy,
        verticalWindow.maxCy
      );
    }
    this.processChunkLoadQueue(playerCx, playerCy, playerCz);
    this.forceVisibilityResetPending = false;
  }
}
