import * as THREE from 'three';
import { BIOMES, BIOME_BY_ID } from '../data/biomes.js';
import { MOBS } from '../data/mobs.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { BLOCKS } from '../data/blocks.js';
import { TOOLS } from '../data/tools.js';
import { Chunk } from './Chunk.js';
import { ChunkGenerator } from './ChunkGenerator.js';
import { generateSettlementName, SETTLEMENT_LIBRARY_SIZE } from './naming/SettlementNameGenerator.js';
import { getRestorationSiteByLandmarkName } from './restoration/RestorationRegistry.js';
import { Noise } from './Noise.js';
import { NoiseRouter } from './NoiseRouter.js';

export class World {
    constructor(scene, game) {
        this.scene = scene;
        this.game = game;
        this.registry = new BlockRegistry();
        this.blockRegistry = this.registry;
        this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.waterGeometry = new THREE.PlaneGeometry(1, 1);
        this.waterGeometry.rotateX(-Math.PI / 2); // Horizontal surface facing UP
        this.raycaster = new THREE.Raycaster();
        this.tmpRayDir = new THREE.Vector3();
        this.blockMap = new Map();
        this.blockOwners = new Map();
        this.objects = [];
        this.waterMeshes = new Set();
        this.virusMeshes = new Set();
        this.virusBlockCount = 0;
        this.chunks = new Map();
        this.changedBlocks = new Map();

        this.chunkSize = 12;
        this.renderDistance = 2;
        this.minRenderDistance = 2;
        this.maxRenderDistance = 6;
        this.minTerrainY = -12;
        this.maxTerrainY = 126;
        this.deepMinY = -220;
        this.seaLevel = 1;
        this.seed = 0;
        this.seedString = 'arlocraft';
        this.setSeed(this.seedString);
        this.corruptionEnabled = false;
        this.lastPlayerChunkKey = null;
        this.animationTick = 0;
        this.blockXpById = new Map(BLOCKS.map((block) => [block.id, block.xp ?? 0]));
        this.blockHardnessById = new Map(BLOCKS.map((block) => [block.id, block.hardness ?? 1]));
        this.blockDataById = new Map(BLOCKS.map((block) => [block.id, block]));
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
        this.miningState = { key: null, progress: 0, required: 0 };
        this.subsurfaceTick = 0;
        this.hoverTick = 0;
        this.gifTick = 0;
        this.chunkVisibilityTick = 0;
        this.tmpCameraForward = new THREE.Vector3();
        this.tmpCameraRight = new THREE.Vector3();
        this.tmpUp = new THREE.Vector3(0, 1, 0);
        this.breakParticles = [];
        this.breakParticleGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        this.pickupEffects = [];
        this.pickupGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        this.visibilityDeferDepth = 0;
        this.visibilityUpdateQueue = new Set();
        this.visibilityNeighborOffsets = [
            [0, 0, 0],
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1]
        ];
        this.pendingChunkLoads = [];
        this.pendingChunkSet = new Set();
        this.chunkGenerator = this.game?.features?.workerChunkGeneration ? new ChunkGenerator(this) : null;
        this.chunkRefreshTick = 0;
        this.starterChestClaimed = false;
        this.starterChestKey = null;
        this.chunkMeshRebuildCursor = 0;
        this.forceFullRemeshPending = true;
        this.priorityDirtyChunkKeys = new Set();
        this.meshSanityTick = 0;
        this.criticalChunkTick = 0;
        this.auraSampleTick = 0;
        this.areaInfluenceSample = { x: 0, y: 0, z: 0, virus: 0, arlo: 0 };
        this.restoredLandmarks = new Set();
        this.structureVirusInfluenceEnabled = true;
        this.settlementNameLibrarySize = SETTLEMENT_LIBRARY_SIZE;
        this.landmarks = new Map(); // key → { x, z, name }
        this.terrainHeightCache = new Map();
        this.biomeCache = new Map();
        this.maxTerrainCacheEntries = 120000;
        this.maxBiomeCacheEntries = 120000;
        this.virusInfluenceRadiusBlocks = 3;
        this.arloNeighborOffsets = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        this.sharedChunkGeometries = {
            solid: new THREE.BoxGeometry(1, 1, 1),
            water: (() => {
                const geo = new THREE.PlaneGeometry(1, 1);
                geo.rotateX(-Math.PI / 2);
                return geo;
            })(),
            deco: new THREE.BoxGeometry(0.16, 1, 0.16)
        };

