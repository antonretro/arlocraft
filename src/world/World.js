import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { ChunkManager } from './ChunkManager.js';
import { ExplosionSystem } from './ExplosionSystem.js';
import { ChunkGenerator } from './ChunkGenerator.js';
import { WorldConfig } from './WorldConfig.js';
import { WorldState } from './WorldState.js';
import { WorldCoordinates } from './WorldCoordinates.js';
import { BlockRulesService } from './blocks/BlockRulesService.js';
import { WorldTerrainService } from './terrain/WorldTerrainService.js';
import { WorldVisuals } from './visuals/WorldVisuals.js';
import { WorldMutationService } from './WorldMutationService.js';
import { WorldInteractionService } from './WorldInteractionService.js';
import { WorldPersistenceService } from './WorldPersistenceService.js';
import { FluidSystem } from './FluidSystem.js';
import { getBlockHandler } from '../engine/BlockHandlerRegistry.js';
import { rollLoot } from '../data/LootTables.js';

export class World {
    constructor(scene, game) {
        this.scene = scene;
        this.game = game;
        
        // --- Core Services ---
        this.config = new WorldConfig();
        this.state = new WorldState();
        this.coords = new WorldCoordinates(this.config);
        this.blocks = new BlockRulesService(this);
        this.terrain = new WorldTerrainService(this);
        this.visuals = new WorldVisuals(scene);
        this.mutations = new WorldMutationService(this);
        this.interaction = new WorldInteractionService(this);
        this.persistence = new WorldPersistenceService(this);
        this.fluids = new FluidSystem(this);

        this.registry = new BlockRegistry();
        this.blockRegistry = this.registry;

        // --- Shared World State ---
        this.objects = [];
        this.chunks = new Map();
        
        // --- Backward Compatibility Proxies ---
        this.sharedChunkGeometries = this.visuals.sharedChunkGeometries;
        this.hoverOutline = this.visuals.hoverOutline;
        this.miningCracks = this.visuals.miningCracks;

        // Configuration Aliases
        this.chunkSize = this.config.chunkSize;
        this.minTerrainY = this.config.terrain.minY;
        this.maxTerrainY = this.config.terrain.maxY;
        this.seaLevel = this.config.terrain.seaLevel;
        this.corruptionEnabled = false;
        this.deepMinY = this.config.terrain.minY;

        // Raycasting scratch vector
        this.tmpRayDir = new THREE.Vector3();

        // Initialization
        this.init();
    }

    init() {
        this.registry.init();
        this.chunkManager = new ChunkManager(this);
        this.chunkGenerator = new ChunkGenerator(this);
        this.explosions = new ExplosionSystem(this);
        this.chunks = this.chunkManager.chunks;
        return this;
    }

    update(playerPos, delta) {
        // Orchestrate sub-service updates
        const time = performance.now() / 1000;
        
        // 1. Chunk Management
        this.chunkManager.update(playerPos, delta);
        this.fluids.update(performance.now());
        
        // 2. Visuals & Animations
        this.visuals.update(time);
        this.registry.updateShaderMaterials(time);
        
        // 3. Systems
        this.explosions.update(delta);
    }

    // --- Core API Proxies (Backward Compatibility) ---
    get seedString() { return this.terrain.seedString; }
    get pendingChunkLoads() { return this.chunkManager.pendingChunkLoads; }
    get renderDistance() { return this.config.renderDistance; }
    set renderDistance(v) { this.config.renderDistance = v; }

    getBlockXP(id) { return this.blocks.getBlockXP(id); }
    getBlockData(id) { return this.blocks.getBlockData(id); }
    getBlockPickId(id) { return this.blocks.getBlockPickId(id); }
    isBlockSolid(id) { return this.blocks.isBlockSolid(id); }
    isGravityBlock(id) { return this.blocks.isGravityBlock(id); }
    getBlockDropId(id) { return this.blocks.getBlockDropId(id); }
    getBlockPairState(id, x, y, z) { return this.blocks.getBlockPairState(id, x, y, z); }
    isReplaceableForPlacement(id) { return this.blocks.isReplaceableForPlacement(id); }
    
