import * as THREE from 'three';

export class WorldMutationService {
    constructor(world) {
        this.world = world;
    }

    // --- Core Mutation API ---

    addBlock(x, y, z, id, ownerKey = null, replace = false, options = {}) {
        const gx = Math.round(x);
        const gy = Math.round(y);
        const gz = Math.round(z);

        if (id === null || id === 'air') {
            const key = this.world.coords.getKey(gx, gy, gz);
            return this.removeBlockByKey(key, options);
        }

        const allowCorruption = Boolean(options?.allowCorruption);
        if (!allowCorruption && !this.world.corruptionEnabled && (id === 'virus' || id === 'anton')) return null;
        
        const key = this.world.coords.getKey(gx, gy, gz);
        
        const cx = this.world.coords.getChunkCoord(gx);
        const cy = this.world.coords.getChunkCoord(gy);
        const cz = this.world.coords.getChunkCoord(gz);
        const owner = ownerKey ?? this.world.coords.getChunkKey(cx, cy, cz);
        
        const existing = this.world.state.blockMap.get(key);
        if (existing && !replace) {
            const ownerChunk = this.world.chunkManager.getChunk(cx, cy, cz);
            if (ownerChunk && !ownerChunk.blockKeys.has(key)) {
                ownerChunk.blockKeys.add(key);
                ownerChunk.dirty = true;
                this.world.chunkManager.priorityDirtyChunkKeys.add(ownerChunk.key);
            }
            if (this.world.state.blockOwners.get(key) !== owner) {
                this.world.state.blockOwners.set(key, owner);
            }
            return existing;
        }

        if (existing && replace) this.removeBlockByKey(key, { skipChangeTracking: true });

        this.world.state.blockMap.set(key, id);
        this.world.state.blockOwners.set(key, owner);
        
        if (id === 'virus') this.world.state.virusBlockCount++;
        
        const ownerChunk = this.world.chunkManager.getChunk(cx, cy, cz);
        if (ownerChunk) {
            ownerChunk.blockKeys.add(key);
            ownerChunk.dirty = true;
            this.world.chunkManager.priorityDirtyChunkKeys.add(ownerChunk.key);
        }

        this.world.chunkManager.updateNeighborsDirty(gx, gy, gz);
        
        if (id === 'virus' || id === 'anton') {
            const radius = this.world.config.virus?.influenceRadiusBlocks ?? 3;
            this.world.chunkManager.markChunksWithinBlockRadiusDirty(gx, gy, gz, radius, true);
        }

        if (id === 'water' || id === 'lava') {
            this.world.fluids?.scheduleSpread(gx, gy, gz, id, 0);
        }

        return id;
    }

    removeBlockByKey(key, options = {}) {
        const id = this.world.state.blockMap.get(key);
        if (!id) return false;

        if (!options.skipChangeTracking) {
            this.world.state.changedBlocks.set(key, null);
        }

        const owner = this.world.state.blockOwners.get(key);
        this.world.state.blockMap.delete(key);
        this.world.state.blockOwners.delete(key);
        
        if (id === 'virus' && this.world.state.virusBlockCount > 0) this.world.state.virusBlockCount--;
        
        const [x, y, z] = this.world.coords.keyToCoords(key);
        const ownerChunk = this.world.chunkManager.getChunk(
            this.world.coords.getChunkCoord(x), 
            this.world.coords.getChunkCoord(y), 
            this.world.coords.getChunkCoord(z)
        );
        if (ownerChunk) {
            ownerChunk.blockKeys.delete(key);
            ownerChunk.dirty = true;
            this.world.chunkManager.priorityDirtyChunkKeys.add(ownerChunk.key);
        }

        this.world.chunkManager.updateNeighborsDirty(x, y, z);
        
        if (id === 'virus' || id === 'anton') {
            const radius = this.world.config.virus?.influenceRadiusBlocks ?? 3;
            this.world.chunkManager.markChunksWithinBlockRadiusDirty(x, y, z, radius, true);
        }
        return true;
    }

    setBlock(x, y, z, id, owner = null, options = {}) {
        if (id === null || id === 'air') {
            const key = this.world.coords.getKey(x, y, z);
            return this.removeBlockByKey(key, options);
        }
        return this.addBlock(x, y, z, id, owner, true, options);
    }
}
