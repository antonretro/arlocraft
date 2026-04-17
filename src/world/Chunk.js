import * as THREE from 'three';
import { STRUCTURES } from './structures/StructureRegistry.js';
import { RENDER_LAYERS, materialIsTransparent } from '../rendering/RenderConfig.js';

const CORRUPTION_STRUCTURE_KEYS = new Set([
    'virus_nexus',
    'corrupted_lab',
    'restoration_shrine'
]);

// These structures have dedicated placement logic and should not appear in the random pool
const EXCLUDED_FROM_RANDOM_POOL = new Set(['dungeon_chamber', 'village_manor', 'village_hut']);

const CIVIC_STRUCTURE_POOL = [
    'village_hut',
    'market_stall',
    'blacksmith_forge',
    'village_well',
    'mine_entrance',
    'ruined_bridge',
    'lamp_plaza',
    'orchard_grove',
    'fishing_dock',
    'abandoned_camp',
    'collapsed_bunker',
    'broken_statue',
    'windmill_outpost'
];

const BIOME_GROUND_LIFE = {
    plains: ['flower_dandelion', 'flower_rose'],
    forest: ['mushroom_brown', 'blueberry', 'strawberry', 'flower_rose'],
    meadow: ['flower_dandelion', 'flower_rose', 'blueberry'],
    swamp: ['mushroom_brown', 'blueberry'],
    desert: ['tomato'],
    badlands: ['carrot'],
    canyon: ['carrot'],
    highlands: ['potato'],
    alpine: ['potato'],
    tundra: ['potato']
};

const TREE_PROFILES = {
    oak: { trunk: 'wood', leaves: 'leaves', height: 5, radius: 2, style: 'round' },
    birch: { trunk: 'wood_birch', leaves: 'leaves_birch', height: 6, radius: 2, style: 'round' },
    pine: { trunk: 'wood_pine', leaves: 'leaves_pine', height: 7, radius: 2, style: 'cone' },
    palm: { trunk: 'wood_palm', leaves: 'leaves_palm', height: 6, radius: 3, style: 'palm' },
    willow: { trunk: 'wood_willow', leaves: 'leaves_willow', height: 5, radius: 3, style: 'willow' },
    cherry: { trunk: 'wood_cherry', leaves: 'leaves_cherry', height: 5, radius: 3, style: 'round' },
    redwood: { trunk: 'wood_redwood', leaves: 'leaves_redwood', height: 11, radius: 2, style: 'spire' },
    crystal: { trunk: 'wood_crystal', leaves: 'leaves_crystal', height: 7, radius: 2, style: 'crystal' }
};

export class Chunk {
    constructor(world, cx, cz) {
        this.world = world;
        this.cx = cx;
        this.cz = cz;
        this.key = world.getChunkKey(cx, cz);
        this.blockKeys = new Set();
        this.visible = true;
        this.group = new THREE.Group();
        this.group.position.set(cx * world.chunkSize, 0, cz * world.chunkSize);
        this.group.updateMatrix();
        this.group.matrixAutoUpdate = false;
        // Disable THREE.js frustum culling on the group — bounding sphere is often
        // wrong for large instanced chunks, causing entire chunks to vanish.
        // Visibility is managed manually via setVisible().
        this.group.frustumCulled = false;
        this.world.scene.add(this.group);
        
        this.instancedMeshes = new Map(); // id -> InstancedMesh
        this.dirty = false;
        this.destroyed = false;
        this.generating = false;
    }


    enableMaterialInstanceColors(material) {
        let anyEnabled = false;
        if (Array.isArray(material)) {
            for (const mat of material) {
                if (!mat) continue;
                if (mat.userData && mat.userData.tintable) {
                    anyEnabled = true;
                    if (!mat.vertexColors) {
                        mat.vertexColors = true;
                        mat.needsUpdate = true;
                    }
                }
            }
        } else if (material && material.userData && material.userData.tintable) {
            anyEnabled = true;
            if (!material.vertexColors) {
                material.vertexColors = true;
                material.needsUpdate = true;
            }
        }
        return anyEnabled;
    }

    disableMaterialInstanceColors(material) {
        // Obsolete
    }