    getChunkCoord(v) { return this.coords.getChunkCoord(v); }
    getChunkKey(cx, cy, cz) { return this.coords.getChunkKey(cx, cy, cz); }
    getKey(x, y, z) { return this.coords.getKey(x, y, z); }
    keyToCoords(k) { return this.coords.keyToCoords(k); }

    setRenderDistance(d) { this.chunkManager.setRenderDistance(d); }
    isPositionInWater(x, y, z) { return this.terrain.isPositionInWater(x, y, z); }
    getWaterSurfaceYAt(x, z) { return this.terrain.getWaterSurfaceYAt(x, z); }
    getSafeSpawnPoint(x, z, r) { return this.terrain.getSafeSpawnPoint(x, z, r); }
    digDownFrom(x, z) { return this.terrain.digDownFrom(x, z); }
    
    // Physics & Utility Proxies
    isSolidAt(x, y, z) {
        const id = this.getBlockAt(x, y, z);
        return this.blocks.isSolid(id);
    }

    getBlockAt(x, y, z) {
        return this.state.blockMap.get(this.coords.getKey(Math.round(x), Math.round(y), Math.round(z))) ?? null;
    }

    getGroundYBelow(x, y, z) {
        // High-performance ground query for Physics
        // Prioritize actual block data over noise-calculated terrain height
        const radius = 0.28;
        const searchPoints = [
            [x, z],
            [x - radius, z - radius],
            [x + radius, z - radius],
            [x - radius, z + radius],
            [x + radius, z + radius]
        ];

        let maxGroundY = -256; 
        const startY = Math.floor(y + 0.5);

        for (const [px, pz] of searchPoints) {
            const gx = Math.round(px);
            const gz = Math.round(pz);
            
            const cx = this.getChunkCoord(gx);
            const cz = this.getChunkCoord(gz);
            const terrainY = this.terrain.getColumnHeight(px, pz);
            
            // Search from player's feet downwards
            for (let gy = startY; gy > -128; gy--) {
                const cy = this.getChunkCoord(gy);
                const chunk = this.chunkManager.getChunk(cx, cy, cz);
                const isChunkReady = chunk && !chunk.destroyed;
                
                const key = this.coords.getKey(gx, gy, gz);
                const id = this.state.blockMap.get(key);
                
                if (id && this.blocks.isSolid(id)) {
                    const blockTopY = gy + 0.5;
                    if (blockTopY > maxGroundY) maxGroundY = blockTopY;
                    break;
                }

                // Safety fallback: only if chunk isn't ready or we reach the edge of the world
                if (gy <= terrainY) {
                    if (!isChunkReady) {
                        if (terrainY > maxGroundY) maxGroundY = terrainY;
                        break;
                    } else if (gy < terrainY - 32) {
                        // Beyond reasonable digging depth and no blocks found in a loaded chunk
                        break; 
                    }
                }
            }
        }
        return maxGroundY;
    }

    getBiomeIdAt(x, z) {
        return this.terrain.getBiomeAt(x, z).id;
    }

    // Chunk Manager Proxies used by Physics
    ensureCriticalChunks(cx, cy, cz, r) { this.chunkManager.ensureCriticalChunks?.(cx, cy, cz, r); }
    processChunkLoadQueue(cx, cy, cz, budget) { this.chunkManager.processChunkLoadQueue?.(cx, cy, cz, budget); }
    flushPriorityChunkRebuilds(budget) { this.chunkManager.flushPriorityChunkRebuilds?.(budget); }
    ensureChunksAround(cx, cy, cz, r) { this.chunkManager.ensureChunksAround(cx, cy, cz, r); }

