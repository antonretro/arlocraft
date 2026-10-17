import { Chunk } from './Chunk.js';
import { BlockTextureArray } from '../voxel/render/BlockTextureArray.js';
import { BlockRenderTable } from '../voxel/render/BlockRenderTable.js';
import { createChunkMaterials } from '../voxel/render/chunkMaterials.js';
import { PAD } from '../voxel/mesh/meshChunk.js';
import {
  CHUNK_SIZE,
  CHUNK_SHIFT,
  CHUNK_MASK,
  chunkKeyOf,
} from '../voxel/VoxelStore.js';

// Main-thread milliseconds per frame for installing terrain and meshes.
const INSTALL_BUDGET_MS = 4;

/**
 * ChunkManager — decides which chunks exist and keeps them meshed.
 *
 * Each frame it:
 *   1. works out the wanted chunks (a circle of columns around the player,
 *      over the vertical window that covers the terrain surface),
 *   2. unloads chunks that fell out of range,
 *   3. sends the nearest missing chunks to the worker pool for generation,
 *   4. installs finished terrain within a small time budget,
 *   5. sends dirty chunks (nearest first, edits near the player first) to
 *      the workers for meshing and swaps in the finished meshes.
 */
export class ChunkManager {
  constructor(world) {
    this.world = world;
    this.chunks = new Map(); // chunkKey -> Chunk
    this.genQueue = []; // chunks waiting for generation, nearest first
    this.dirtyChunks = new Set();
    this.priorityDirtyChunkKeys = new Set();
    this.finishedGen = [];
    this.finishedMesh = [];
    this.spawnedMobColumns = new Set();
    this.lastPlayerChunkKey = null;
    this.playerChunk = { cx: 0, cy: 0, cz: 0 };
    this.lastStreamingWindow = {
      mode: 'surface',
      minCy: 0,
      maxCy: 0,
      aboveRadius: 0,
      belowRadius: 0,
      surfaceChunkCy: 0,
    };
    this.generationEpoch = 0;
    this.tintCache = new Map(); // "cx|cz" -> Uint32Array(256)

    // Layer size follows the texture pack (16px default, HD packs up to 64).
    const packSize = world.blockRegistry?.resourceManager?.textureSize ?? 16;
    this.textures = new BlockTextureArray({
      size: packSize,
      capacity: packSize > 32 ? 1024 : 2048,
    });
    this.renderTable = new BlockRenderTable(world, this.textures);
    this.materials = createChunkMaterials(this.textures.texture);
    this.stats = { generated: 0, meshed: 0, lastInstallMs: 0 };
  }

  get pendingChunkLoads() {
    return this.genQueue;
  }

  getQualityTier() {
    return this.world.game?.qualityTier ?? 'balanced';
  }

  pickAmbientWaterMob(wx, wz, biomeId, waterDepth = 0) {
    if (
      waterDepth >= 5 &&
      this.world.hash2D(wx * 0.37 + 7, wz * 0.41 - 3) > 0.74
    ) {
      return this.world.hash2D(wx * 0.19 + 5, wz * 0.23 - 11) > 0.55
        ? 'glow_squid'
        : 'void_jelly';
    }

    if (
      biomeId === 'desert' ||
      biomeId === 'lush_grove' ||
      biomeId === 'swamp'
    ) {
      return 'tropical_fish';
    }
    if (
      biomeId === 'alpine' ||
      biomeId === 'tundra' ||
      biomeId === 'snow' ||
      biomeId === 'highlands'
    ) {
      return 'salmon';
    }
    return 'cod';
  }

  // ─── Streaming window ─────────────────────────────────────────────

  getVerticalStreamingWindow(playerPosition, centerCy) {
    const surface = this.getSurfaceChunkRange(playerPosition);
    const underground =
      playerPosition.y <
      this.world.getTerrainHeight(playerPosition.x, playerPosition.z) - 8;
    const below = underground ? 2 : 1;
    const minCy = Math.min(centerCy - below, surface.minSurfaceCy - 1);
    const maxCy = Math.max(centerCy + 1, surface.maxSurfaceCy);
    return {
      mode: underground ? 'underground' : 'surface',
      minCy,
      maxCy,
      aboveRadius: maxCy - centerCy,
      belowRadius: centerCy - minCy,
      surfaceChunkCy: surface.minSurfaceCy,
    };
  }