    materialHasVertexColors(material) {
        if (Array.isArray(material)) {
            for (const mat of material) {
                if (mat?.vertexColors) return true;
            }
            return false;
        }
        return Boolean(material?.vertexColors);
    }

    cloneMaterial(material) {
        if (Array.isArray(material)) {
            return material.map((mat) => (mat?.clone ? mat.clone() : mat));
        }
        return material?.clone ? material.clone() : material;
    }

    resolveBiomeTintHex(biome) {
        const fallback = 0x91bd59;
        const raw = biome?.color;
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
            return Math.floor(raw);
        }
        if (typeof raw === 'string') {
            const text = raw.trim();
            if (text) {
                const parsed = text.toLowerCase().startsWith('0x')
                    ? Number(text)
                    : Number.parseInt(text, 16);
                if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
            }
        }
        return fallback;
    }

    getRenderOrder(id, material) {
        if (id === 'water') return RENDER_LAYERS.WATER;
        if (materialIsTransparent(material)) return RENDER_LAYERS.TRANSPARENT;
        return RENDER_LAYERS.OPAQUE;
    }

    addGeneratedBlock(x, y, z, id) {
        const key = this.world.getKey(x, y, z);
        if (this.world.changedBlocks.get(key) === null) return;

        const override = this.world.changedBlocks.get(key);
        const finalId = override ?? id;
        this.world.addBlock(x, y, z, finalId, this.key);
    }

    addGeneratedStructureBlock(x, y, z, id) {
        const key = this.world.getKey(x, y, z);
        if (this.world.changedBlocks.get(key) === null) return;

        const override = this.world.changedBlocks.get(key);
        const finalId = override ?? id;
        this.world.addBlock(x, y, z, finalId, this.key, false, { allowCorruption: true });
    }

    // ... existing terrain gen methods ...
    generateTerrainColumn(wx, wz) {
        const terrainHeight = this.world.getColumnHeight(wx, wz);
        const inForcedSpawnZone = this.world.shouldForceSpawnZone(wx, wz);
        const biome = this.world.getBiomeAt(wx, wz);
        const waterLevel = this.world.seaLevel + (biome.waterLevelOffset ?? 0);
        let surfaceId = terrainHeight <= waterLevel ? 'sand' : biome.surfaceBlock;
        const hasRoad = !inForcedSpawnZone && terrainHeight > waterLevel && this.world.isPathAt(wx, wz);
        const hasHighway = !inForcedSpawnZone && terrainHeight > waterLevel && this.world.isHighwayAt(wx, wz);
        if (hasHighway) {
            surfaceId = 'cobblestone';
        } else if (hasRoad) {
            surfaceId = 'path_block';
        }
        // Snow caps on very tall peaks
        if (!inForcedSpawnZone && terrainHeight > 58 && surfaceId !== 'path_block') {
            surfaceId = 'snow_block';
        }
        this.addGeneratedBlock(wx, terrainHeight, wz, surfaceId);

        const nx = this.world.getColumnHeight(wx + 1, wz);
        const px = this.world.getColumnHeight(wx - 1, wz);
        const nz = this.world.getColumnHeight(wx, wz + 1);
        const pz = this.world.getColumnHeight(wx, wz - 1);
        const minNeighbor = Math.min(nx, px, nz, pz);
        const exposedDepth = Math.max(0, terrainHeight - minNeighbor);

        // Top 3 layers always filled with biome filler (dirt/stone etc.)
        for (let d = 1; d <= 3; d++) {
            const y = terrainHeight - d;
            if (y < this.world.minTerrainY) break;
            this.addGeneratedBlock(wx, y, wz, biome.fillerBlock);
        }
        // Fill exposed cliff faces with stone so mountains look solid
        const cliffFill = Math.min(exposedDepth, 50);
        for (let d = 4; d <= cliffFill; d++) {
            const y = terrainHeight - d;
            if (y < this.world.minTerrainY) break;
            if (this.world.shouldCarveCave(wx, y, wz, terrainHeight)) continue;
            this.addGeneratedBlock(wx, y, wz, 'stone');
        }

        if (!inForcedSpawnZone) {
            for (let y = terrainHeight + 1; y <= waterLevel; y++) {
                this.addGeneratedBlock(wx, y, wz, 'water');
            }
        }

        if (this.world.shouldPlaceVirus(wx, wz, terrainHeight)) {
            this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'virus');
        } else if (this.world.shouldPlaceArlo(wx, wz, terrainHeight)) {
            this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'arlo');
        }

        if (!inForcedSpawnZone && terrainHeight > waterLevel) {
            const tntRoll = this.world.hash2D(wx + 777, wz - 313);
            if (tntRoll > 0.9989) {
                this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'tnt');
            }
            const nukeRoll = this.world.hash2D(wx - 1441, wz + 918);
            if (nukeRoll > 0.99972) {
                this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'nuke');
            }
        }

        const isHighAltitude = terrainHeight > 46;

        if (!inForcedSpawnZone && !isHighAltitude && this.world.shouldPlaceTree(wx, wz, terrainHeight, biome)) {
            this.placeTree(wx, terrainHeight + 1, wz, biome);
        }

        // --- DECO & GROUND LIFE ---
        if (!inForcedSpawnZone && !isHighAltitude && terrainHeight > waterLevel && this.world.blockMap.get(this.world.getKey(wx, terrainHeight, wz)) !== 'water') {
            const decoHash = this.world.hash2D(wx * 22, wz * 33);
            if (decoHash < 0.08) {
                const decoId = decoHash < 0.06 ? 'grass_tall' : (decoHash < 0.07 ? 'flower_rose' : 'flower_dandelion');
                this.addGeneratedBlock(wx, terrainHeight + 1, wz, decoId);
            } else {
                this.placeGroundLife(wx, terrainHeight, wz, biome);
            }
        }

        // --- CACTUS GENERATION (Desert only) ---
        if (!inForcedSpawnZone && biome.id === 'desert' && terrainHeight > waterLevel) {
            const cactusRoll = this.world.hash2D(wx - 211, wz + 419);
            if (cactusRoll > 0.985) {
                const cactusHeight = 2 + Math.floor(this.world.hash2D(wx + 13, wz - 17) * 3);
                for (let ch = 1; ch <= cactusHeight; ch++) {
                    this.addGeneratedBlock(wx, terrainHeight + ch, wz, 'cactus');
                }
            }
        }

        // --- DUNGEON GENERATION (Underground) ---
        if (terrainHeight > 20) {
            const dungeonRoll = this.world.hash3D(Math.floor(wx/16), 0, Math.floor(wz/16));
            if (dungeonRoll > 0.994 && (wx % 16 === 8) && (wz % 16 === 8)) {
                const dy = -15 - Math.floor(this.world.hash2D(wx, wz) * 40);
                const struct = STRUCTURES.dungeon_chamber;
                const blocks = struct.blueprints(wx, dy, wz);
                for (const b of blocks) this.addGeneratedStructureBlock(b.x, b.y, b.z, b.id);
                this.world.registerLandmark(wx, dy, 'Ancient Dungeon');
            }
        }
    }

    placeRandomStructure(x, y, z, biome) {
        const allKeys = Object.keys(STRUCTURES).filter((k) => !EXCLUDED_FROM_RANDOM_POOL.has(k));
        const virusRoll = this.world.hash2D(x + 811, z - 204);
        let keys = allKeys;
        if (!this.world.corruptionEnabled) {
            const allowVirusRuin = virusRoll > 0.996;
            keys = allKeys.filter((key) => {
                if (!CORRUPTION_STRUCTURE_KEYS.has(key)) return true;
                return allowVirusRuin && key !== 'restoration_shrine';
            });
            if (virusRoll < 0.94) {
                const civicOnly = CIVIC_STRUCTURE_POOL.filter((key) => keys.includes(key));
                if (civicOnly.length > 0) keys = civicOnly;
            }
        }
        if (keys.length === 0) return;

        const hash = this.world.hash2D(x - 99, z + 88);
        const structKey = keys[Math.floor(hash * keys.length)];
        const struct = STRUCTURES[structKey];
        if (!struct) return;

        if (Array.isArray(struct.biomes) && struct.biomes.length > 0) {
            if (!struct.biomes.includes('any') && !struct.biomes.includes(biome.id)) return;
        } else {
            // Backward compatibility for older structures.
            if (structKey === 'desert_pyramid' && biome.id !== 'desert') return;
            if (structKey === 'igloo' && biome.id !== 'highlands') return;
        }

        if (structKey === 'mega_rollercoaster' && this.world.hash2D(x + 311, z - 125) < 0.72) return;
        if (structKey === 'spinning_ride' && this.world.hash2D(x - 207, z + 519) < 0.5) return;

        const blocks = struct.blueprints(x, y, z);
        for (const b of blocks) {
            this.addGeneratedStructureBlock(b.x, b.y, b.z, b.id);
        }
        if (struct.name) {
            this.world.registerLandmark(x, z, struct.name);
        }
    }

    chooseTreeType(x, z, biome) {
        const hash = this.world.hash2D(x, z);
        if (this.world.isCorruptedAt(x, z)) return 'crystal';
        if (biome.id === 'desert') return 'palm';
        if (biome.id === 'forest') return hash > 0.6 ? 'birch' : (hash > 0.3 ? 'oak' : 'pine');
        if (biome.id === 'swamp') return 'willow';
        if (biome.id === 'plains' || biome.id === 'meadow') return hash > 0.8 ? 'cherry' : 'oak';
        if (biome.id === 'highlands') return hash > 0.6 ? 'redwood' : 'pine';
        if (biome.id === 'alpine' || biome.id === 'tundra') return 'pine';
        if (biome.id === 'badlands' || biome.id === 'canyon') return 'palm';
        return 'oak';
    }

    placeGroundLife(x, surfaceY, z, biome) {
        const choices = BIOME_GROUND_LIFE[biome.id];
        if (!choices || choices.length === 0) return;

        const supportId = this.world.blockMap.get(this.world.getKey(x, surfaceY, z));
        if (!supportId || supportId === 'water' || supportId === 'path_block' || supportId === 'cobblestone') return;

        const roll = this.world.hash2D((x * 53) + 17, (z * 61) - 29);
        if (roll > 0.045) return;

        const pick = Math.floor(this.world.hash2D(x - 919, z + 771) * choices.length);
        this.addGeneratedBlock(x, surfaceY + 1, z, choices[pick]);
    }

    placeLeafBlob(x, y, z, radius, leafId, yRadius = 1) {
        const yy = Math.max(1, yRadius);
        for (let lx = -radius; lx <= radius; lx++) {
            for (let lz = -radius; lz <= radius; lz++) {
                for (let ly = -yy; ly <= yy; ly++) {
                    const dist = (lx * lx) + (lz * lz) + ((ly * ly) * 1.35);
                    if (dist > (radius * radius) + 0.6) continue;
                    this.addGeneratedBlock(x + lx, y + ly, z + lz, leafId);
                }
            }
        }
    }

    placeConeCanopy(x, startY, z, baseRadius, leafId) {
        for (let layer = 0; layer <= 4; layer++) {
            const radius = Math.max(1, baseRadius - Math.floor(layer * 0.85));
            const yRadius = layer >= 3 ? 0 : 1;
            this.placeLeafBlob(x, startY + layer, z, radius, leafId, yRadius);
        }
        this.addGeneratedBlock(x, startY + 5, z, leafId);
    }

    placePalmCanopy(x, y, z, radius, leafId) {
        this.addGeneratedBlock(x, y, z, leafId);
        const directions = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];
        for (const [dx, dz] of directions) {
            const length = Math.max(2, radius + (Math.abs(dx) + Math.abs(dz) > 1 ? -1 : 0));
            for (let i = 1; i <= length; i++) {
                const drop = i >= length ? 1 : 0;
                this.addGeneratedBlock(x + (dx * i), y - drop, z + (dz * i), leafId);
            }
        }
    }

    placeWillowCanopy(x, y, z, radius, leafId) {
        this.placeLeafBlob(x, y, z, radius, leafId, 1);
        for (let lx = -radius; lx <= radius; lx++) {
            for (let lz = -radius; lz <= radius; lz++) {
                if (Math.max(Math.abs(lx), Math.abs(lz)) < radius) continue;
                const sway = this.world.hash2D(x + (lx * 17), z + (lz * 23));
                if (sway < 0.44) continue;
                const length = 2 + Math.floor(sway * 3);
                for (let drop = 1; drop <= length; drop++) {
                    this.addGeneratedBlock(x + lx, y - drop, z + lz, leafId);
                }
            }
        }
    }

    placeTree(x, y, z, biome) {
        const type = this.chooseTreeType(x, z, biome);
        const config = TREE_PROFILES[type] ?? TREE_PROFILES.oak;
        const trunkHeight = config.height + Math.floor(this.world.hash2D(x + 7, z - 19) * 2);

        for (let i = 0; i < trunkHeight; i++) {
            this.addGeneratedBlock(x, y + i, z, config.trunk);
        }

        const topY = y + trunkHeight - 1;
        if (config.style === 'cone') {
            this.placeConeCanopy(x, topY - 2, z, config.radius, config.leaves);
            return;
        }
        if (config.style === 'palm') {
            this.placePalmCanopy(x, topY, z, config.radius, config.leaves);
            return;
        }
        if (config.style === 'willow') {
            this.placeWillowCanopy(x, topY - 1, z, config.radius, config.leaves);
            return;
        }
        if (config.style === 'spire') {
            for (let i = 1; i <= 2; i++) this.addGeneratedBlock(x, topY + i, z, config.trunk);
            this.placeConeCanopy(x, topY - 1, z, config.radius + 1, config.leaves);
            return;
        }
        if (config.style === 'crystal') {
            this.placeLeafBlob(x, topY - 1, z, config.radius, config.leaves, 1);
            this.addGeneratedBlock(x, topY + 1, z, config.leaves);
            this.addGeneratedBlock(x + 1, topY, z, config.leaves);
            this.addGeneratedBlock(x - 1, topY, z, config.leaves);
            this.addGeneratedBlock(x, topY, z + 1, config.leaves);
            this.addGeneratedBlock(x, topY, z - 1, config.leaves);
            return;
        }

        this.placeLeafBlob(x, topY - 1, z, config.radius, config.leaves, 1);
        this.placeLeafBlob(x, topY + 1, z, Math.max(1, config.radius - 1), config.leaves, 0);
        this.addGeneratedBlock(x, topY + 2, z, config.leaves);
    }

    applyPlayerOverrides() {
        for (const [key, id] of this.world.changedBlocks.entries()) {
            const [x, y, z] = this.world.keyToCoords(key);
            if (this.world.getChunkCoord(x) !== this.cx || this.world.getChunkCoord(z) !== this.cz) continue;

            if (id === null) {
                this.blockKeys.delete(key);
                continue;
            }
            this.blockKeys.add(key);
        }
        this.dirty = true;
    }

    resyncBlockKeysFromWorld() {
        if (this.destroyed || this.blockKeys.size > 0) return 0;
        const startX = this.cx * this.world.chunkSize;
        const startZ = this.cz * this.world.chunkSize;
        const minY = this.world.deepMinY;
        const maxY = this.world.maxTerrainY + 12;
        let recovered = 0;

        for (let lx = 0; lx < this.world.chunkSize; lx++) {
            for (let lz = 0; lz < this.world.chunkSize; lz++) {
                const wx = startX + lx;
                const wz = startZ + lz;
                for (let y = minY; y <= maxY; y++) {
                    const key = this.world.getKey(wx, y, wz);
                    if (!this.world.blockMap.has(key)) continue;
                    this.blockKeys.add(key);
                    this.world.blockOwners.set(key, this.key);
                    recovered++;
                }
            }
        }

        if (recovered > 0) this.dirty = true;
        return recovered;
    }

    update() {
        if (!this.dirty || this.destroyed) return;
        this.rebuildMeshes();
        this.dirty = false;
    }

    rebuildMeshes() {
        if (this.destroyed) return;
        
        try {
            this.resyncBlockKeysFromWorld();

            // 1. Clear old instances
        for (const mesh of this.instancedMeshes.values()) {
            this.group.remove(mesh);
            if (mesh.userData?.ownedMaterial) {
                if (Array.isArray(mesh.material)) {
                    for (const mat of mesh.material) {
                        if (typeof mat?.dispose === 'function') mat.dispose();
                    }
                } else if (typeof mesh.material?.dispose === 'function') {
                    mesh.material.dispose();
                }
            }
            if (typeof mesh.dispose === 'function') mesh.dispose();
        }
        this.instancedMeshes.clear();

        // 2. Sort current blocks by type for instancing
        const byType = new Map();
        for (const key of this.blockKeys) {
            const id = this.world.blockMap.get(key);
            if (!id) continue;
            if (!byType.has(id)) byType.set(id, []);
            byType.get(id).push(key);
        }

        // 3. Create InstancedMesh for each type found
        const temp = new THREE.Object3D();
        const worldX = this.cx * this.world.chunkSize;
        const worldZ = this.cz * this.world.chunkSize;
        
        // Stability Fix: Determine if chunk is 'Near' for occlusion bypass and culling
        const camPos = this.world.game.camera.instance.position;
        const isNear = Math.abs(this.cx - this.world.getChunkCoord(camPos.x)) <= 2 &&
                       Math.abs(this.cz - this.world.getChunkCoord(camPos.z)) <= 2;

        for (const [id, keys] of byType.entries()) {
            const count = keys.length;
            const blockData = this.world.getBlockData(id);
            const baseMaterial = this.world.blockRegistry.getMaterial(id);
            const isWater = id === 'water';
            const isDeco = blockData?.deco;
            const tintable = this.enableMaterialInstanceColors(baseMaterial);
            const material = baseMaterial;
            const tempColor = tintable ? new THREE.Color() : null;
            
            const geometry = isWater
                ? this.world.sharedChunkGeometries.water
                : (isDeco ? this.world.sharedChunkGeometries.deco : this.world.sharedChunkGeometries.solid);
            
            const im = new THREE.InstancedMesh(geometry, material, count);
            im.frustumCulled = false; // Never cull chunks; handled by World visibility
            im.matrixAutoUpdate = false; 
            im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            im.renderOrder = this.getRenderOrder(id, material);
            
            // Avoid black slab shadows from cutout/transparent materials (leaves, flowers, etc.).
            const transparentMaterial = materialIsTransparent(material);
            if (!isWater && !isDeco && !transparentMaterial) im.castShadow = true;
            else im.castShadow = false;
            im.receiveShadow = true;

            let renderCount = 0;
            for (let i = 0; i < count; i++) {
                const [ax, ay, az] = this.world.keyToCoords(keys[i]);
                
                // Water surface pass: 
                // Only render water if there's air (or non-water) above it.
                if (isWater) {
                    const above = this.world.blockMap.get(this.world.getKey(ax, ay + 1, az));
                    if (above === 'water') continue; // Submerged - skip rendering
                }

                // Occlusion check: skip rendering if fully surrounded by solid blocks
                // Stability Fix: Bypass occlusion for nearby chunks to prevent 'void lines' at boundaries
                if (!isNear) {
                    const nx = this.world.blockMap.get(this.world.getKey(ax + 1, ay, az));
                    const px = this.world.blockMap.get(this.world.getKey(ax - 1, ay, az));
                    const ny = this.world.blockMap.get(this.world.getKey(ax, ay + 1, az));
                    const py = this.world.blockMap.get(this.world.getKey(ax, ay - 1, az));
                    const nz = this.world.blockMap.get(this.world.getKey(ax, ay, az + 1));
                    const pz = this.world.blockMap.get(this.world.getKey(ax, ay, az - 1));

                    if (nx && px && ny && py && nz && pz) {
                        if (this.world.isBlockSolid(nx) && this.world.isBlockSolid(px) && 
                            this.world.isBlockSolid(ny) && this.world.isBlockSolid(py) && 
                            this.world.isBlockSolid(nz) && this.world.isBlockSolid(pz)) {
                            continue; 
                        }
                    }
                }

                const lx = ax - worldX;
                const ly = ay;
                const lz = az - worldZ;
                temp.position.set(lx, ly, lz);
                
                if (isWater) {
                    // Lift the water plane to the very top of the voxel cell.
                    // 0.49 prevents z-fighting with adjacent solid blocks at exactly the same height.
                    temp.position.y += 0.49;
                    temp.scale.set(1, 1, 1);
                } else {
                    temp.scale.set(1, 1, 1);
                }
                
                temp.updateMatrix();
                im.setMatrixAt(renderCount, temp.matrix);
                
                if (tintable) {
                    const biome = this.world.getBiomeAt(ax, az);
                    const tintHex = this.resolveBiomeTintHex(biome);
                    im.setColorAt(renderCount, tempColor.setHex(tintHex));
                }
                
                renderCount++;
            }
            
            if (renderCount === 0) {
                continue;
            }

            im.count = renderCount;
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor) im.instanceColor.needsUpdate = true;
            this.instancedMeshes.set(id, im);
            this.group.add(im);
        }
        
        // 4. Update group bounding for raycasting and final visibility pass
        for (const mesh of this.instancedMeshes.values()) {
            mesh.computeBoundingSphere();
            // Force all chunk meshes to stay visible to prevent camera-math gaps
            mesh.frustumCulled = false;
        }
        } catch (e) {
            console.error('[ArloCraft] rebuildMeshes failed:', this.key, e);
        }
    }

    async generate() {
        if (this.generating || this.destroyed) return;
        this.generating = true;
        try {
            if (this.world.chunkGenerator && this.world.chunkGenerator.available) {
                try {
                    const results = await this.world.chunkGenerator.generateChunk(this.cx, this.cz);
                    if (this.destroyed) return;
                    if (results && results.data) {
                        const { data, palette } = results;
                        for (let i = 0; i < data.length; i += 4) {
                            const x = data[i];
                            const y = data[i+1];
                            const z = data[i+2];
                            const paletteIndex = data[i+3];
                            const id = palette[paletteIndex];
                            
                            const key = this.world.getKey(x, y, z);
                            if (this.world.changedBlocks.get(key) === null) continue;
                            const override = this.world.changedBlocks.get(key);
                            const finalId = override ?? id;
                            this.world.addBlock(x, y, z, finalId, this.key);
                        }
                        
                        const startX = this.cx * this.world.chunkSize;
                        const startZ = this.cz * this.world.chunkSize;
                        const centerX = startX + Math.floor(this.world.chunkSize * 0.5);
                        const centerZ = startZ + Math.floor(this.world.chunkSize * 0.5);

                        this.registerRoadLandmark(startX, startZ);
                        if (this.world.shouldPlaceStructureChunk(this.cx, this.cz)) {
                            const sy = this.world.getColumnHeight(centerX, centerZ) + 1;
                            const biome = this.world.getBiomeAt(centerX, centerZ);
                            this.placeRandomStructure(centerX, sy, centerZ, biome);
                        }
                        if (this.world.shouldPlaceVillageChunk(this.cx, this.cz)) {
                            const vx = centerX;
                            const vz = centerZ;
                            const vy = this.world.getColumnHeight(vx, vz) + 1;
                            this.placeVillageCluster(vx, vy, vz);
                        }
                        this.applyPlayerOverrides();
                        return;
                    }
                } catch (error) {
                    console.warn('[ArloCraft] Chunk Worker failed, falling back to sync', error);
                }
            }

            this.generateSync();
        } finally {
            this.generating = false;
        }
    }

    generateSync() {
        if (this.destroyed) return;
        const startX = this.cx * this.world.chunkSize;
        const startZ = this.cz * this.world.chunkSize;
        const centerX = startX + Math.floor(this.world.chunkSize * 0.5);
        const centerZ = startZ + Math.floor(this.world.chunkSize * 0.5);
        for (let lx = 0; lx < this.world.chunkSize; lx++) {
            for (let lz = 0; lz < this.world.chunkSize; lz++) {
                this.generateTerrainColumn(startX + lx, startZ + lz);
            }
        }
        this.registerRoadLandmark(startX, startZ);
        if (this.world.shouldPlaceStructureChunk(this.cx, this.cz)) {
            const sy = this.world.getColumnHeight(centerX, centerZ) + 1;
            const biome = this.world.getBiomeAt(centerX, centerZ);
            this.placeRandomStructure(centerX, sy, centerZ, biome);
        }
        if (this.world.shouldPlaceVillageChunk(this.cx, this.cz)) {
            const vx = centerX;
            const vz = centerZ;
            const vy = this.world.getColumnHeight(vx, vz) + 1;
            this.placeVillageCluster(vx, vy, vz);
        }
        this.applyPlayerOverrides();
        this.dirty = true;
    }

    registerRoadLandmark(startX, startZ) {
        const midX = startX + Math.floor(this.world.chunkSize * 0.5);
        const midZ = startZ + Math.floor(this.world.chunkSize * 0.5);
        if (!this.world.isHighwayAt(midX, midZ)) return;
        if (this.world.hash2D(this.cx + 519, this.cz - 733) < 0.78) return;
        this.world.registerLandmark(midX, midZ, 'Abandoned Highway');
    }

    placeVillageCluster(centerX, centerY, centerZ) {
        const settlementName = this.world.getSettlementNameAt(centerX, centerZ);
        this.world.registerLandmark(centerX, centerZ, settlementName, {
            baseName: settlementName,
            category: 'settlement',
            displayName: settlementName
        });

        const hutOffsets = [
            [-6, -4],
            [6, -3],
            [-5, 6],
            [5, 5]
        ];

        const placed = [];
        for (let i = 0; i < hutOffsets.length; i++) {
            const [dx, dz] = hutOffsets[i];
            const hx = centerX + dx;
            const hz = centerZ + dz;
            const hy = this.world.getColumnHeight(hx, hz) + 1;
            
            // Randomly choose between a hut and a manor for variety
            const isManor = this.world.hash2D(hx + 77, hz - 33) > 0.7;
            const houseType = isManor ? STRUCTURES.village_manor : STRUCTURES.village_hut;
            
            const blocks = houseType.blueprints(hx, hy, hz);
            for (const block of blocks) this.addGeneratedBlock(block.x, block.y, block.z, block.id);
            this.placeLampPost(hx + 2, hy, hz + 2);
            if (this.world.game?.entities && this.world.game.entities.entities.length < this.world.game.entities.maxEntities) {
                this.world.game.entities.spawn('villager_arlo', hx + 0.5, hy + 1.2, hz + 0.5);
            }
            placed.push({ x: hx, z: hz, y: hy });
        }

        for (const hut of placed) {
            this.placePathBetween(centerX, centerZ, hut.x, hut.z);
        }
        this.placeLampPost(centerX, centerY, centerZ);
        if (this.world.game?.entities && this.world.game.entities.entities.length < this.world.game.entities.maxEntities) {
            this.world.game.entities.spawn('villager_arlo', centerX + 0.5, centerY + 1.2, centerZ + 0.5);
        }
    }

    placePathBetween(x0, z0, x1, z1) {
        let x = x0;
        let z = z0;
        const stepX = x1 >= x0 ? 1 : -1;
        const stepZ = z1 >= z0 ? 1 : -1;

        while (x !== x1 || z !== z1) {
            const y = this.world.getColumnHeight(x, z);
            this.addGeneratedBlock(x, y, z, 'path_block');
            if (this.world.hash2D(x + 91, z - 44) > 0.83) {
                this.addGeneratedBlock(x, y - 1, z, 'cobblestone');
            }

            if (Math.abs(x1 - x) > Math.abs(z1 - z)) x += stepX;
            else z += stepZ;
        }
    }

    placeLampPost(x, y, z) {
        const baseY = this.world.getColumnHeight(x, z) + 1;
        for (let i = 0; i < 3; i++) {
            this.addGeneratedBlock(x, baseY + i, z, 'wood_planks');
        }
        this.addGeneratedBlock(x, baseY + 3, z, 'lantern');
        this.addGeneratedBlock(x + 1, baseY + 2, z, 'lantern');
        this.addGeneratedBlock(x - 1, baseY + 2, z, 'lantern');
    }

    setVisible(visible) {
        if (this.visible === visible) return;
        this.visible = visible;
        if (this.group) this.group.visible = visible;
    }

    destroy() {
        this.destroyed = true;
        for (const mesh of this.instancedMeshes.values()) {
            this.group.remove(mesh);
            if (mesh.userData?.ownedMaterial) {
                if (Array.isArray(mesh.material)) {
                    for (const mat of mesh.material) {
                        if (typeof mat?.dispose === 'function') mat.dispose();
                    }
                } else if (typeof mesh.material?.dispose === 'function') {
                    mesh.material.dispose();
                }
            }
            if (typeof mesh.dispose === 'function') mesh.dispose();
        }
        this.instancedMeshes.clear();
        if (this.group?.parent) this.group.parent.remove(this.group);
    }
}