    // Terrain proxies
    getBiomeAt(x, z) { return this.terrain.getBiomeAt(x, z); }
    getTerrainHeight(x, z) { return this.terrain.getTerrainHeight(x, z); }
    getColumnHeight(x, z) { return this.terrain.getColumnHeight(x, z); }
    getTopBlockIdAt(x, z) {
        const fx = Math.floor(x), fz = Math.floor(z);
        const y = this.terrain.getColumnHeight(fx, fz);
        return this.getBlockAt(fx, y, fz);
    }
    hash2D(x, z) { return this.terrain.hash2D(x, z); }
    hash3D(x, y, z) { return this.terrain.hash3D(x, y, z); }
    isPathAt(x, z) { return this.terrain.isPathAt(x, z); }
    isHighwayAt(x, z) { return this.terrain.isHighwayAt(x, z); }
    isCorruptedAt(x, z) { return this.terrain.isCorruptedAt(x, z); }
    shouldCarveCave(x, y, z, th) { return this.terrain.shouldCarveCave(x, y, z, th); }
    shouldForceSpawnZone(x, z) { return this.terrain.shouldForceSpawnZone(x, z); }
    shouldPlaceTree(x, z, h, b) { return this.terrain.shouldPlaceTree(x, z, h, b); }
    shouldPlaceVirus(x, z, h) { return this.terrain.shouldPlaceVirus(x, z, h); }
    shouldPlaceAnton(x, z, h) { return this.terrain.shouldPlaceAnton(x, z, h); }
    shouldPlaceVillageChunk(cx, cz) { return this.terrain.shouldPlaceVillageChunk(cx, cz); }
    shouldPlaceStructureChunk(cx, cz) { return this.terrain.shouldPlaceStructureChunk(cx, cz); }

    // Mutation proxies
    addBlock(x, y, z, id, ownerKey, replace, options) { return this.mutations.addBlock(x, y, z, id, ownerKey, replace, options); }
    removeBlockByKey(key, options) { return this.mutations.removeBlockByKey(key, options); }
    setBlockAt(x, y, z, id, options) { return this.mutations.setBlock(x, y, z, id, null, options); }
    removeBlockAt(x, y, z, options) {
        const key = this.getKey(Math.round(x), Math.round(y), Math.round(z));
        return this.mutations.removeBlockByKey(key, options);
    }

    // Interaction proxies
    getSettlementNameAt(x, z) { return this.interaction.getSettlementNameAt(x, z); }
    registerLandmark(x, z, name, options) { return this.interaction.registerLandmark(x, z, name, options); }

    // Seed / serialization
    get seedString() { return this.terrain.seedString; }
    setSeed(seed) {
        this.terrain.setSeed(seed);
    }

    serialize() { return this.persistence.serialize(); }

    loadFromData(data) {
        return this.persistence.loadFromData(data);
    }

    clearWorld() {
        this.chunkManager.clearAll();
        this.objects = [];
        this.state.blockMap.clear();
        this.state.blockOwners.clear();
        this.state.landmarks.clear();
        this.state.terrainHeightCache.clear();
        this.state.biomeCache.clear();
        this.resetMiningProgress();
        this.explosions.clearAll?.();
        if (this.visuals.hoverOutline) this.visuals.hoverOutline.visible = false;
    }

    // Explosion helpers
    explode(x, y, z, r) { this.explosions.explode(x, y, z, r); }
    spawnBreakParticles(x, y, z, id) { this.explosions.spawnBreakParticles?.(x, y, z, id); }
    spawnPickupEffect(x, y, z, id, pos) { this.explosions.spawnPickupEffect?.(x, y, z, id, pos); }
    computeMineDuration(id, item, mode) { return this.blocks.computeMineDuration(id, item, mode); }