  getSurfaceChunkRange(playerPosition) {
    const cs = this.world.chunkSize;
    const pcx = this.world.getChunkCoord(playerPosition.x);
    const pcz = this.world.getChunkCoord(playerPosition.z);
    const radius = this.getRadius();
    const cacheKey = `${pcx},${pcz},${radius}`;
    if (this._surfaceRangeKey === cacheKey) return this._surfaceRange;

    let minH = Infinity;
    let maxH = -Infinity;
    const step = Math.max(1, Math.floor(radius / 3));
    for (let dx = -radius; dx <= radius; dx += step) {
      for (let dz = -radius; dz <= radius; dz += step) {
        const h = this.world.getTerrainHeight(
          (pcx + dx) * cs + cs / 2,
          (pcz + dz) * cs + cs / 2
        );
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    this._surfaceRangeKey = cacheKey;
    this._surfaceRange = {
      minSurfaceCy: this.world.getChunkCoord(
        Math.min(minH, this.world.seaLevel)
      ),
      // Trees and structures rise above the terrain surface.
      maxSurfaceCy: this.world.getChunkCoord(maxH + 12),
    };
    return this._surfaceRange;
  }

  getRadius() {
    return Math.max(2, Math.round(Number(this.world.renderDistance) || 4));
  }

  // ─── Chunk accessors ──────────────────────────────────────────────

  has(key) {
    return this.chunks.has(key);
  }

  get(key) {
    return this.chunks.get(key);
  }

  getChunk(cx, cy, cz) {
    return this.chunks.get(chunkKeyOf(cx, cy, cz));
  }

  getByCoord(cx, cy, cz) {
    return this.getChunk(cx, cy, cz);
  }

  values() {
    return this.chunks.values();
  }

  entries() {
    return this.chunks.entries();
  }

  getBlockAt(x, y, z) {
    return this.world.voxels.get(Math.round(x), Math.round(y), Math.round(z));
  }

  // ─── Dirty tracking ───────────────────────────────────────────────

  markDirty(chunk) {
    if (chunk.destroyed) return;
    this.dirtyChunks.add(chunk);
  }

  /**
   * Called after any block write: keeps the special-block index current and
   * remeshes the chunk (and the neighbour across a border).
   */
  onBlockChanged(x, y, z) {
    const chunk = this.getChunk(
      x >> CHUNK_SHIFT,
      y >> CHUNK_SHIFT,
      z >> CHUNK_SHIFT
    );
    if (chunk && chunk.state === 'ready') {
      const key = this.world.getKey(x, y, z);
      const num = this.world.voxels.getNumeric(x, y, z);
      if (num !== 0 && this.renderTable.isSpecial(num))
        chunk.blockKeys.add(key);
      else chunk.blockKeys.delete(key);
      chunk.dirty = true;
      this.priorityDirtyChunkKeys.add(chunk.key);
    }
    this.updateNeighborsDirty(x, y, z);
  }

  updateNeighborsDirty(x, y, z) {
    const lx = x & CHUNK_MASK;
    const ly = y & CHUNK_MASK;
    const lz = z & CHUNK_MASK;
    if (lx === 0) this._dirtyChunkAt(x - 1, y, z);
    if (lx === CHUNK_MASK) this._dirtyChunkAt(x + 1, y, z);
    if (ly === 0) this._dirtyChunkAt(x, y - 1, z);
    if (ly === CHUNK_MASK) this._dirtyChunkAt(x, y + 1, z);
    if (lz === 0) this._dirtyChunkAt(x, y, z - 1);
    if (lz === CHUNK_MASK) this._dirtyChunkAt(x, y, z + 1);
  }

  _dirtyChunkAt(wx, wy, wz) {
    const chunk = this.getChunk(
      wx >> CHUNK_SHIFT,
      wy >> CHUNK_SHIFT,
      wz >> CHUNK_SHIFT
    );
    if (chunk && chunk.state === 'ready') {
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
          const chunk = this.getChunk(cx, cy, cz);
          if (!chunk || chunk.state !== 'ready') continue;
          chunk.dirty = true;
          if (prioritize) this.priorityDirtyChunkKeys.add(chunk.key);
        }
      }
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────

  queueChunkLoad(cx, cy, cz) {
    const key = chunkKeyOf(cx, cy, cz);
    if (this.chunks.has(key)) return this.chunks.get(key);
    const chunk = new Chunk(this.world, cx, cy, cz);
    this.chunks.set(key, chunk);
    this.genQueue.push(chunk);
    this.needsQueueSort = true;
    return chunk;
  }

  /** Generates a chunk right now on the main thread (spawn, teleports). */
  loadChunk(cx, cy, cz, forceSync = false) {
    const chunk = this.queueChunkLoad(cx, cy, cz);
    if (forceSync && chunk.state === 'queued') {
      this.genQueue = this.genQueue.filter((c) => c !== chunk);
      chunk.generateSync();
      this.onChunkInstalled(chunk);
    }
    return chunk;
  }

  ensureChunksAround(centerCx, centerCz, minCy, maxCy) {
    const edits = this.world.state.changedBlocks;
    const r = this.getRadius();
    const r2 = (r + 0.5) * (r + 0.5);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r2) continue;
        const top = Math.max(
          maxCy,
          edits.topEditedLayer(centerCx + dx, centerCz + dz) ?? maxCy
        );
        for (let cy = minCy; cy <= top; cy++) {
          this.queueChunkLoad(centerCx + dx, cy, centerCz + dz);
        }
      }
    }
  }

  /** Synchronously loads and meshes the chunks right around a point. */
  ensureCriticalChunks(centerCx, centerCy, centerCz, radius = 1) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          this.loadChunk(centerCx + dx, centerCy + dy, centerCz + dz, true);
        }
      }
    }
  }

  ensureCriticalChunksWindow(centerCx, centerCy, centerCz) {
    this.ensureCriticalChunks(centerCx, centerCy, centerCz, 1);
  }

  sortGenQueue() {
    const { cx, cy, cz } = this.playerChunk;
    const surfaceCy = this.lastStreamingWindow.surfaceChunkCy;
    for (const c of this.genQueue) {
      const dx = c.cx - cx;
      const dz = c.cz - cz;
      // Prefer the surface layers and the player's own layer.
      const dy = Math.min(Math.abs(c.cy - cy), Math.abs(c.cy - surfaceCy));
      c._priority = dx * dx + dz * dz + dy * dy * 2;
    }
    this.genQueue.sort((a, b) => a._priority - b._priority);
    this.needsQueueSort = false;
  }

  /** Sends queued chunks to the workers. `budget` caps sync fallbacks. */
  processChunkLoadQueue(centerCx, centerCy, centerCz, explicitBudget = null) {
    if (
      Number.isFinite(explicitBudget) &&
      explicitBudget > 0 &&
      Number.isFinite(centerCx)
    ) {
      // Called by physics while waiting for ground: load nearby chunks now.
      this.ensureCriticalChunks(centerCx, centerCy, centerCz, 1);
    }
    if (this.needsQueueSort) this.sortGenQueue();
    const gen = this.world.chunkGenerator;
    if (!gen) return;
    const epoch = this.generationEpoch;
    while (this.genQueue.length > 0 && gen.canGenerate) {
      const chunk = this.genQueue.shift();
      if (chunk.destroyed || chunk.state !== 'queued') continue;
      chunk.state = 'generating';
      gen
        .generate({
          cx: chunk.cx,
          cy: chunk.cy,
          cz: chunk.cz,
          seedString: this.world.seedString,
          corruptionEnabled: Boolean(this.world.corruptionEnabled),
          cavesEnabled: this.world.game?.features?.caves !== false,
        })
        .then((result) => {
          if (epoch !== this.generationEpoch) return;
          this.finishedGen.push({ chunk, result });
          // Keep the workers busy without waiting for the next frame.
          this.processChunkLoadQueue();
        })
        .catch((error) => {
          console.warn(
            '[ArloCraft] Chunk generation failed:',
            chunk.key,
            error
          );
          if (!chunk.destroyed) chunk.state = 'queued';
        });
    }
  }

  installFinished(deadline) {
    while (this.finishedGen.length > 0 && performance.now() < deadline) {
      const { chunk, result } = this.finishedGen.shift();
      if (chunk.destroyed || chunk.state !== 'generating') continue;
      chunk.installTerrain(result);
      this.onChunkInstalled(chunk);
    }
  }

  onChunkInstalled(chunk) {
    this.stats.generated++;
    // Neighbours were meshed against air on this side: remesh them.
    const { cx, cy, cz } = chunk;
    for (const [dx, dy, dz] of NEIGHBOURS) {
      const n = this.getChunk(cx + dx, cy + dy, cz + dz);
      if (n && n.state === 'ready') n.dirty = true;
    }
    this.spawnAmbientMob(chunk);
  }

  // ─── Meshing ──────────────────────────────────────────────────────

  buildPadded(chunk) {
    const voxels = this.world.voxels;
    const padded = new Uint16Array(PAD * PAD * PAD);
    const { cx, cy, cz } = chunk;
    // Fetch the 27 surrounding arrays once.
    const arrays = new Array(27);
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          arrays[(dy + 1) * 9 + (dz + 1) * 3 + (dx + 1)] = voxels.getChunkArray(
            cx + dx,
            cy + dy,
            cz + dz
          );

    let p = 0;
    for (let y = -1; y <= CHUNK_SIZE; y++) {
      const sy = y < 0 ? 0 : y >= CHUNK_SIZE ? 2 : 1;
      const ly = y & CHUNK_MASK;
      for (let z = -1; z <= CHUNK_SIZE; z++) {
        const sz = z < 0 ? 0 : z >= CHUNK_SIZE ? 2 : 1;
        const lz = z & CHUNK_MASK;
        for (let x = -1; x <= CHUNK_SIZE; x++, p++) {
          const sx = x < 0 ? 0 : x >= CHUNK_SIZE ? 2 : 1;
          const arr = arrays[sy * 9 + sz * 3 + sx];
          if (!arr) continue;
          padded[p] = arr[(ly << 8) | (lz << 4) | (x & CHUNK_MASK)];
        }
      }
    }
    return padded;
  }

  getTints(cx, cz) {
    const key = `${cx}|${cz}`;
    let tints = this.tintCache.get(key);
    if (tints) return tints;
    tints = new Uint32Array(CHUNK_SIZE * CHUNK_SIZE);
    const bx = cx * CHUNK_SIZE;
    const bz = cz * CHUNK_SIZE;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        tints[x + z * CHUNK_SIZE] =
          this.world.terrain.getBlendedColor(bx + x, bz + z, 'color') >>> 0;
      }
    }
    if (this.tintCache.size > 4096) this.tintCache.clear();
    this.tintCache.set(key, tints);
    return tints;
  }

  dispatchMeshes() {
    const gen = this.world.chunkGenerator;
    if (!gen || this.dirtyChunks.size === 0) return;
    if (!gen.canMesh) return;

    // Edits near the player first, then nearest dirty chunks.
    const order = [];
    for (const key of this.priorityDirtyChunkKeys) {
      const c = this.chunks.get(key);
      if (c && this.dirtyChunks.has(c)) order.push(c);
    }
    this.priorityDirtyChunkKeys.clear();
    if (order.length < 8) {
      const { cx, cy, cz } = this.playerChunk;
      const rest = [];
      for (const c of this.dirtyChunks) {
        if (c.state !== 'ready' || c.meshing) continue;
        const dx = c.cx - cx;
        const dy = c.cy - cy;
        const dz = c.cz - cz;
        c._priority = dx * dx + dy * dy + dz * dz;
        rest.push(c);
      }
      rest.sort((a, b) => a._priority - b._priority);
      order.push(...rest);
    }

    for (const chunk of order) {
      if (!gen.canMesh) break;
      if (chunk.destroyed || chunk.state !== 'ready' || chunk.meshing) continue;
      this.dirtyChunks.delete(chunk);
      chunk._dirty = false;
      this.meshChunk(chunk);
    }
  }

  meshChunk(chunk) {
    const gen = this.world.chunkGenerator;
    const padded = this.buildPadded(chunk);
    // Make sure the render table describes every block in the neighbourhood.
    let added = false;
    for (let i = 0; i < padded.length; i++) {
      const num = padded[i];
      if (num !== 0 && this.renderTable.ensure(num)) added = true;
    }
    if (added || this.renderTable.dirty) {
      this.renderTable.dirty = false;
      gen.setBlockTable(this.renderTable.table.slice());
    }
    const version = ++chunk.meshVersion;
    chunk.meshing = true;
    gen
      .mesh(padded, this.getTints(chunk.cx, chunk.cz))
      .then((groups) => this.finishedMesh.push({ chunk, groups, version }))
      .catch((error) => {
        console.warn('[ArloCraft] Chunk meshing failed:', chunk.key, error);
        chunk.meshing = false;
        if (!chunk.destroyed) chunk.dirty = true;
      });
  }

  applyFinishedMeshes(deadline) {
    while (this.finishedMesh.length > 0 && performance.now() < deadline) {
      const { chunk, groups, version } = this.finishedMesh.shift();
      chunk.meshing = false;
      if (chunk.destroyed) continue;
      if (version !== chunk.meshVersion) continue;
      chunk.applyVoxelMeshes(groups, this.materials);
      chunk.update(); // special blocks (instanced)
      chunk.meshedVersion = version;
      this.stats.meshed++;
    }
  }

  /** Meshes chunks synchronously (used while waiting for spawn ground). */
  flushPriorityChunkRebuilds() {
    // Meshing is asynchronous now; dispatch whatever is waiting.
    this.dispatchMeshes();
  }

  processDirtyChunkRebuilds() {
    this.dispatchMeshes();
  }

  // ─── Unloading ────────────────────────────────────────────────────

  unloadFarChunks(centerCx, centerCz, minCy, maxCy) {
    const edits = this.world.state.changedBlocks;
    const r = this.getRadius() + 1;
    const r2 = (r + 0.5) * (r + 0.5);
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - centerCx;
      const dz = chunk.cz - centerCz;
      const top = Math.max(
        maxCy,
        edits.topEditedLayer(chunk.cx, chunk.cz) ?? maxCy
      );
      const inside =
        dx * dx + dz * dz <= r2 && chunk.cy >= minCy - 1 && chunk.cy <= top + 1;
      if (inside) continue;
      this.destroyChunk(key, chunk);
    }
    this.genQueue = this.genQueue.filter((c) => !c.destroyed);
  }

  destroyChunk(key, chunk) {
    chunk.destroy();
    this.chunks.delete(key);
    this.dirtyChunks.delete(chunk);
    this.priorityDirtyChunkKeys.delete(key);
  }

  setRenderDistance(distance) {
    const val = Math.max(2, Math.min(16, Math.round(distance)));
    this.world.renderDistance = val;
    this.world.config.renderDistance = val;
    this.lastPlayerChunkKey = null;
    this._surfaceRangeKey = null;
  }

  forceAllVisible() {
    for (const chunk of this.chunks.values()) chunk.setVisible(true);
  }

  clearAll() {
    for (const [key, chunk] of this.chunks) this.destroyChunk(key, chunk);
    this.chunks.clear();
    this.genQueue.length = 0;
    this.finishedGen.length = 0;
    this.finishedMesh.length = 0;
    this.dirtyChunks.clear();
    this.priorityDirtyChunkKeys.clear();
    this.spawnedMobColumns.clear();
    this.tintCache.clear();
    this.generationEpoch++;
    this.lastPlayerChunkKey = null;
    this._surfaceRangeKey = null;
  }

  // ─── Mobs ─────────────────────────────────────────────────────────

  spawnAmbientMob(chunk) {
    const { cx, cy, cz } = chunk;
    // One roll per column per session, on the layer holding the surface.
    const columnKey = `${cx}|${cz}`;
    if (this.spawnedMobColumns.has(columnKey)) return;
    const cs = this.world.chunkSize;
    const surfaceY = this.world.getTerrainHeight(
      cx * cs + cs / 2,
      cz * cs + cs / 2
    );
    if (this.world.getChunkCoord(surfaceY) !== cy) return;
    this.spawnedMobColumns.add(columnKey);

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
        waterSurfaceY === null
          ? 0
          : Math.max(0, Math.floor(waterSurfaceY - terrainY));
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

  // ─── Per-frame update ─────────────────────────────────────────────

  update(playerPosition) {
    if (!playerPosition) return;
    const frameStart = performance.now();
    this.textures.update();

    const pcx = this.world.getChunkCoord(playerPosition.x);
    const pcy = this.world.getChunkCoord(playerPosition.y);
    const pcz = this.world.getChunkCoord(playerPosition.z);
    this.playerChunk.cx = pcx;
    this.playerChunk.cy = pcy;
    this.playerChunk.cz = pcz;
    const key = chunkKeyOf(pcx, pcy, pcz);

    const edits = this.world.state.changedBlocks;
    if (edits.topLayersChanged) {
      // A build rose into a new layer: make sure that layer is loaded.
      edits.topLayersChanged = false;
      this.lastPlayerChunkKey = null;
    }
    if (this.lastPlayerChunkKey !== key) {
      const window = this.getVerticalStreamingWindow(playerPosition, pcy);
      this.lastStreamingWindow = window;
      this.unloadFarChunks(pcx, pcz, window.minCy, window.maxCy);
      this.ensureChunksAround(pcx, pcz, window.minCy, window.maxCy);
      this.lastPlayerChunkKey = key;
      this.needsQueueSort = true;
    }

    // The player's own column must exist right away so they never fall
    // through unloaded ground (spawn, teleports, fast flight).
    for (let dy = -1; dy <= 1; dy++) {
      const c = this.getChunk(pcx, pcy + dy, pcz);
      if (!c || c.state === 'queued') this.loadChunk(pcx, pcy + dy, pcz, true);
    }

    // Spend a little longer per frame while catching up on a backlog
    // (after loading a save or teleporting).
    const backlog = this.finishedGen.length + this.finishedMesh.length;
    const budget = INSTALL_BUDGET_MS + Math.min(8, backlog / 16);
    const deadline = frameStart + budget;
    this.applyFinishedMeshes(deadline);
    this.dispatchMeshes();
    this.installFinished(deadline);
    this.processChunkLoadQueue();
    this.stats.lastInstallMs = performance.now() - frameStart;
  }
}

const NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
