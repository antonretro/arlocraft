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
        this.chunks = new Map();                // chunkKey → Chunk
        this.pendingChunkLoads = [];            // { cx, cz, key }
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
        return this.world.state.blockMap.get(this.world.getKey(Math.round(x), Math.round(y), Math.round(z))) ?? null;
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
        const canSpawn = spawnRoll > 0.94 && this.world.game?.entities?.entities?.length < this.world.game?.entities?.maxEntities;
        
        if (canSpawn) {
            // Find a random surface point in the chunk
            const rx = Math.floor(this.world.hash2D(cx, cz) * this.world.chunkSize);
            const rz = Math.floor(this.world.hash2D(cz, cx) * this.world.chunkSize);
            const wx = (cx * this.world.chunkSize) + rx;
            const wz = (cz * this.world.chunkSize) + rz;
            const wy = this.world.getTerrainHeight(wx, wz) + 1.2;
            
            const isNight = this.world.dayNightSystem?.isNight?.() ?? false;
            const inCorruptedArea = this.world.isCorruptedAt?.(wx, wz) || this.world.corruptionEnabled;
            
            // Spawn hostile in dark/night/corrupted areas, otherwise passive friendlies
            if (isNight || inCorruptedArea) {
                this.world.game.entities.spawn('virus_grunt', wx + 0.5, wy, wz + 0.5);
            } else {
                const passives = ['cow', 'sheep', 'pig'];
                const picker = Math.floor(this.world.hash2D(wx + 77, wz - 31) * passives.length);
                this.world.game.entities.spawn(passives[picker], wx + 0.5, wy, wz + 0.5);
            }
        }
    }

    // ─── Unloading ────────────────────────────────────────────────────

    unloadFarChunks(centerCx, centerCy, centerCz) {
        const unloadRadius = this.world.renderDistance + 3;
        const vUnloadRadius = (this.world.config.renderDistance.vertical || 2) + 2;

        for (const [key, chunk] of this.chunks.entries()) {
            const dx = Math.abs(chunk.cx - centerCx);
            const dy = Math.abs(chunk.cy - centerCy);
            const dz = Math.abs(chunk.cz - centerCz);
            if (dx <= unloadRadius && dy <= vUnloadRadius && dz <= unloadRadius) continue;
            chunk.destroy();
            this.chunks.delete(key);
        }

        if (this.pendingChunkLoads.length > 0) {
            this.pendingChunkLoads = this.pendingChunkLoads.filter((pending) => {
                const dx = Math.abs(pending.cx - centerCx);
                const dy = Math.abs(pending.cy - centerCy);
                const dz = Math.abs(pending.cz - centerCz);
                const keep = dx <= unloadRadius && dy <= vUnloadRadius && dz <= unloadRadius;
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

    ensureChunksAround(centerCx, centerCy, centerCz) {
        const preloadRadius = this.world.renderDistance + 1;
        const vRadius = (this.world.config.renderDistance.vertical || 2);
        for (let dx = -preloadRadius; dx <= preloadRadius; dx++) {
            for (let dy = -vRadius; dy <= vRadius; dy++) {
                for (let dz = -preloadRadius; dz <= preloadRadius; dz++) {
                    this.queueChunkLoad(centerCx + dx, centerCy + dy, centerCz + dz);
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
                        const isInner = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && Math.abs(dz) <= 1;
                        this.loadChunk(cx, cy, cz, isInner);
                        continue;
                    }
                    if (chunk.dirty && !chunk.destroyed) {
                        chunk.update();
                    }
                }
            }
        }
    }

    processChunkLoadQueue(centerCx, centerCy, centerCz, explicitBudget = null) {
        if (this.pendingChunkLoads.length === 0) return;

        let budget = explicitBudget;
        if (!Number.isFinite(budget)) {
            const tier = this.world.game?.qualityTier ?? 'balanced';
            if (tier === 'low') budget = 6;
            else if (tier === 'high') budget = 14;
            else budget = 10;
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
                return (adx * adx) + (ady * ady) + (adz * adz) - ((bdx * bdx) + (bdy * bdy) + (bdz * bdz));
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

        // 1. Emergency Rebuilds: Immediate 5x5 chunks ignore budget
        // Budgeted dirty chunk rebuilds to prevent frame-rate freezing.
        // We only process up to 2 dirty chunks per frame, prioritizing the central 5x5 area.
        let rebuildsDone = 0;
        const maxRebuildsPerFrame = 2;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (rebuildsDone >= maxRebuildsPerFrame) break;
                    const key = this.world.getChunkKey(pcx + dx, pcy + dy, pcz + dz);
                    const chunk = this.chunks.get(key);
                    if (chunk?.dirty && !chunk.destroyed) {
                        chunk.update();
                        rebuildsDone++;
                    }
                }
            }
        }

        this.flushPriorityChunkRebuilds(2); 

        const cs = this.world.chunkSize;
        const px = playerPosition.x, py = playerPosition.y, pz = playerPosition.z;

        // Precompute sort keys — avoids getTerrainHeight calls inside comparator
        const chunks = [];
        for (const c of this.chunks.values()) {
            if (!c.dirty || c.destroyed) continue;
            const wx = c.cx * cs, wy = c.cy * cs, wz = c.cz * cs;
            const h = wy + (cs / 2); // Center height of cube for distance sorting
            const dSq = (wx - px) ** 2 + (h - py) ** 2 + (wz - pz) ** 2;
            chunks.push({ chunk: c, dSq });
        }

        if (chunks.length === 0) return;
        chunks.sort((a, b) => a.dSq - b.dSq);

        const startTime = performance.now();
        const frameBudgetMs = 3.5; // Strict budget for chunk meshing per frame
        let rebuilt = 0;

        for (let i = 0; i < chunks.length; i++) {
            if (performance.now() - startTime > frameBudgetMs) break;
            chunks[i].chunk.update();
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
            for (const mesh of chunk.instancedMeshes.values()) {
                if (!mesh) continue;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                let hasVertexColors = false;
                for (let i = 0; i < materials.length; i++) {
                    if (materials[i]?.vertexColors) {
                        hasVertexColors = true;
                        break;
                    }
                }
                const hasInstanceColor = Boolean(mesh.instanceColor);
                if ((hasVertexColors && !hasInstanceColor) || (!hasVertexColors && hasInstanceColor)) {
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
            this.unloadFarChunks(playerCx, playerCy, playerCz);
            this.ensureChunksAround(playerCx, playerCy, playerCz);
            
            // Boundary Flush: Force remesh 3x3x3 area to prevent voids during movement
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const ck = this.world.getChunkKey(playerCx + dx, playerCy + dy, playerCz + dz);
                        const c = this.chunks.get(ck);
                        if (c) c.dirty = true;
                    }
                }
            }

            this.lastPlayerChunkKey = key;
            this.chunkRefreshTick = 0;
            this.needsQueueSort = true; // Trigger sort on next process
        }

        this.chunkRefreshTick = (this.chunkRefreshTick + 1) % 12;
        if (this.chunkRefreshTick === 0) {
            this.ensureChunksAround(playerCx, playerCy, playerCz);
        }

        this.criticalChunkTick = (this.criticalChunkTick + 1) % 4;
        if (this.criticalChunkTick === 0) {
            this.ensureCriticalChunks(playerCx, playerCy, playerCz, 2);
        }
        this.processChunkLoadQueue(playerCx, playerCy, playerCz);

        // Ensure all loaded chunks stay visible (prevents "invisible" holes)
        this.visibilityScanTick = (this.visibilityScanTick + 1) % 10;
        if (this.visibilityScanTick === 0 || this.forceVisibilityResetPending) {
            this.forceAllVisible();
            this.forceVisibilityResetPending = false;
        }
    }
}