    // Raycasting
    raycastBlocks(camera, maxDistance = 6, includeFluids = false, originOverride = null, dirOverride = null) {
        if (!camera) return null;
        const origin = originOverride ?? camera.position;
        if (dirOverride) this.tmpRayDir.copy(dirOverride).normalize();
        else camera.getWorldDirection(this.tmpRayDir).normalize();
        const dx = this.tmpRayDir.x, dy = this.tmpRayDir.y, dz = this.tmpRayDir.z;
        const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
        const deltaX = Math.abs(1 / dx), deltaY = Math.abs(1 / dy), deltaZ = Math.abs(1 / dz);
        let bx = Math.floor(origin.x + 0.5), by = Math.floor(origin.y + 0.5), bz = Math.floor(origin.z + 0.5);
        let maxX = deltaX * (dx > 0 ? bx + 0.5 - origin.x : origin.x - (bx - 0.5));
        let maxY = deltaY * (dy > 0 ? by + 0.5 - origin.y : origin.y - (by - 0.5));
        let maxZ = deltaZ * (dz > 0 ? bz + 0.5 - origin.z : origin.z - (bz - 0.5));
        let prevX = bx, prevY = by, prevZ = bz, distance = 0;
        while (distance <= maxDistance) {
            const id = this.state.blockMap.get(this.getKey(bx, by, bz));
            if (id && (includeFluids || (id !== 'water' && id !== 'lava'))) {
                return { id, cell: { x: bx, y: by, z: bz }, previous: { x: prevX, y: prevY, z: prevZ } };
            }
            prevX = bx; prevY = by; prevZ = bz;
            if (maxX < maxY) {
                if (maxX < maxZ) { bx += stepX; distance = maxX; maxX += deltaX; }
                else { bz += stepZ; distance = maxZ; maxZ += deltaZ; }
            } else {
                if (maxY < maxZ) { by += stepY; distance = maxY; maxY += deltaY; }
                else { bz += stepZ; distance = maxZ; maxZ += deltaZ; }
            }
        }
        return null;
    }

    resetMiningProgress() {
        this.state.miningState.key = null;
        this.state.miningState.progress = 0;
        this.state.miningState.required = 0;
        if (this.visuals.miningCracks) this.visuals.miningCracks.visible = false;
        window.dispatchEvent(new CustomEvent('mining-progress', { detail: { ratio: 0, id: null, done: true } }));
    }

    breakBlockAt(x, y, z) {
        const key = this.getKey(x, y, z);
        const id = this.state.blockMap.get(key);
        if (!id || id === 'bedrock') return false;
        const pairState = this.getBlockPairState(id, x, y, z);
        const dropId = this.getBlockDropId(id);
        if (pairState) {
            const pairKey = this.getKey(x, pairState.pairY, z);
            this.state.changedBlocks.set(pairKey, null);
            this.removeBlockByKey(pairKey, { skipChangeTracking: true });
            this.spawnBreakParticles(x, pairState.pairY, z, pairState.pairId);
        }
        this.state.changedBlocks.set(key, null);
        this.removeBlockByKey(key, { skipChangeTracking: true });
        this.chunkManager.flushPriorityChunkRebuilds(20);
        
        // --- Special Igneous Particle Triggers ---
        if (id.includes('virus')) {
            this.explosions.spawnIgneousBurst(x, y, z, 'soul');
        } else if (id.includes('ore') || id === 'diamond_block' || id === 'gold_block') {
            this.explosions.spawnIgneousBurst(x, y, z, 'spark');
        }
        
        this.spawnBreakParticles(x, y, z, id);
        this.spawnPickupEffect(x, y, z, dropId, this.game?.getPlayerPosition?.());
        window.dispatchEvent(new CustomEvent('block-mined', { detail: { id: dropId, x, y, z } }));
        return true;
    }

