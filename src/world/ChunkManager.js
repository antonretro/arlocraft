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

    getByCoord(cx, cz) {
        return this.chunks.get(this.world.getChunkKey(cx, cz));
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

    loadChunk(cx, cz, forceSync = false) {
        const key = this.world.getChunkKey(cx, cz);
        if (this.chunks.has(key)) {
            this.pendingChunkSet.delete(key);
            return;
        }
        const chunk = new Chunk(this.world, cx, cz);
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

        // Hostile mob spawning on chunk load
        if (
            this.world.corruptionEnabled
            && this.world.hash2D(cx + 411, cz - 108) > 0.93
            && this.world.game?.entities?.entities?.length < this.world.game?.entities?.maxEntities
        ) {
            const wx = (cx * this.world.chunkSize) + Math.floor(this.world.chunkSize / 2);
            const wz = (cz * this.world.chunkSize) + Math.floor(this.world.chunkSize / 2);
            const wy = this.world.getTerrainHeight(wx, wz) + 2;
            this.world.game.entities.spawn('virus_grunt', wx + 0.5, wy, wz + 0.5);
        }
    }

    // ─── Unloading ────────────────────────────────────────────────────

    unloadFarChunks(centerCx, centerCz) {
        const unloadRadius = this.world.renderDistance + 3;
        for (const [key, chunk] of this.chunks.entries()) {
            const dx = Math.abs(chunk.cx - centerCx);
            const dz = Math.abs(chunk.cz - centerCz);
            if (dx <= unloadRadius && dz <= unloadRadius) continue;
            chunk.destroy();
            this.chunks.delete(key);
        }

        if (this.pendingChunkLoads.length > 0) {
            this.pendingChunkLoads = this.pendingChunkLoads.filter((pending) => {
                const dx = Math.abs(pending.cx - centerCx);
                const dz = Math.abs(pending.cz - centerCz);
                const keep = dx <= unloadRadius && dz <= unloadRadius;
                if (!keep) this.pendingChunkSet.delete(pending.key);
                return keep;
            });
        }
    }

    // ─── Queued loading ───────────────────────────────────────────────

    queueChunkLoad(cx, cz) {
        const key = this.world.getChunkKey(cx, cz);
        if (this.chunks.has(key) || this.pendingChunkSet.has(key)) return;
        this.pendingChunkSet.add(key);
        this.pendingChunkLoads.push({ cx, cz, key });
    }

    ensureChunksAround(centerCx, centerCz) {
        const preloadRadius = this.world.renderDistance + 1;
        for (let dx = -preloadRadius; dx <= preloadRadius; dx++) {
            for (let dz = -preloadRadius; dz <= preloadRadius; dz++) {
                this.queueChunkLoad(centerCx + dx, centerCz + dz);
            }
        }
    }

    ensureCriticalChunks(centerCx, centerCz, radius = 1) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const cx = centerCx + dx;
                const cz = centerCz + dz;
                const key = this.world.getChunkKey(cx, cz);
                const chunk = this.chunks.get(key);
                if (!chunk) {
                    const isInner = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
                    this.loadChunk(cx, cz, isInner);
                    continue;
                }
                if (chunk.dirty && !chunk.destroyed) {
                    chunk.update();
                }
            }
        }
    }

    processChunkLoadQueue(centerCx, centerCz, explicitBudget = null) {
        if (this.pendingChunkLoads.length === 0) return;

        let budget = explicitBudget;
        if (!Number.isFinite(budget)) {
            const tier = this.world.game?.qualityTier ?? 'balanced';
            if (tier === 'low') budget = 6;
            else if (tier === 'high') budget = 14;
            else budget = 10;
        }

        budget = Math.max(1, Math.floor(budget));
        const refCx = Number.isFinite(centerCx) ? centerCx : 0;
        const refCz = Number.isFinite(centerCz) ? centerCz : 0;
        this.pendingChunkLoads.sort((a, b) => {
            const adx = a.cx - refCx;
            const adz = a.cz - refCz;
            const bdx = b.cx - refCx;
            const bdz = b.cz - refCz;
            return (adx * adx) + (adz * adz) - ((bdx * bdx) + (bdz * bdz));
        });

        while (budget > 0 && this.pendingChunkLoads.length > 0) {
            const next = this.pendingChunkLoads.shift();
            if (!next) break;
            this.loadChunk(next.cx, next.cz);
            budget -= 1;
        }
    }

    // ─── Dirty-mesh rebuilds ──────────────────────────────────────────

    flushPriorityChunkRebuilds(limit = 12) {
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
        const pcz = this.world.getChunkCoord(playerPosition.z);

        // 1. Emergency Rebuilds: Immediate 5x5 chunks ignore budget
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const key = this.world.getChunkKey(pcx + dx, pcz + dz);
                const chunk = this.chunks.get(key);
                if (chunk?.dirty && !chunk.destroyed) {
                    chunk.update();
                }
            }
        }

        // 2. Mesh Watchdog: Catch 'Ghost Chunks' (loaded data but no meshes)
        // Sweep the full render distance every 8 frames to revive invisible chunks
        this.meshSanityTick = (this.meshSanityTick + 1) % 8;
        if (this.meshSanityTick === 0) {
            const rd = this.world.renderDistance + 1;
            for (let dx = -rd; dx <= rd; dx++) {
                for (let dz = -rd; dz <= rd; dz++) {
                    const ck = this.world.getChunkKey(pcx + dx, pcz + dz);
                    const c = this.chunks.get(ck);
                    if (!c || c.destroyed || c.generating) continue;
                    const hasMeshGap = c.blockKeys.size > 0 && c.instancedMeshes.size === 0;
                    const isDesyncedEmpty = c.blockKeys.size === 0 && c.instancedMeshes.size === 0;
                    if (isDesyncedEmpty) c.resyncBlockKeysFromWorld?.();
                    const needsMeshRebuild = hasMeshGap || (isDesyncedEmpty && c.blockKeys.size > 0);
                    if (needsMeshRebuild) {
                        c.dirty = true;
                        this.priorityDirtyChunkKeys.add(ck);
                    }
                }
            }
        }

        this.flushPriorityChunkRebuilds(32); 

        const chunks = Array.from(this.chunks.values())
            .filter(c => c.dirty && !c.destroyed);

        const total = chunks.length;
        if (total === 0) return;

        // Prioritize by distance
        const cs = this.world.chunkSize;
        chunks.sort((a, b) => {
            const distA = (a.cx * cs - playerPosition.x) ** 2 + (a.cz * cs - playerPosition.z) ** 2;
            const distB = (b.cx * cs - playerPosition.x) ** 2 + (b.cz * cs - playerPosition.z) ** 2;
            return distA - distB;
        });

        const tier = this.world.game?.qualityTier ?? 'balanced';
        const rebuildBudget = tier === 'low' ? 12 : (tier === 'high' ? 64 : 32);
        let rebuilt = 0;

        for (let i = 0; i < chunks.length && rebuilt < rebuildBudget; i++) {
            chunks[i].update();
            rebuilt += 1;
        }
    }

    // ─── Mesh-color sanity audit ──────────────────────────────────────

    ensureChunkMeshColorSanity(limit = 10) {
        this.colorSanityTick = (this.colorSanityTick + 1) % 30;
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
                if (hasVertexColors) {
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
        const playerCz = this.world.getChunkCoord(playerPosition.z);
        const key = this.world.getChunkKey(playerCx, playerCz);
        
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
            this.loadChunk(playerCx, playerCz, true);
        }

        if (this.lastPlayerChunkKey !== key) {
            // Safety: If this is the first move detected (lastPlayerChunkKey is null),
            // or if we detection a massive teleport (more than 128 blocks jump),
            // we should be cautious about purging. Massive jumps on resume 
            // often mean stale data.
            let shouldPurge = true;
            if (this.lastPlayerChunkKey !== null) {
                const [lastCx, lastCz] = this.lastPlayerChunkKey.split(',').map(Number);
                const jumpDist = Math.max(Math.abs(playerCx - lastCx), Math.abs(playerCz - lastCz));
                if (jumpDist > 8) {
                    console.warn('[ArloCraft] Massive position jump detected in ChunkManager. Skipping purge to prevent voiding.');
                    shouldPurge = false;
                }
            }

            if (shouldPurge) {
                this.unloadFarChunks(playerCx, playerCz);
            }
            this.ensureChunksAround(playerCx, playerCz);
            
            // Boundary Flush: Force remesh 5x5 area to prevent voids during movement
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const ck = this.world.getChunkKey(playerCx + dx, playerCz + dz);
                    const c = this.chunks.get(ck);
                    if (c) c.dirty = true;
                }
            }

            this.lastPlayerChunkKey = key;
            this.chunkRefreshTick = 0;
        }

        this.chunkRefreshTick = (this.chunkRefreshTick + 1) % 12;
        if (this.chunkRefreshTick === 0) {
            this.ensureChunksAround(playerCx, playerCz);
        }

        this.criticalChunkTick = (this.criticalChunkTick + 1) % 4;
        if (this.criticalChunkTick === 0) {
            this.ensureCriticalChunks(playerCx, playerCz, 2);
        }
        this.processChunkLoadQueue(playerCx, playerCz);

        // Ensure all loaded chunks stay visible (prevents "invisible" holes)
        this.visibilityScanTick = (this.visibilityScanTick + 1) % 10;
        if (this.visibilityScanTick === 0 || this.forceVisibilityResetPending) {
            this.forceAllVisible();
            this.forceVisibilityResetPending = false;
        }
    }
}