        const hoverGeo = new THREE.BoxGeometry(1.04, 1.04, 1.04);
        const hoverMat = new THREE.MeshBasicMaterial({
            color: 0xffef9a,
            wireframe: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        this.hoverOutline = new THREE.Mesh(hoverGeo, hoverMat);
        this.hoverOutline.visible = false;
        this.hoverOutline.renderOrder = 5;
        this.scene.add(this.hoverOutline);

        // Mining Cracks Overlay
        const crackGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
        this.miningCracks = new THREE.Mesh(
            crackGeo,
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0,
                wireframe: true
            })
        );
        this.scene.add(this.miningCracks);
        this.miningCracks.visible = false;
    }

    init() {
        this.ensureChunksAround(0, 0);
        this.processChunkLoadQueue(0, 0, 16);
        this.ensureStarterChest();
    }

    setSeed(seedValue) {
        this.seedString = String(seedValue ?? 'arlocraft').trim() || 'arlocraft';

        const numeric = Number(this.seedString);
        if (Number.isFinite(numeric)) {
            this.seed = Math.floor(Math.abs(numeric)) + 1;
        } else {
            let hash = 2166136261;
            for (let i = 0; i < this.seedString.length; i++) {
                hash ^= this.seedString.charCodeAt(i);
                hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
            }
            this.seed = Math.abs(hash >>> 0) + 1;
        }

        this.noise = new Noise(this.seedString);
        this.router = new NoiseRouter(this.seedString);
        if (this.terrainHeightCache) this.terrainHeightCache.clear();
        if (this.biomeCache) this.biomeCache.clear();
        this.seaLevel = 64;
    }

    clearWorld() {
        for (const chunk of this.chunks.values()) {
            chunk.destroy();
        }
        this.chunks.clear();
        this.objects = [];
        this.waterMeshes.clear();
        this.virusMeshes.clear();
        this.virusBlockCount = 0;
        this.blockMap.clear();
        this.blockOwners.clear();
        this.landmarks.clear();
        this.visibilityDeferDepth = 0;
        this.visibilityUpdateQueue.clear();
        this.pendingChunkLoads.length = 0;
        this.pendingChunkSet.clear();
        this.lastPlayerChunkKey = null;
        this.terrainHeightCache.clear();
        this.biomeCache.clear();
        this.resetMiningProgress();
        for (const particle of this.breakParticles) {
            this.scene.remove(particle.mesh);
            particle.mesh.material.dispose();
        }
        this.breakParticles = [];
        for (const pickup of this.pickupEffects) {
            this.scene.remove(pickup.mesh);
            pickup.mesh.material.dispose();
        }
        this.pickupEffects = [];
        if (this.hoverOutline) this.hoverOutline.visible = false;
    }

    serialize() {
        return {
            seed: this.seedString,
            changedBlocks: Array.from(this.changedBlocks.entries()),
            starterChestClaimed: this.starterChestClaimed,
            starterChestKey: this.starterChestKey,
            restoredLandmarks: Array.from(this.restoredLandmarks.values())
        };
    }

    loadFromData(data) {
        const seed = data?.seed ?? this.seedString;
        this.setSeed(seed);
        const entries = Array.isArray(data?.changedBlocks) ? data.changedBlocks : [];
        if (this.corruptionEnabled) {
            this.changedBlocks = new Map(entries);
        } else {
            this.changedBlocks = new Map(
                entries.filter((entry) => {
                    if (!Array.isArray(entry) || entry.length < 2) return false;
                    const id = entry[1];
                    return id !== 'virus' && id !== 'arlo';
                })
            );
        }
        this.starterChestClaimed = Boolean(data?.starterChestClaimed);
        this.starterChestKey = typeof data?.starterChestKey === 'string' ? data.starterChestKey : null;
        const restored = Array.isArray(data?.restoredLandmarks) ? data.restoredLandmarks : [];
        this.restoredLandmarks = new Set(restored.filter((value) => typeof value === 'string'));
        this.clearWorld();
        this.init();
    }

    getKey(x, y, z) {
        return `${x}|${y}|${z}`;
    }

    keyToCoords(key) {
        return key.split('|').map(Number);
    }

    getChunkCoord(worldValue) {
        return Math.floor(worldValue / this.chunkSize);
    }

    getChunkKey(cx, cz) {
        return `${cx}|${cz}`;
    }

    getChunk(cx, cz) {
        return this.chunks.get(this.getChunkKey(cx, cz));
    }

    getChunkAt(x, z) {
        return this.getChunk(this.getChunkCoord(x), this.getChunkCoord(z));
    }

    pointToBlockCoord(value) {
        return Math.floor(value + 0.5);
    }

    raycastBlocks(camera, maxDistance = 6, includeFluids = false) {
        if (!camera) return null;
        const origin = camera.position;
        camera.getWorldDirection(this.tmpRayDir).normalize();

        const step = 0.1;
        let prevX = this.pointToBlockCoord(origin.x);
        let prevY = this.pointToBlockCoord(origin.y);
        let prevZ = this.pointToBlockCoord(origin.z);

        for (let t = 0.1; t <= maxDistance; t += step) {
            const px = origin.x + (this.tmpRayDir.x * t);
            const py = origin.y + (this.tmpRayDir.y * t);
            const pz = origin.z + (this.tmpRayDir.z * t);
            const bx = this.pointToBlockCoord(px);
            const by = this.pointToBlockCoord(py);
            const bz = this.pointToBlockCoord(pz);

            if (bx === prevX && by === prevY && bz === prevZ) continue;

            const id = this.blockMap.get(this.getKey(bx, by, bz));
            if (id) {
                if (includeFluids || (id !== 'water' && id !== 'lava')) {
                    return {
                        id,
                        cell: { x: bx, y: by, z: bz },
                        previous: { x: prevX, y: prevY, z: prevZ }
                    };
                }
            }

            prevX = bx;
            prevY = by;
            prevZ = bz;
        }
        return false;
    }

    hash2D(x, z) {
        const value = Math.sin((x * 127.1) + (z * 311.7) + this.seed) * 43758.5453;
        return value - Math.floor(value);
    }

    hash3D(x, y, z) {
        const value = Math.sin((x * 12.9898) + (y * 78.233) + (z * 37.719) + this.seed) * 43758.5453;
        return value - Math.floor(value);
    }

    smoothstep(t) {
        return t * t * (3 - (2 * t));
    }

    lerp(a, b, t) {
        return a + ((b - a) * t);
    }

    valueNoise2D(x, z, scale) {
        const sx = x / scale;
        const sz = z / scale;
        const x0 = Math.floor(sx);
        const z0 = Math.floor(sz);
        const x1 = x0 + 1;
        const z1 = z0 + 1;
        const tx = this.smoothstep(sx - x0);
        const tz = this.smoothstep(sz - z0);

        const n00 = this.hash2D(x0, z0);
        const n10 = this.hash2D(x1, z0);
        const n01 = this.hash2D(x0, z1);
        const n11 = this.hash2D(x1, z1);
        const nx0 = this.lerp(n00, n10, tx);
        const nx1 = this.lerp(n01, n11, tx);
        return this.lerp(nx0, nx1, tz);
    }

    getBiomeAt(x, z) {
        const gx = Math.round(x);
        const gz = Math.round(z);
        const key = `${gx}|${gz}`;
        let id = this.biomeCache.get(key);
        if (!id) {
            id = this.router.getBiomeID(gx, gz);
            if (this.biomeCache.size > this.maxBiomeCacheEntries) this.biomeCache.clear();
            this.biomeCache.set(key, id);
        }
        return BIOME_BY_ID.get(id) ?? BIOME_BY_ID.get('plains');
    }

    getTerrainHeight(x, z) {
        const gx = Math.round(x);
        const gz = Math.round(z);
        const key = `${gx}|${gz}`;
        const cached = this.terrainHeightCache.get(key);
        if (cached !== undefined) return cached;

        const routed = this.router.getTerrainHeight(gx, gz);
        const height = Math.max(this.minTerrainY, Math.min(this.maxTerrainY, Math.round(routed)));

        if (this.terrainHeightCache.size > this.maxTerrainCacheEntries) this.terrainHeightCache.clear();
        this.terrainHeightCache.set(key, height);
        return height;
    }

    getColumnHeight(x, z) {
        let h = this.getTerrainHeight(x, z);
        // Flatten a safe spawn area around origin so the player isn't in a pit
        const dist = Math.max(Math.abs(x), Math.abs(z));
        if (dist <= 20) {
            const flatHeight = this.seaLevel + 4;
            const blend = Math.min(1, dist / 20);
            h = Math.round(flatHeight + (h - flatHeight) * blend);
            h = Math.max(h, this.seaLevel + 2);
        }
        return h;
    }

    shouldForceSpawnZone(x, z) {
        return Math.abs(x) <= 6 && Math.abs(z) <= 6;
    }

    shouldPlaceTree(x, z, height, biome = null) {
        const activeBiome = biome ?? this.getBiomeAt(x, z);
        if (height <= this.seaLevel + 1) return false;
        if ((activeBiome.treeDensity ?? 0) <= 0) return false;
        const openZone = this.valueNoise2D(x + 1433, z - 977, 190) > 0.67
            && this.valueNoise2D(x - 621, z + 299, 72) > 0.55;
        if (openZone) return false;
        const density = this.hash2D((x * 2) + 11, (z * 2) - 9);
        const spacing = this.hash2D(x + 301, z - 173);
        const threshold = 1 - Math.max(0, Math.min(0.5, activeBiome.treeDensity ?? 0.08));
        return density > threshold && spacing > 0.55;
    }

    shouldPlaceVirus(x, z, height) {
        if (!this.corruptionEnabled) return false;
        if (height < this.seaLevel + 1) return false;
        // Rarer virus spikes so corruption feels special, not everywhere.
        return this.hash2D(x - 991, z + 417) > 0.9992;
    }

    shouldPlaceArlo(x, z, height) {
        if (!this.corruptionEnabled) return false;
        if (height < this.seaLevel + 1) return false;
        return this.hash2D(x + 613, z - 271) > 0.985;
    }

    isCorruptedAt(x, z) {
        if (!this.corruptionEnabled) return false;
        return this.hash2D((x * 0.7) - 991, (z * 0.7) + 417) > 0.982;
    }

    isPathAt(x, z) {
        const trunk = Math.abs(this.noise.simplex2D(x * 0.02 + 1307, z * 0.02 - 811));
        const branch = Math.abs(this.noise.simplex2D(x * 0.04 - 547, z * 0.04 + 199));
        return trunk < 0.03 || branch < 0.02;
    }

    isHighwayAt(x, z) {
        const corridorA = Math.abs(this.noise.simplex2D(x * 0.008 + 2143, z * 0.008 - 937));
        const corridorB = Math.abs(this.noise.simplex2D(x * 0.007 - 1841, z * 0.007 + 221));
        return corridorA < 0.015 || corridorB < 0.018;
    }

    getLandmarkStorageKey(x, z) {
        return `${Math.round(x)},${Math.round(z)}`;
    }

    getSettlementNameAt(x, z) {
        return generateSettlementName(this.seed, Math.round(x), Math.round(z));
    }

    composeLandmarkDisplayName(baseName, x, z, category = 'landmark') {
        const cleanBase = String(baseName ?? '').trim();
        if (!cleanBase) return '';
        if (category === 'settlement') return cleanBase;

        const roll = this.hash2D((x * 0.77) + 113, (z * 0.77) - 257);
        if (roll < 0.58) return cleanBase;
        return `${this.getSettlementNameAt(x, z)} ${cleanBase}`;
    }

    registerLandmark(x, z, name, options = {}) {
        if (!name) return;
        const rx = Math.round(x);
        const rz = Math.round(z);
        const key = this.getLandmarkStorageKey(rx, rz);
        const baseName = String(options.baseName ?? name).trim();
        if (!baseName) return;

        const site = options.siteId
            ? { id: options.siteId, category: options.category ?? 'landmark' }
            : getRestorationSiteByLandmarkName(baseName);
        const category = options.category ?? site?.category ?? 'landmark';
        const displayName = options.displayName ?? this.composeLandmarkDisplayName(baseName, rx, rz, category);
        const restored = this.restoredLandmarks.has(key);
        const next = {
            key,
            x: rx,
            z: rz,
            name: displayName,
            baseName,
            siteId: site?.id ?? null,
            category,
            restored
        };

        const existing = this.landmarks.get(key);
        if (existing) {
            this.landmarks.set(key, { ...existing, ...next, restored: existing.restored || restored });
            return;
        }
        this.landmarks.set(key, next);
    }

    getLandmarksNear(px, pz, radius) {
        const results = [];
        for (const lm of this.landmarks.values()) {
            const dx = lm.x - px;
            const dz = lm.z - pz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist <= radius) results.push({ ...lm, distance: dist });
        }
        results.sort((a, b) => a.distance - b.distance);
        return results;
    }

    getRestorationStats() {
        let total = 0;
        let restored = 0;
        for (const landmark of this.landmarks.values()) {
            if (!landmark.siteId) continue;
            total += 1;
            if (landmark.restored || this.restoredLandmarks.has(landmark.key)) restored += 1;
        }
        return {
            restored,
            total,
            pending: Math.max(0, total - restored)
        };
    }

    formatRequirementList(requirements = []) {
        const parts = [];
        for (const req of requirements) {
            if (!req?.id || !Number.isFinite(req.count)) continue;
            parts.push(`${req.count} ${req.id}`);
        }
        return parts.join(', ');
    }

    countInventoryItem(itemId) {
        const inventory = this.game?.gameState?.inventory;
        if (!Array.isArray(inventory)) return 0;
        let total = 0;
        for (const slot of inventory) {
            if (!slot || slot.id !== itemId) continue;
            total += Math.max(0, Number(slot.count) || 0);
        }
        return total;
    }

    canAffordRequirements(requirements = []) {
        for (const req of requirements) {
            if (!req?.id || !Number.isFinite(req.count)) continue;
            if (this.countInventoryItem(req.id) < req.count) return false;
        }
        return true;
    }

    consumeRequirements(requirements = []) {
        const inventory = this.game?.gameState?.inventory;
        if (!Array.isArray(inventory)) return false;
        if (!this.canAffordRequirements(requirements)) return false;

        for (const req of requirements) {
            if (!req?.id || !Number.isFinite(req.count)) continue;
            let remaining = req.count;
            for (let i = 0; i < inventory.length; i++) {
                const slot = inventory[i];
                if (!slot || slot.id !== req.id) continue;
                const slotCount = Math.max(0, Number(slot.count) || 0);
                if (slotCount <= 0) continue;
                const take = Math.min(slotCount, remaining);
                slot.count = slotCount - take;
                if (slot.count <= 0) inventory[i] = null;
                remaining -= take;
                if (remaining <= 0) break;
            }
        }

        window.dispatchEvent(new CustomEvent('inventory-changed'));
        return true;
    }

    setChangedBlock(x, y, z, id) {
        const key = this.getKey(x, y, z);
        this.changedBlocks.set(key, id);
        const ownerKey = this.getChunkKey(this.getChunkCoord(x), this.getChunkCoord(z));
        this.addBlock(x, y, z, id, ownerKey, true);
    }

    applyRestorationPatch(landmark, site) {
        const centerX = Math.round(landmark.x);
        const centerZ = Math.round(landmark.z);
        const patch = site?.patch ?? 'utility';

        if (patch === 'highway') {
            const baseY = this.getColumnHeight(centerX, centerZ) + 1;
            for (let dx = -8; dx <= 8; dx++) {
                const wx = centerX + dx;
                this.setChangedBlock(wx, baseY - 1, centerZ, 'cobblestone');
                this.setChangedBlock(wx, baseY, centerZ, 'path_block');
                if (Math.abs(dx) % 4 === 0) {
                    this.setChangedBlock(wx, baseY + 1, centerZ - 1, 'lantern');
                    this.setChangedBlock(wx, baseY + 1, centerZ + 1, 'lantern');
                }
            }
            return;
        }

        if (patch === 'market') {
            const baseY = this.getColumnHeight(centerX, centerZ);
            for (let dx = -4; dx <= 4; dx++) {
                for (let dz = -4; dz <= 4; dz++) {
                    const wx = centerX + dx;
                    const wz = centerZ + dz;
                    const block = (Math.abs(dx) === 4 || Math.abs(dz) === 4) ? 'cobblestone' : 'path_block';
                    this.setChangedBlock(wx, baseY, wz, block);
                }
            }
            this.setChangedBlock(centerX, baseY + 1, centerZ, 'crafting_table');
            return;
        }

        if (patch === 'housing') {
            const baseY = this.getColumnHeight(centerX, centerZ);
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    this.setChangedBlock(centerX + dx, baseY, centerZ + dz, 'wood_planks');
                }
            }
            for (let dy = 1; dy <= 3; dy++) {
                this.setChangedBlock(centerX - 2, baseY + dy, centerZ - 2, 'wood');
                this.setChangedBlock(centerX + 2, baseY + dy, centerZ - 2, 'wood');
                this.setChangedBlock(centerX - 2, baseY + dy, centerZ + 2, 'wood');
                this.setChangedBlock(centerX + 2, baseY + dy, centerZ + 2, 'wood');
            }
            this.setChangedBlock(centerX, baseY + 1, centerZ - 2, 'glass');
            this.setChangedBlock(centerX, baseY + 1, centerZ + 2, 'glass');
            this.setChangedBlock(centerX, baseY + 4, centerZ, 'lantern');
            return;
        }

        if (patch === 'park') {
            const baseY = this.getColumnHeight(centerX, centerZ);
            for (let dx = -4; dx <= 4; dx++) {
                for (let dz = -4; dz <= 4; dz++) {
                    const dist = Math.sqrt((dx * dx) + (dz * dz));
                    if (dist > 4.2) continue;
                    const wx = centerX + dx;
                    const wz = centerZ + dz;
                    this.setChangedBlock(wx, baseY, wz, 'grass');
                    const flowerRoll = this.hash2D(wx + 319, wz - 211);
                    if (flowerRoll > 0.84) {
                        this.setChangedBlock(wx, baseY + 1, wz, flowerRoll > 0.92 ? 'flower_rose' : 'flower_dandelion');
                    }
                }
            }
            return;
        }

        const baseY = this.getColumnHeight(centerX, centerZ);
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                const ring = Math.abs(dx) === 3 || Math.abs(dz) === 3;
                this.setChangedBlock(centerX + dx, baseY, centerZ + dz, ring ? 'cobblestone' : 'path_block');
            }
        }
        this.setChangedBlock(centerX, baseY + 1, centerZ, 'lantern');
    }

    tryRestoreNearbyLandmark(position) {
        if (!position) return false;
        const nearby = this
            .getLandmarksNear(position.x, position.z, 8)
            .filter((landmark) => landmark.siteId && !landmark.restored);
        if (nearby.length === 0) return false;

        const target = nearby[0];
        const site = getRestorationSiteByLandmarkName(target.baseName);
        if (!site) return false;

        const mode = this.game?.gameState?.mode ?? 'SURVIVAL';
        const requirements = Array.isArray(site.requirements) ? site.requirements : [];
        if (mode !== 'CREATIVE' && !this.canAffordRequirements(requirements)) {
            const reqText = this.formatRequirementList(requirements);
            if (reqText) {
                window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: `NEED: ${reqText.toUpperCase()}` } }));
                return true;
            }
            return false;
        }
        if (mode !== 'CREATIVE' && requirements.length > 0) this.consumeRequirements(requirements);

        this.applyRestorationPatch(target, site);
        this.restoredLandmarks.add(target.key);
        target.restored = true;
        this.landmarks.set(target.key, target);

        if (Number.isFinite(site.xpReward) && site.xpReward > 0) {
            this.game?.stats?.addXP?.(site.xpReward);
        }

        const stats = this.getRestorationStats();
        window.dispatchEvent(new CustomEvent('restoration-progress', { detail: stats }));
        window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: `RESTORED ${target.name.toUpperCase()} (${stats.restored}/${stats.total})` } }));
        return true;
    }

    shouldPlaceVillageChunk(cx, cz) {
        if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return false;
        const hash = this.hash2D((cx * 31) + 71, (cz * 31) - 19);
        if (hash < 0.992) return false;
        const wx = (cx * this.chunkSize) + Math.floor(this.chunkSize * 0.5);
        const wz = (cz * this.chunkSize) + Math.floor(this.chunkSize * 0.5);
        const biome = this.getBiomeAt(wx, wz);
        return biome.id === 'plains' || biome.id === 'forest' || biome.id === 'meadow';
    }

    getStructureChunkScore(cx, cz) {
        return this.hash2D((cx * 47) + 113, (cz * 47) - 271);
    }

    isStructureChunkAnchor(cx, cz, radius = 2) {
        const score = this.getStructureChunkScore(cx, cz);
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (dx === 0 && dz === 0) continue;
                const other = this.getStructureChunkScore(cx + dx, cz + dz);
                if (other >= score) return false;
            }
        }
        return true;
    }

    shouldPlaceStructureChunk(cx, cz) {
        if (Math.abs(cx) <= 2 && Math.abs(cz) <= 2) return false;
        if (this.shouldPlaceVillageChunk(cx, cz)) return false;
        const score = this.getStructureChunkScore(cx, cz);
        if (score < 0.82) return false;
        return this.isStructureChunkAnchor(cx, cz, 2);
    }


    getDeepBlockId(x, y, z) {
        const r = this.hash3D((x * 17) + 13, y * 7, (z * 19) - 5);

        if (y > -8) {
            if (r > 0.992) return 'coal';
            if (r > 0.986) return 'copper';
            return 'stone';
        }

        if (y > -20) {
            if (r > 0.994) return 'tin';
            if (r > 0.988) return 'silver';
            if (r > 0.982) return 'iron';
            return 'stone';
        }

        if (y > -40) {
            if (r > 0.996) return 'ruby';
            if (r > 0.992) return 'sapphire';
            if (r > 0.986) return 'gold';
            if (r > 0.978) return 'amethyst';
            return 'stone';
        }

        if (y > -70) {
            if (r > 0.997) return 'platinum';
            if (r > 0.992) return 'uranium';
            if (r > 0.986) return 'diamond';
            if (r > 0.979) return 'obsidian';
            return 'stone';
        }

        if (r > 0.996) return 'mythril';
        if (r > 0.991) return 'diamond';
        if (r > 0.985) return 'uranium';
        return 'obsidian';
    }

    shouldCarveCave(x, y, z, terrainHeight) {
        if (!this.game?.features?.caves) return false;
        if (y >= terrainHeight - 2) return false;
        if (y <= this.deepMinY + 2) return false;

        const nA = this.noise.simplex3D(x * 0.04, y * 0.03, z * 0.04) * 0.5 + 0.5;
        const nB = this.noise.simplex3D(x * 0.01 + 17, y * 0.015 - 9, z * 0.01 + 4) * 0.5 + 0.5;
        const nC = this.noise.simplex3D(x * 0.005 - 41, y * 0.05 + 12, z * 0.005 + 63) * 0.5 + 0.5;
        const caveValue = (nA * 0.5) + (nB * 0.35) + (nC * 0.15);
        const depthRatio = Math.max(0, Math.min(1, (terrainHeight - y) / 96));

        const chamber = caveValue > (0.865 - (depthRatio * 0.08));
        const tunnelBand = Math.abs(nC - 0.5) < 0.04 && nA > 0.44;
        const fissureNoise = this.noise.simplex3D(x * 0.002 + 9, y * 0.02 - 31, z * 0.002 - 21) * 0.5 + 0.5;
        const fissure = Math.abs(fissureNoise - 0.5) < 0.03 && y < terrainHeight - 8;

        return chamber || tunnelBand || fissure;
    }

    ensureSubsurfacePocket(x, y, z, radius = 1, depth = 18) {
        const cx = Math.round(x);
        const cy = Math.round(y);
        const cz = Math.round(z);

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const wx = cx + dx;
                const wz = cz + dz;
                const naturalTop = this.getColumnHeight(wx, wz) - 1;
                const startY = Math.min(cy, naturalTop);

                for (let i = 0; i < depth; i++) {
                    const wy = startY - i;
                    if (wy < this.deepMinY) break;

                    const key = this.getKey(wx, wy, wz);
                    if (this.blockMap.has(key)) continue;
                    if (this.changedBlocks.get(key) === null) continue;

                    const id = this.getDeepBlockId(wx, wy, wz);
                    const ownerKey = this.getChunkKey(this.getChunkCoord(wx), this.getChunkCoord(wz));
                    this.addBlock(wx, wy, wz, id, ownerKey);
                }
            }
        }
    }

    ensureSubsurfaceBelow(x, y, z) {
        this.ensureSubsurfacePocket(x, y, z, 1, 24);
    }

    isBlockSolid(blockId) {
        if (!blockId) return false;
        if (blockId === 'water' || blockId === 'lava') return false;
        if (blockId === 'leaves' || blockId.startsWith('leaves_')) return false;
        if (blockId === 'cloud_block') return false;

        const blockData = this.getBlockData(blockId);
        if (blockData?.deco || blockData?.nonSolid) return false;
        return true;
    }

    getBlockData(id) {
        return this.blockDataById.get(id) ?? null;
    }


    isSolidAt(x, y, z) {
        const id = this.blockMap.get(this.getKey(Math.round(x), Math.round(y), Math.round(z)));
        if (!id) return false;
        return this.isBlockSolid(id);
    }

    isWaterAt(x, y, z) {
        return this.blockMap.get(this.getKey(Math.round(x), Math.round(y), Math.round(z))) === 'water';
    }

    isPositionInWater(positionOrX, y, z) {
        const fromObject = positionOrX && typeof positionOrX === 'object';
        const px = fromObject ? Number(positionOrX.x) : Number(positionOrX);
        const py = fromObject ? Number(positionOrX.y) : Number(y);
        const pz = fromObject ? Number(positionOrX.z) : Number(z);
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return false;

        // Check both head and feet for better swimming feel.
        const samples = [py + 0.15, py - 0.2, py - 0.8];
        for (let i = 0; i < samples.length; i++) {
            const cy = Math.floor(samples[i] + 0.5);
            if (this.isWaterAt(px, cy, pz)) return true;
        }
        return false;
    }

    computeMineDuration(blockId, selectedItem, mode) {
        if (mode === 'CREATIVE') return 0;

        const hardness = Math.max(0.15, Number(this.blockHardnessById.get(blockId) ?? 1));
        let efficiency = 1;
        if (selectedItem?.id) {
            const tool = this.toolById.get(selectedItem.id);
            if (tool) efficiency += Math.max(0, Number(tool.efficiency) || 0);
        }
        return Math.max(0.12, (hardness * 0.9) / efficiency);
    }

    breakBlockAt(x, y, z) {
        const key = this.getKey(x, y, z);
        const id = this.blockMap.get(key);
        if (!id || id === 'bedrock') return false;

        this.changedBlocks.set(key, null);
        this.removeBlockByKey(key, { skipChangeTracking: true });
        this.flushPriorityChunkRebuilds(20);
        this.ensureSubsurfaceBelow(x, y - 1, z);
        this.spawnBreakParticles(x, y, z, id);
        this.spawnPickupEffect(x, y, z, id, this.game?.getPlayerPosition?.());


        window.dispatchEvent(new CustomEvent('block-mined', { detail: { id, x, y, z } }));
        return true;
    }

    resetMiningProgress() {
        this.miningState.key = null;
        this.miningState.progress = 0;
        this.miningState.required = 0;
        if (this.miningCracks) {
            this.miningCracks.visible = false;
        }
        window.dispatchEvent(new CustomEvent('mining-progress', { detail: { ratio: 0, id: null, done: true } }));
    }

    getBlockColor(id) {
        const palette = {
            grass: 0x7cc56a,
            dirt: 0x8a6442,
            stone: 0x8c969f,
            sand: 0xd2c48d,
            wood: 0x926d49,
            leaves: 0x4e9a57,
            water: 0x4a76df,
            iron: 0xbec0c4,
            gold: 0xf1cc4e,
            diamond: 0x6de5da,
            coal: 0x4a4d53,
            copper: 0xc57a44,
            tin: 0xbac2cb,
            silver: 0xdce2e8,
            ruby: 0xe2446a,
            sapphire: 0x4c7fff,
            amethyst: 0x9e72ef,
            uranium: 0x7dff5d,
            platinum: 0xd8e8f8,
            mythril: 0x62f1ff,
            arlo: 0xffaac9,
            obsidian: 0x3b3054
        };
        return palette[id] ?? 0xb8c0ca;
    }

    spawnBreakParticles(x, y, z, blockId) {
        const color = this.getBlockColor(blockId);
        for (let i = 0; i < 6; i++) {
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9
            });
            const mesh = new THREE.Mesh(this.breakParticleGeometry, material);
            mesh.position.set(
                x + ((Math.random() - 0.5) * 0.4),
                y + ((Math.random() - 0.5) * 0.35),
                z + ((Math.random() - 0.5) * 0.4)
            );
            this.scene.add(mesh);
            this.breakParticles.push({
                mesh,
                vx: (Math.random() - 0.5) * 2.0,
                vy: 1.2 + (Math.random() * 1.5),
                vz: (Math.random() - 0.5) * 2.0,
                life: 0.42
            });
        }
    }

    updateBreakParticles(delta) {
        for (let i = this.breakParticles.length - 1; i >= 0; i--) {
            const p = this.breakParticles[i];
            p.life -= delta;
            p.vy -= 10.5 * delta;
            p.mesh.position.x += p.vx * delta;
            p.mesh.position.y += p.vy * delta;
            p.mesh.position.z += p.vz * delta;

            p.mesh.material.opacity = Math.max(0, p.life / 0.42);
            if (p.life > 0) continue;

            this.scene.remove(p.mesh);
            p.mesh.material.dispose();
            this.breakParticles.splice(i, 1);
        }
    }

    spawnPickupEffect(x, y, z, blockId, playerPosition) {
        if (!this.game?.features?.blockBreakPickupMagnet) return;
        const distanceSq = playerPosition
            ? ((x - playerPosition.x) ** 2) + ((y - playerPosition.y) ** 2) + ((z - playerPosition.z) ** 2)
            : Infinity;
        const attract = distanceSq <= (7 * 7);

        const material = new THREE.MeshBasicMaterial({
            color: this.getBlockColor(blockId),
            transparent: true,
            opacity: 0.95
        });
        const mesh = new THREE.Mesh(this.pickupGeometry, material);
        mesh.position.set(x, y, z);
        mesh.scale.set(1, 1, 1);
        this.scene.add(mesh);

        this.pickupEffects.push({
            mesh,
            age: 0,
            life: attract ? 0.55 : 0.24,
            attract
        });
    }

    updatePickupEffects(delta, playerPosition) {
        for (let i = this.pickupEffects.length - 1; i >= 0; i--) {
            const fx = this.pickupEffects[i];
            fx.age += delta;
            fx.life -= delta;

            if (fx.age < 0.12) {
                const shrink = 1 - (fx.age / 0.12) * 0.4;
                fx.mesh.scale.set(shrink, shrink, shrink);
            }

            if (fx.attract && playerPosition && fx.age >= 0.12) {
                const tx = playerPosition.x;
                const ty = playerPosition.y + 0.65;
                const tz = playerPosition.z;
                const dx = tx - fx.mesh.position.x;
                const dy = ty - fx.mesh.position.y;
                const dz = tz - fx.mesh.position.z;
                const dist = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
                if (dist > 0.0001) {
                    const speed = 8.5;
                    const step = Math.min(dist, speed * delta);
                    fx.mesh.position.x += (dx / dist) * step;
                    fx.mesh.position.y += (dy / dist) * step;
                    fx.mesh.position.z += (dz / dist) * step;
                }

                const pullScale = Math.max(0.25, fx.mesh.scale.x * 0.92);
                fx.mesh.scale.set(pullScale, pullScale, pullScale);

                if (dist < 0.35) fx.life = 0;
            }

            fx.mesh.material.opacity = Math.max(0, fx.life / (fx.attract ? 0.55 : 0.24));
            if (fx.life > 0) continue;

            this.scene.remove(fx.mesh);
            fx.mesh.material.dispose();
            this.pickupEffects.splice(i, 1);
        }
    }

    addBlock(x, y, z, id, ownerKey = null, replace = false, options = {}) {
        const gx = Math.round(x);
        const gy = Math.round(y);
        const gz = Math.round(z);
        const allowCorruption = Boolean(options?.allowCorruption);
        if (!allowCorruption && !this.corruptionEnabled && (id === 'virus' || id === 'arlo')) return null;
        const key = this.getKey(gx, gy, gz);
        const existing = this.blockMap.get(key);
        if (existing && !replace) return existing;
        if (existing && replace) this.removeBlockByKey(key, { skipChangeTracking: true });

        const owner = ownerKey ?? this.getChunkKey(this.getChunkCoord(gx), this.getChunkCoord(gz));
        this.blockMap.set(key, id);
        this.blockOwners.set(key, owner);
        
        if (id === 'virus') this.virusBlockCount++;
        
        const ownerChunk = this.getChunk(this.getChunkCoord(gx), this.getChunkCoord(gz));
        if (ownerChunk) {
            ownerChunk.blockKeys.add(key);
            ownerChunk.dirty = true;
            this.priorityDirtyChunkKeys.add(owner);
        }

        this.updateNeighborsDirty(gx, gy, gz);
        if (id === 'virus' || id === 'arlo') {
            this.markChunksWithinBlockRadiusDirty(gx, gz, this.virusInfluenceRadiusBlocks, true);
        }

        return id;
    }

    removeBlockByKey(key, options = {}) {
        const id = this.blockMap.get(key);
        if (!id) return false;

        if (!options.skipChangeTracking) {
            this.changedBlocks.set(key, null);
        }

        const owner = this.blockOwners.get(key);
        this.blockMap.delete(key);
        this.blockOwners.delete(key);
        
        if (id === 'virus' && this.virusBlockCount > 0) this.virusBlockCount--;
        
        const ownerChunk = this.chunks.get(owner);
        if (ownerChunk) {
            ownerChunk.blockKeys.delete(key);
            ownerChunk.dirty = true;
            this.priorityDirtyChunkKeys.add(owner);
        }

        const [x, y, z] = this.keyToCoords(key);
        this.updateNeighborsDirty(x, y, z);
        if (id === 'virus' || id === 'arlo') {
            this.markChunksWithinBlockRadiusDirty(x, z, this.virusInfluenceRadiusBlocks, true);
        }
        return true;
    }

    markChunksWithinBlockRadiusDirty(x, z, radius = this.virusInfluenceRadiusBlocks, prioritize = false) {
        const minCx = this.getChunkCoord(x - radius);
        const maxCx = this.getChunkCoord(x + radius);
        const minCz = this.getChunkCoord(z - radius);
        const maxCz = this.getChunkCoord(z + radius);
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cz = minCz; cz <= maxCz; cz++) {
                const chunkKey = this.getChunkKey(cx, cz);
                const chunk = this.chunks.get(chunkKey);
                if (!chunk) continue;
                chunk.dirty = true;
                if (prioritize) this.priorityDirtyChunkKeys.add(chunkKey);
            }
        }
    }

    updateNeighborsDirty(x, y, z) {
        const neighbors = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        for (const [dx, dy, dz] of neighbors) {
            const nx = x + dx;
            const nz = z + dz;
            const chunk = this.getChunk(this.getChunkCoord(nx), this.getChunkCoord(nz));
            if (!chunk) continue;
            chunk.dirty = true;
            this.priorityDirtyChunkKeys.add(chunk.key);
        }
    }

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

    mineBlock(camera) {
        const hit = this.raycastBlocks(camera, 6, false);
        if (!hit) return false;
        const broken = this.breakBlockAt(hit.cell.x, hit.cell.y, hit.cell.z);
        this.resetMiningProgress();
        return broken;
    }

    mineBlockProgress(camera, delta, selectedItem, mode = 'SURVIVAL') {
        const hit = this.raycastBlocks(camera, 6, false);
        if (!hit) {
            this.resetMiningProgress();
            return false;
        }

        const blockId = hit.id;
        if (blockId === 'bedrock') {
            this.resetMiningProgress();
            return false;
        }

        if (mode === 'CREATIVE') {
            const broken = this.breakBlockAt(hit.cell.x, hit.cell.y, hit.cell.z);
            this.resetMiningProgress();
            return broken;
        }

        const key = this.getKey(hit.cell.x, hit.cell.y, hit.cell.z);
        if (this.miningState.key !== key) {
            this.miningState.key = key;
            this.miningState.progress = 0;
            this.miningState.required = this.computeMineDuration(blockId, selectedItem, mode);
        }

        this.miningState.progress += Math.max(0, delta);
        const ratio = Math.max(0, Math.min(1, this.miningState.progress / Math.max(0.01, this.miningState.required)));
        this.miningCracks.visible = true;
        this.miningCracks.position.set(hit.cell.x, hit.cell.y, hit.cell.z);
        this.miningCracks.material.opacity = 0.15 + (ratio * 0.45);
        this.miningCracks.scale.set(1, 1, 1).multiplyScalar(1 - (ratio * 0.05));
        window.dispatchEvent(new CustomEvent('mining-progress', { detail: { ratio, id: blockId, done: false } }));

        if (this.miningState.progress < this.miningState.required) return false;

        const broken = this.breakBlockAt(hit.cell.x, hit.cell.y, hit.cell.z);
        this.resetMiningProgress();
        return broken;
    }

    digDownFrom(position, mode = 'SURVIVAL') {
        if (!position) return false;
        const x = Math.round(position.x);
        const z = Math.round(position.z);
        const y = Math.floor(position.y - 0.85);

        const id = this.blockMap.get(this.getKey(x, y, z));
        if (!id || id === 'bedrock') return false;
        if (mode !== 'CREATIVE' && id === 'water') return false;

        const broken = this.breakBlockAt(x, y, z);
        if (broken) this.ensureSubsurfacePocket(x, y - 1, z, 1, 26);
        return broken;
    }

    resolveBlockPlacementId(slotItem) {
        if (!slotItem || !slotItem.id) return null;
        if (slotItem.kind === 'tool') return null;

        // Backward compatible with older saves that did not store `kind`.
        const blockData = this.blockDataById.get(slotItem.id);
        if (!blockData) return null;
        if (!this.corruptionEnabled && (slotItem.id === 'virus' || slotItem.id === 'arlo')) return null;
        return slotItem.id;
    }

    isReplaceableForPlacement(id) {
        if (!id) return true;
        if (id === 'water' || id === 'lava') return true;
        const block = this.getBlockData(id);
        if (block?.deco || block?.nonSolid) return true;
        return !this.isBlockSolid(id);
    }

    getSelectedInventoryItem() {
        const slot = this.game?.gameState?.selectedSlot ?? 0;
        return this.game?.gameState?.inventory?.[slot] ?? null;
    }

    getCurrentRestorationPrompt() {
        const stats = this.getRestorationStats();
        if (stats.total <= 0) return 'NO RESTORE SITES NEARBY';
        return `RESTORATION ${stats.restored}/${stats.total}`;
    }

    interactBlock(camera) {
        const hit = this.raycastBlocks(camera, 6, true);
        if (!hit) return false;
        const blockId = hit.id;

        if (blockId === 'crafting_table') {
            window.dispatchEvent(new CustomEvent('interact-crafting-table'));
            return true;
        }

        if (blockId === 'starter_chest') {
            if (!this.starterChestClaimed) {
                this.starterChestClaimed = true;
                this.game?.grantStarterChestLoot?.();
                window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: 'STARTER CHEST LOOT' } }));
            } else {
                window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: 'CHEST EMPTY' } }));
            }
            return true;
        }

        const holdingBlock = Boolean(this.resolveBlockPlacementId(this.getSelectedInventoryItem()));
        if (!holdingBlock && this.tryRestoreNearbyLandmark(camera.position)) return true;
        if (!holdingBlock) {
            window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: this.getCurrentRestorationPrompt() } }));
            return true;
        }
        return null;
    }

    placeBlock(camera, slotId) {
        const blockId = this.resolveBlockPlacementId(this.game?.gameState.inventory[slotId]);
        if (!blockId) return false;

        const hit = this.raycastBlocks(camera, 6, true);
        if (!hit) return false;
        const px = hit.previous.x;
        const py = hit.previous.y;
        const pz = hit.previous.z;
        const key = this.getKey(px, py, pz);
        const existingId = this.blockMap.get(key);
        const replaceExisting = this.isReplaceableForPlacement(existingId);

        const playerPos = camera.position;
        if (new THREE.Vector3(px, py, pz).distanceTo(playerPos) < 1.05) return false;
        if (existingId && !replaceExisting) return false;

        const ownerKey = this.getChunkKey(this.getChunkCoord(px), this.getChunkCoord(pz));
        this.changedBlocks.set(key, blockId);
        this.addBlock(px, py, pz, blockId, ownerKey, replaceExisting);
        window.dispatchEvent(new CustomEvent('block-placed', { detail: { id: blockId } }));
        return true;
    }

    getBlockXP(id) {
        return this.blockXpById.get(id) ?? 1;
    }

    setRenderDistance(value) {
        const next = Math.max(this.minRenderDistance, Math.min(this.maxRenderDistance, value));
        if (next === this.renderDistance) return;
        this.renderDistance = next;
        this.lastPlayerChunkKey = null;
    }

    loadChunk(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        if (this.chunks.has(key)) {
            this.pendingChunkSet.delete(key);
            return;
        }
        const chunk = new Chunk(this, cx, cz);
        this.chunks.set(key, chunk);
        try {
            chunk.generate();
            // Build mesh immediately so newly loaded chunks don't appear as holes.
            if (chunk.dirty && !chunk.destroyed) chunk.update();
        } catch (error) {
            console.warn('[ArloCraft] Chunk generation failed:', key, error);
            chunk.destroy();
            this.chunks.delete(key);
        } finally {
            this.pendingChunkSet.delete(key);
        }

        if (
            this.corruptionEnabled
            && this.hash2D(cx + 411, cz - 108) > 0.93
            && this.game.entities.entities.length < this.game.entities.maxEntities
        ) {
            const wx = (cx * this.chunkSize) + Math.floor(this.chunkSize / 2);
            const wz = (cz * this.chunkSize) + Math.floor(this.chunkSize / 2);
            const wy = this.getTerrainHeight(wx, wz) + 2;
            this.game.entities.spawn('virus_grunt', wx + 0.5, wy, wz + 0.5);
        }
    }

    ensureCriticalChunks(centerCx, centerCz, radius = 1) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const cx = centerCx + dx;
                const cz = centerCz + dz;
                const key = this.getChunkKey(cx, cz);
                const chunk = this.chunks.get(key);
                if (!chunk) {
                    this.loadChunk(cx, cz);
                    continue;
                }
                if (chunk.dirty && !chunk.destroyed) {
                    chunk.update();
                }
            }
        }
    }

    queueChunkLoad(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        if (this.chunks.has(key) || this.pendingChunkSet.has(key)) return;
        this.pendingChunkSet.add(key);
        this.pendingChunkLoads.push({ cx, cz, key });
    }

    processChunkLoadQueue(centerCx, centerCz, explicitBudget = null) {
        if (this.pendingChunkLoads.length === 0) return;

        let budget = explicitBudget;
        if (!Number.isFinite(budget)) {
            const tier = this.game?.qualityTier ?? 'balanced';
            if (tier === 'low') budget = 6;
            else if (tier === 'high') budget = 14;
            else budget = 10;
        }

        budget = Math.max(1, Math.floor(budget));
        while (budget > 0 && this.pendingChunkLoads.length > 0) {
            let bestIndex = 0;
            let bestDist = Infinity;
            for (let i = 0; i < this.pendingChunkLoads.length; i++) {
                const p = this.pendingChunkLoads[i];
                const dx = p.cx - centerCx;
                const dz = p.cz - centerCz;
                const dist = (dx * dx) + (dz * dz);
                if (dist >= bestDist) continue;
                bestDist = dist;
                bestIndex = i;
            }

            const next = this.pendingChunkLoads.splice(bestIndex, 1)[0];
            if (!next) break;
            this.loadChunk(next.cx, next.cz);
            budget -= 1;
        }
    }

    processDirtyChunkRebuilds() {
        this.flushPriorityChunkRebuilds(8);

        const chunks = Array.from(this.chunks.values());
        const total = chunks.length;
        if (total === 0) return;

        const tier = this.game?.qualityTier ?? 'balanced';
        const rebuildBudget = tier === 'low' ? 2 : (tier === 'high' ? 5 : 3);
        let rebuilt = 0;
        let scanned = 0;
        let cursor = this.chunkMeshRebuildCursor % total;

        while (scanned < total && rebuilt < rebuildBudget) {
            const chunk = chunks[cursor];
            if (chunk?.dirty && !chunk.destroyed) {
                chunk.update();
                rebuilt += 1;
            }

            scanned += 1;
            cursor = (cursor + 1) % total;
        }

        this.chunkMeshRebuildCursor = cursor;
    }

    ensureChunkMeshColorSanity(limit = 10) {
        this.meshSanityTick = (this.meshSanityTick + 1) % 30;
        if (this.meshSanityTick !== 0) return;

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
                if (hasVertexColors && !mesh.instanceColor) {
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

    unloadFarChunks(centerCx, centerCz) {
        const unloadRadius = this.renderDistance + 3;
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

    ensureChunksAround(centerCx, centerCz) {
        const preloadRadius = this.renderDistance + 1;
        for (let dx = -preloadRadius; dx <= preloadRadius; dx++) {
            for (let dz = -preloadRadius; dz <= preloadRadius; dz++) {
                this.queueChunkLoad(centerCx + dx, centerCz + dz);
            }
        }
    }

    getSurfaceHeightAt(x, z) {
        const gx = Math.floor(x + 0.5);
        const gz = Math.floor(z + 0.5);
        const chunkKey = this.getChunkKey(this.getChunkCoord(gx), this.getChunkCoord(gz));
        const chunkLoaded = this.chunks.has(chunkKey);

        for (let y = this.maxTerrainY + 8; y >= this.minTerrainY - 2; y--) {
            const id = this.blockMap.get(this.getKey(gx, y, gz));
            if (!id) continue;
            if (id === 'water') continue;
            return y + 0.5;
        }

        if (chunkLoaded) return this.deepMinY;
        return this.getColumnHeight(gx, gz) + 0.5;
    }

    getGroundYBelow(x, currentY, z) {
        const gx = Math.floor(x + 0.5);
        const gz = Math.floor(z + 0.5);
        const startY = Math.floor(currentY + 0.5);
        const minY = this.deepMinY;

        for (let y = startY; y >= minY; y--) {
            const id = this.blockMap.get(this.getKey(gx, y, gz));
            if (!id) continue;
            if (!this.isBlockSolid(id)) continue;
            return y + 0.5;
        }

        const chunkKey = this.getChunkKey(this.getChunkCoord(gx), this.getChunkCoord(gz));
        if (this.chunks.has(chunkKey)) return this.deepMinY - 2;
        return this.getColumnHeight(gx, gz) + 0.5;
    }

    getSupportHeightAt(x, z, radius = 0.33) {
        const samples = [
            [x, z],
            [x + radius, z + radius],
            [x + radius, z - radius],
            [x - radius, z + radius],
            [x - radius, z - radius]
        ];

        let maxHeight = -Infinity;
        for (const [sx, sz] of samples) {
            const h = this.getSurfaceHeightAt(sx, sz);
            if (h > maxHeight) maxHeight = h;
        }
        return maxHeight;
    }

    getTopSolidBlockAt(x, z) {
        const gx = Math.round(x);
        const gz = Math.round(z);
        for (let y = this.maxTerrainY + 10; y >= this.minTerrainY - 2; y--) {
            const id = this.blockMap.get(this.getKey(gx, y, gz));
            if (!id) continue;
            if (!this.isBlockSolid(id) || id === 'leaves' || id.startsWith('leaves_')) continue;
            return { id, y };
        }
        return null;
    }

    getTopBlockAt(x, z) {
        const gx = Math.round(x);
        const gz = Math.round(z);
        for (let y = this.maxTerrainY + 10; y >= this.minTerrainY - 2; y--) {
            const id = this.blockMap.get(this.getKey(gx, y, gz));
            if (id) return id;
        }
        return null;
    }

    getWaterSurfaceYAt(x, z) {
        const gx = Math.round(x);
        const gz = Math.round(z);
        for (let y = this.maxTerrainY + 10; y >= this.minTerrainY - 2; y--) {
            const id = this.blockMap.get(this.getKey(gx, y, gz));
            if (id !== 'water') continue;
            const above = this.blockMap.get(this.getKey(gx, y + 1, gz));
            if (above === 'water') continue;
            return y + 0.5;
        }
        return null;
    }

    getTopBlockIdAt(x, z) {
        const id = this.getTopBlockAt(x, z);
        if (id) return id;

        const terrain = this.getColumnHeight(Math.round(x), Math.round(z));
        if (terrain <= this.seaLevel) return 'water';
        return terrain <= this.seaLevel + 1 ? 'sand' : 'grass';
    }

    getBiomeIdAt(x, z) {
        return this.getBiomeAt(x, z)?.id ?? 'plains';
    }

    getAreaInfluence(position) {
        if (!this.corruptionEnabled && !this.structureVirusInfluenceEnabled) {
            this.areaInfluenceSample = { x: 0, y: 0, z: 0, virus: 0, arlo: 0 };
            return this.areaInfluenceSample;
        }
        if (!position) return this.areaInfluenceSample ?? { x: 0, y: 0, z: 0, virus: 0, arlo: 0 };

        this.auraSampleTick = (this.auraSampleTick + 1) % 10;
        if (this.auraSampleTick !== 0 && this.areaInfluenceSample) return this.areaInfluenceSample;

        const px = Math.round(position.x);
        const py = Math.round(position.y);
        const pz = Math.round(position.z);
        const radius = this.virusInfluenceRadiusBlocks;
        let virusHits = 0;
        let arloHits = 0;
        let samples = 0;

        for (let dx = -radius; dx <= radius; dx += 2) {
            for (let dz = -radius; dz <= radius; dz += 2) {
                for (let dy = -1; dy <= 2; dy++) {
                    const id = this.blockMap.get(this.getKey(px + dx, py + dy, pz + dz));
                    if (!id) continue;
                    samples += 1;
                    if (id === 'virus') virusHits += 1;
                    else if (id === 'arlo') arloHits += 1;
                }
            }
        }

        const densityBase = Math.max(1, samples);
        this.areaInfluenceSample = {
            x: px,
            y: py,
            z: pz,
            virus: Math.max(0, Math.min(1, virusHits / Math.max(16, densityBase * 0.9))),
            arlo: Math.max(0, Math.min(1, arloHits / Math.max(4, densityBase * 0.3)))
        };
        return this.areaInfluenceSample;
    }

    hasHeadroomAt(x, y, z) {
        const head1 = this.blockMap.get(this.getKey(x, y + 1, z));
        const head2 = this.blockMap.get(this.getKey(x, y + 2, z));
        return !head1 && !head2;
    }

    getSafeSpawnPoint(originX = 0, originZ = 0, maxRadius = 24) {
        const ox = Math.round(originX);
        const oz = Math.round(originZ);

        for (let radius = 0; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
                    const x = ox + dx;
                    const z = oz + dz;
                    const top = this.getTopSolidBlockAt(x, z);
                    if (!top) continue;
                    if (top.id === 'water' || top.id === 'leaves') continue;
                    if (!this.hasHeadroomAt(x, top.y, z)) continue;
                    return {
                        x,
                        y: top.y + 0.8,
                        z
                    };
                }
            }
        }

        const fallbackY = Math.max(this.getTerrainHeight(ox, oz), this.seaLevel + 2) + 0.8;
        return { x: ox, y: fallbackY, z: oz };
    }

    ensureStarterChest() {
        if (this.starterChestClaimed) return;
        if (this.starterChestKey && this.blockMap.get(this.starterChestKey) === 'starter_chest') return;

        const spawn = this.getSafeSpawnPoint(0, 0, 18);
        const baseX = Math.round(spawn.x);
        const baseZ = Math.round(spawn.z);
        const surfaceY = Math.floor(spawn.y - 0.8);
        const candidates = [
            [baseX + 1, surfaceY + 1, baseZ],
            [baseX - 1, surfaceY + 1, baseZ],
            [baseX, surfaceY + 1, baseZ + 1],
            [baseX, surfaceY + 1, baseZ - 1],
            [baseX + 2, surfaceY + 1, baseZ],
            [baseX, surfaceY + 1, baseZ + 2]
        ];

        for (const [x, y, z] of candidates) {
            const key = this.getKey(x, y, z);
            if (this.blockMap.has(key)) continue;
            if (this.isWaterAt(x, y, z) || this.isWaterAt(x, y - 1, z)) continue;

            const belowId = this.blockMap.get(this.getKey(x, y - 1, z));
            if (!belowId || !this.isBlockSolid(belowId)) continue;

            const ownerKey = this.getChunkKey(this.getChunkCoord(x), this.getChunkCoord(z));
            this.changedBlocks.set(key, 'starter_chest');
            this.addBlock(x, y, z, 'starter_chest', ownerKey);
            this.starterChestKey = key;
            return;
        }
    }

    removeBlockAt(x, y, z) {
        return this.removeBlockByKey(this.getKey(x, y, z));
    }

    updateDirectionalChunkVisibility(playerPosition, camera) {
        if (!this.game?.features?.directionalChunkCulling) return;
        if (this.renderDistance <= 0) return;
        if (!camera) return;

        this.chunkVisibilityTick = (this.chunkVisibilityTick + 1) % 8;
        if (this.chunkVisibilityTick !== 0) return;

        camera.getWorldDirection(this.tmpCameraForward);
        this.tmpCameraForward.y = 0;
        if (this.tmpCameraForward.lengthSq() < 0.0001) return;
        this.tmpCameraForward.normalize();
        this.tmpCameraRight.crossVectors(this.tmpCameraForward, this.tmpUp).normalize();

        const nearDistSq = (this.chunkSize * 1.35) ** 2;
        const maxCullDistance = Math.max(this.chunkSize * (this.renderDistance + 0.5), this.chunkSize * 2);
        for (const chunk of this.chunks.values()) {
            const centerX = (chunk.cx * this.chunkSize) + (this.chunkSize * 0.5);
            const centerZ = (chunk.cz * this.chunkSize) + (this.chunkSize * 0.5);
            const dx = centerX - playerPosition.x;
            const dz = centerZ - playerPosition.z;
            const distSq = (dx * dx) + (dz * dz);

            let visible = true;
            if (distSq > nearDistSq) {
                const dist = Math.sqrt(distSq);
                const invDist = dist > 0 ? (1 / dist) : 0;
                const dirX = dx * invDist;
                const dirZ = dz * invDist;
                const forwardDot = (dirX * this.tmpCameraForward.x) + (dirZ * this.tmpCameraForward.z);
                const sideDot = Math.abs((dirX * this.tmpCameraRight.x) + (dirZ * this.tmpCameraRight.z));
                const distFactor = Math.min(1, dist / Math.max(1, maxCullDistance));

                const backThreshold = THREE.MathUtils.lerp(-0.25, 0.04, distFactor);
                const sideThreshold = THREE.MathUtils.lerp(0.98, 0.8, distFactor);
                if (forwardDot < backThreshold) visible = false;
                if (visible && sideDot > sideThreshold && forwardDot < 0.55) visible = false;
            }

            chunk.setVisible(visible);
        }
    }

    update(playerPosition, delta = (1 / 60)) {
        if (this.forceFullRemeshPending) {
            for (const chunk of this.chunks.values()) chunk.dirty = true;
            this.forceFullRemeshPending = false;
        }

        this.ensureChunkMeshColorSanity();

        // 1. Process Chunk Updates (dirty rebuilds) with per-frame budget to reduce frame spikes.
        this.processDirtyChunkRebuilds();

        // ... existing visual updates ...
        if (this.game?.features?.animatedVirusBlocks && this.virusBlockCount > 0) {
            this.gifTick = (this.gifTick + 1) % 4;
            if (this.gifTick === 0) this.registry.updateAnimatedTextures();
        }
        this.registry.updateShaderMaterials(performance.now() * 0.001);

        const dt = Math.max(1 / 120, Math.min(1 / 24, delta));
        this.updateBreakParticles(dt);
        this.updatePickupEffects(dt, playerPosition);

        const playerCx = this.getChunkCoord(playerPosition.x);
        const playerCz = this.getChunkCoord(playerPosition.z);
        const key = this.getChunkKey(playerCx, playerCz);
        if (!this.chunks.has(key)) this.loadChunk(playerCx, playerCz);

        if (this.lastPlayerChunkKey !== key) {
            this.unloadFarChunks(playerCx, playerCz);
            this.ensureChunksAround(playerCx, playerCz);
            this.lastPlayerChunkKey = key;
        }
        this.chunkRefreshTick = (this.chunkRefreshTick + 1) % 20;
        if (this.chunkRefreshTick === 0) {
            this.ensureChunksAround(playerCx, playerCz);
        }

        this.criticalChunkTick = (this.criticalChunkTick + 1) % 4;
        if (this.criticalChunkTick === 0) {
            this.ensureCriticalChunks(playerCx, playerCz, 2);
        }
        this.processChunkLoadQueue(playerCx, playerCz);

        const cam = this.game?.camera?.instance;
        // Directional culling disabled for stability.
        // Ensure no chunk remains hidden from older visibility states.
        for (const chunk of this.chunks.values()) {
            if (!chunk.visible) chunk.setVisible(true);
        }
        if (cam) {
            this.hoverTick = (this.hoverTick + 1) % 6;
            if (this.hoverTick === 0) {
                const hit = this.raycastBlocks(cam, 6, true);
                if (hit) {
                    this.hoverOutline.visible = true;
                    this.hoverOutline.position.set(hit.cell.x, hit.cell.y, hit.cell.z);
                } else {
                    this.hoverOutline.visible = false;
                }
            }
        }

        this.subsurfaceTick = (this.subsurfaceTick + 1) % 18;
        if (this.subsurfaceTick === 0 && playerPosition.y < (this.minTerrainY + 3)) {
            this.ensureSubsurfacePocket(playerPosition.x, playerPosition.y - 1, playerPosition.z, 0, 8);
        }

        // --- DYNAMIC MOB SPAWNING ---
        this.spawnTick = (this.spawnTick || 0) + 1;
        if (this.spawnTick % 60 === 0 && this.game?.entities) {
            this.trySpawnNaturalMob(playerPosition);
            if (this.spawnTick % 360 === 0) this.trySpawnBird(playerPosition);
        }
    }

    trySpawnBird(playerPos) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 20;
        const sx = playerPos.x + Math.cos(angle) * dist;
        const sz = playerPos.z + Math.sin(angle) * dist;
        this.game.entities.spawn('sky_bird', sx, 75, sz);
    }

    trySpawnNaturalMob(playerPos) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 35 + Math.random() * 25;
        const sx = playerPos.x + Math.cos(angle) * dist;
        const sz = playerPos.z + Math.sin(angle) * dist;
        
        const biome = this.getBiomeAt(sx, sz);
        const height = this.getTerrainHeight(sx, sz);
        const inWater = this.isWaterAt(sx, height, sz);

        const possibleMobs = MOBS.filter(m => {
            if (!this.corruptionEnabled && m.id === 'virus_grunt') return false;
            const matchBiome = m.biomes?.includes(biome.id) || m.biomes?.includes('any');
            const matchAquatic = m.aquatic ? inWater : !inWater;
            return matchBiome && matchAquatic;
        });

        if (possibleMobs.length === 0) return;
        const mob = possibleMobs[Math.floor(Math.random() * possibleMobs.length)];
        if (mob.friendly && Math.random() < 0.75) return;
        const waterSurface = this.getWaterSurfaceYAt(sx, sz);
        const halfHeight = 0.6;
        const spawnY = inWater && waterSurface !== null
            ? (waterSurface + halfHeight)
            : (height + halfHeight);
        this.game.entities.spawn(mob.id, sx, spawnY, sz);
    }
}
    