    mineBlockProgress(camera, delta, selectedItem, mode = 'SURVIVAL') {
        const hit = this.raycastBlocks(camera, 6, false);
        if (!hit) { this.resetMiningProgress(); return false; }
        const blockId = hit.id;
        if (blockId === 'bedrock') { this.resetMiningProgress(); return false; }
        if (mode === 'CREATIVE') {
            const broken = this.breakBlockAt(hit.cell.x, hit.cell.y, hit.cell.z);
            this.resetMiningProgress();
            return broken;
        }
        const key = this.getKey(hit.cell.x, hit.cell.y, hit.cell.z);
        if (this.state.miningState.key !== key) {
            this.state.miningState.key = key;
            this.state.miningState.progress = 0;
            this.state.miningState.required = this.computeMineDuration(blockId, selectedItem, mode);
        }
        this.state.miningState.progress += Math.max(0, delta);
        const ratio = Math.max(0, Math.min(1, this.state.miningState.progress / Math.max(0.01, this.state.miningState.required)));
        if (this.visuals.miningCracks) {
            const stage = Math.floor(ratio * 9);
            const mat = this.registry.getBreakingMaterial(stage);
            this.visuals.updateMiningCracks(hit.cell.x, hit.cell.y, hit.cell.z, true, mat);
            this.visuals.miningCracks.scale.setScalar(1.01);
        }
        window.dispatchEvent(new CustomEvent('mining-progress', { detail: { ratio, id: blockId, done: false } }));
        if (this.state.miningState.progress < this.state.miningState.required) {
            // Subtle vibrance while digging
            if (this.game?.shakeCamera) this.game.shakeCamera(0.015, 0.1);
            return false;
        }
        const broken = this.breakBlockAt(hit.cell.x, hit.cell.y, hit.cell.z);
        if (broken && this.game?.shakeCamera) {
            this.game.shakeCamera(0.06, 0.4);
        }
        this.resetMiningProgress();
        return broken;
    }

    placeBlock(camera, slotId) {
        const item = this.game?.gameState?.inventory?.[slotId];
        if (!item?.id) return false;

        const isBucket = item.id.endsWith('_bucket') && item.id !== 'bucket';
        const blockId = isBucket ? item.id.replace('_bucket', '') : this.getBlockPickId(item.id);
        
        if (!blockId) return false;
        const blockData = this.getBlockData(blockId);
        if (!blockData) return false;
        const hit = this.raycastBlocks(camera, 6, false);
        if (!hit) return false;
        const { x: px, y: py, z: pz } = hit.previous;
        if (new THREE.Vector3(px, py, pz).distanceTo(camera.position) < 1.05) return false;
        const key = this.getKey(px, py, pz);
        const existingId = this.state.blockMap.get(key);
        if (existingId && !this.isReplaceableForPlacement(existingId)) return false;
        if (blockData?.deco && this.getBlockData(existingId)?.deco) return false;
        let finalId = blockId;
        
        // Plant placement restrictions (only on soil/path)
        if (blockData?.deco && !blockId.includes('coral') && blockId !== 'sea_pickle') {
            const groundId = this.state.blockMap.get(this.getKey(px, py - 1, pz));
            const validSoil = ['grass_block', 'dirt', 'mycelium', 'path_block', 'podzol', 'coarse_dirt', 'moss_block', 'rooted_dirt'];
            if (!validSoil.includes(groundId)) {
                this.game?.hud?.flashPrompt?.("Can only place plants on soil!", "#ff9999");
                return false;
            }
        }
        
        // Log rotation logic based on the face placed on
        const isLog = blockId.endsWith('_log') || blockId === 'wood' || blockId.includes('_stem') || blockId.includes('purpur_pillar') || blockId.includes('quartz_pillar');
        if (isLog) {
            const dx = Math.abs(px - hit.cell.x);
            const dy = Math.abs(py - hit.cell.y);
            const dz = Math.abs(pz - hit.cell.z);
            
            if (dx > 0) finalId += ':x';
            else if (dz > 0) finalId += ':z';
            else finalId += ':y'; // Default vertical
        }

        if (blockId.includes('_stairs')) {
            const yaw = ((camera.rotation.y % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            const pi = Math.PI;
            if (yaw >= 7 * pi / 4 || yaw < pi / 4) finalId += '_s';
            else if (yaw < 3 * pi / 4) finalId += '_e';
            else if (yaw < 5 * pi / 4) finalId += '_n';
            else finalId += '_w';
        }
        const cx = this.getChunkCoord(px);
        const cy = this.getChunkCoord(py);
        const cz = this.getChunkCoord(pz);
        const ownerKey = this.getChunkKey(cx, cy, cz);
        const pairId = blockData?.pairId;
        const pairOffsetY = Number(blockData?.pairOffsetY);
        if (pairId && Number.isFinite(pairOffsetY) && pairOffsetY !== 0) {
            const pairY = py + pairOffsetY;
            const pairKey = this.getKey(px, pairY, pz);
            const pairExisting = this.state.blockMap.get(pairKey);
            if (pairExisting && !this.isReplaceableForPlacement(pairExisting)) return false;
            this.state.changedBlocks.set(pairKey, pairId);
            this.addBlock(px, pairY, pz, pairId, ownerKey, !!pairExisting);
        }
        this.state.changedBlocks.set(key, finalId);
        this.addBlock(px, py, pz, finalId, ownerKey, !!existingId);
        
        // If it was a bucket placement, return it to empty
        if (isBucket) {
            item.id = 'bucket';
            window.dispatchEvent(new CustomEvent('inventory-changed'));
        }

        this.chunkManager.flushPriorityChunkRebuilds(20);
        window.dispatchEvent(new CustomEvent('block-placed', { detail: { id: finalId } }));
        return true;
    }

    interactBlock(camera) {
        const hit = this.raycastBlocks(camera, 6, true);
        if (!hit) return false;
        const { id: blockId, cell } = hit;

        const selectedItem = this.game?.gameState?.getSelectedItem();
        const isAxe = selectedItem?.id?.includes('axe');

        // Axe Stripping logic
        if (isAxe) {
            const STRIP_MAP = {
                'oak_log': 'stripped_oak_log',
                'spruce_log': 'stripped_spruce_log',
                'birch_log': 'stripped_birch_log',
                'jungle_log': 'stripped_jungle_log',
                'acacia_log': 'stripped_acacia_log',
                'dark_oak_log': 'stripped_dark_oak_log',
                'mangrove_log': 'stripped_mangrove_log',
                'cherry_log': 'stripped_cherry_log',
                'crimson_stem': 'stripped_crimson_stem',
                'warped_stem': 'stripped_warped_stem'
            };

            const baseId = blockId.split(':')[0];
            const strippedBase = STRIP_MAP[baseId];

            if (strippedBase) {
                const suffix = blockId.includes(':') ? ':' + blockId.split(':')[1] : '';
                const finalId = strippedBase + suffix;
                
                const cx = this.getChunkCoord(cell.x);
                const cy = this.getChunkCoord(cell.y);
                const cz = this.getChunkCoord(cell.z);
                const ownerKey = this.getChunkKey(cx, cy, cz);
                
                this.addBlock(cell.x, cell.y, cell.z, finalId, ownerKey, true);
                
                // Play stripping sound effect via custom event
                window.dispatchEvent(new CustomEvent('action-success')); 
                return true;
            }
        }

        // Route to modular block handler if one is registered
        const handler = getBlockHandler(blockId);
        if (handler) {
            const blockKey = this.getKey(cell.x, cell.y, cell.z);
            handler.open(blockKey, this.game);
            return true;
        }

        if (blockId === 'crafting_table') {
            window.dispatchEvent(new CustomEvent('interact-crafting-table'));
            return true;
        }

        // --- Bucket Handling (Fill) ---
        if (selectedItem?.id === 'bucket') {
            if (blockId === 'water' || blockId === 'lava') {
                const cx = this.getChunkCoord(cell.x);
                const cy = this.getChunkCoord(cell.y);
                const cz = this.getChunkCoord(cell.z);
                const ownerKey = this.getChunkKey(cx, cy, cz);

                // Remove the liquid block
                this.addBlock(cell.x, cell.y, cell.z, 'air', ownerKey, true);
                
                // Update item
                selectedItem.id = blockId + '_bucket';
                window.dispatchEvent(new CustomEvent('inventory-changed'));
                window.dispatchEvent(new CustomEvent('action-success')); // Sound hint
                return true;
            }
        }
        if (blockId === 'starter_chest' || blockId === 'chest') {
            const chestKey = this.getKey(cell.x, cell.y, cell.z);
            if (!this.state.openedChestKeys.has(chestKey)) {
                this.state.openedChestKeys.add(chestKey);
                
                // Determine loot table based on biome or structure context
                const biomeId = this.getBiomeIdAt(cell.x, cell.z);
                let tableId = 'common_village';
                if (biomeId === 'desert') tableId = 'desert_loot';
                if (this.getColumnHeight(cell.x, cell.z) > 100) tableId = 'castle_loot'; // High altitude/Castle context
                
                const loot = rollLoot(tableId, 4);
                this.game?.state.grantLootRoll(loot);
                
                window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: 'LOOT DISCOVERED: ' + tableId.toUpperCase() } }));
                window.dispatchEvent(new CustomEvent('action-success'));
            } else {
                window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: 'CHEST EMPTY' } }));
            }
            return true;
        }
        if (blockId === 'tnt') { this.explode(cell.x, cell.y, cell.z, 5); return true; }
        if (blockId === 'nuke') { this.explode(cell.x, cell.y, cell.z, 16); return true; }

        // Flint and Steel: place fire on face adjacent to hit block
        if (selectedItem?.id === 'flint_and_steel') {
            const tx = hit.previous.x;
            const ty = hit.previous.y;
            const tz = hit.previous.z;
            const targetKey = this.getKey(tx, ty, tz);
            const targetExisting = this.state.blockMap.get(targetKey);
            if (!targetExisting || this.isReplaceableForPlacement(targetExisting)) {
                const cx = this.getChunkCoord(tx);
                const cy = this.getChunkCoord(ty);
                const cz = this.getChunkCoord(tz);
                this.addBlock(tx, ty, tz, 'fire', this.getChunkKey(cx, cy, cz), !!targetExisting);
                this.state.changedBlocks.set(targetKey, 'fire');
                this.chunkManager.flushPriorityChunkRebuilds(20);
                window.dispatchEvent(new CustomEvent('action-success'));
            }
            return true;
        }

        return null;
    }

    getAreaInfluence(position) {
        if (!this.corruptionEnabled) return { x: 0, y: 0, z: 0, virus: 0, anton: 0 };
        if (!position) return { x: 0, y: 0, z: 0, virus: 0, anton: 0 };
        const px = Math.round(position.x), py = Math.round(position.y), pz = Math.round(position.z);
        const radius = 3;
        let virusHits = 0, antonHits = 0, samples = 0;
        for (let dx = -radius; dx <= radius; dx += 2) {
            for (let dz = -radius; dz <= radius; dz += 2) {
                for (let dy = -1; dy <= 2; dy++) {
                    const id = this.state.blockMap.get(this.getKey(px + dx, py + dy, pz + dz));
                    if (!id) continue;
                    samples++;
                    if (id === 'virus') virusHits++;
                    else if (id === 'anton') antonHits++;
                }
            }
        }
        const base = Math.max(1, samples);
        return { x: px, y: py, z: pz, virus: Math.min(1, virusHits / Math.max(16, base * 0.9)), anton: Math.min(1, antonHits / Math.max(4, base * 0.3)) };
    }
}
