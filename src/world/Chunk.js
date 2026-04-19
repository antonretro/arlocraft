import * as THREE from 'three';
import { STRUCTURES } from './structures/StructureRegistry.js';
import { rebuildChunkInstancedMeshes } from './mesh/ChunkMeshBuilder.js';

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
    plains: ['short_grass', 'short_grass', 'short_grass', 'short_grass', 'short_grass', 'short_grass', 'short_grass', 'tall_grass_bottom', 'tall_grass_bottom', 'tall_grass_bottom', 'dandelion', 'poppy', 'red_tulip'],
    forest: ['short_grass', 'short_grass', 'short_grass', 'short_grass', 'short_grass', 'tall_grass_bottom', 'tall_grass_bottom', 'fern', 'fern', 'fern', 'mushroom_brown', 'mushroom_red', 'blueberry', 'strawberry', 'poppy'],
    meadow: ['short_grass', 'short_grass', 'short_grass', 'tall_grass_bottom', 'tall_grass_bottom', 'tall_grass_bottom', 'tall_grass_bottom', 'dandelion', 'poppy', 'orange_tulip', 'red_tulip', 'pink_tulip', 'white_tulip', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'allium', 'blueberry', 'lilac', 'peony', 'rose_bush'],
    swamp: ['fern', 'fern', 'fern', 'short_grass', 'short_grass', 'tall_grass_bottom', 'tall_grass_bottom', 'mushroom_brown', 'mushroom_red', 'blueberry'],
    desert: ['tomato'],
    badlands: ['carrot'],
    canyon: ['carrot'],
    highlands: ['short_grass', 'short_grass', 'short_grass', 'short_grass', 'tall_grass_bottom', 'tall_grass_bottom', 'potato'],
    alpine: ['potato'],
    tundra: ['potato']
};

const TREE_PROFILES = {
    oak:      { trunk: 'oak_log',       leaves: 'oak_leaves',       height: 5,  radius: 2, style: 'round' },
    birch:    { trunk: 'birch_log',     leaves: 'birch_leaves',     height: 7,  radius: 2, style: 'round' },
    pine:     { trunk: 'spruce_log',    leaves: 'spruce_leaves',    height: 8,  radius: 2, style: 'cone' },
    palm:     { trunk: 'jungle_log',    leaves: 'jungle_leaves',    height: 7,  radius: 3, style: 'palm' },
    jungle:   { trunk: 'jungle_log',    leaves: 'jungle_leaves',    height: 10, radius: 3, style: 'round' },
    willow:   { trunk: 'mangrove_log',  leaves: 'mangrove_leaves',  height: 5,  radius: 3, style: 'willow' },
    acacia:   { trunk: 'acacia_log',    leaves: 'acacia_leaves',    height: 5,  radius: 3, style: 'acacia' },
    dark_oak: { trunk: 'dark_oak_log',  leaves: 'dark_oak_leaves',  height: 7,  radius: 3, style: 'dark_oak' },
    cherry:   { trunk: 'cherry_log',    leaves: 'cherry_leaves',    height: 5,  radius: 3, style: 'round' },
    redwood:  { trunk: 'redwood_log',   leaves: 'redwood_leaves',   height: 14, radius: 3, style: 'spire' },
    crystal:  { trunk: 'crystal_log',   leaves: 'crystal_leaves',   height: 7,  radius: 2, style: 'crystal' }
};

export class Chunk {
    constructor(world, cx, cy, cz) {
        this.world = world;
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        this.key = world.getChunkKey(cx, cy, cz);
        this.blockKeys = new Set();
        this.visible = true;
        this.group = new THREE.Group();
        this.group.position.set(cx * world.chunkSize, cy * world.chunkSize, cz * world.chunkSize);
        this.group.updateMatrix();
        this.group.matrixAutoUpdate = false;
        // Disabled active culling on the group level for small cubic stability; children handle their own.
        this.group.frustumCulled = false;
        this.world.scene.add(this.group);
        
        this.instancedMeshes = new Map(); // id -> InstancedMesh
        this.dirty = false;
        this.destroyed = false;
        this.generating = false;
        this.touchedGenerationChunks = new Map();
    }

    beginGenerationPass() {
        this.touchedGenerationChunks.clear();
        this.touchedGenerationChunks.set(this.key, { key: this.key, cx: this.cx, cz: this.cz });
    }

    getChunkTargetForWorldPos(x, y, z) {
        const cx = this.world.getChunkCoord(x);
        const cy = this.world.getChunkCoord(y);
        const cz = this.world.getChunkCoord(z);
        return { cx, cy, cz, key: this.world.getChunkKey(cx, cy, cz) };
    }

    noteTouchedGenerationChunk(x, y, z) {
        const target = this.getChunkTargetForWorldPos(x, y, z);
        this.touchedGenerationChunks.set(target.key, target);

        const loaded = this.world.chunkManager.getChunk(target.cx, target.cy, target.cz);
        if (loaded && !loaded.destroyed) {
            loaded.dirty = true;
            this.world.chunkManager.priorityDirtyChunkKeys.add(target.key);
        } else if (Math.abs(target.cx - this.cx) <= 1 && Math.abs(target.cy - this.cy) <= 1 && Math.abs(target.cz - this.cz) <= 1) {
            this.world.chunkManager.queueChunkLoad(target.cx, target.cy, target.cz);
        }

        return target;
    }

    finalizeGenerationPass() {
        for (const target of this.touchedGenerationChunks.values()) {
            const chunk = this.world.chunkManager.getChunk(target.cx, target.cy, target.cz);
            if (!chunk || chunk.destroyed) continue;
            chunk.dirty = true;
            this.world.chunkManager.priorityDirtyChunkKeys.add(target.key);
        }
    }

    applyGeneratedBlock(x, y, z, id, options = {}) {
        const key = this.world.getKey(x, y, z);
        if (this.world.state.changedBlocks.get(key) === null) return;

        const override = this.world.state.changedBlocks.get(key);
        const finalId = override ?? id;
        const owner = this.noteTouchedGenerationChunk(x, y, z);
        this.world.addBlock(x, y, z, finalId, owner.key, false, options);
    }

    addGeneratedBlock(x, y, z, id) {
        this.applyGeneratedBlock(x, y, z, id);
    }

    addGeneratedStructureBlock(x, y, z, id) {
        this.applyGeneratedBlock(x, y, z, id, { allowCorruption: true });
    }

    addGeneratedPlant(x, y, z, id) {
        const blockData = this.world.getBlockData(id);
        const pairId = blockData?.pairId;
        const pairOffsetY = Number(blockData?.pairOffsetY);
        if (pairId && Number.isFinite(pairOffsetY) && pairOffsetY !== 0) {
            const pairKey = this.world.getKey(x, y + pairOffsetY, z);
            const pairExistingId = this.world.state.blockMap.get(pairKey);
            // Height fix: Allow overwriting non-solid blocks (like air or other deco) 
            // to ensure tall grass top always spawns correctly.
            if (pairExistingId && this.world.isBlockSolid(pairExistingId)) return false;
            this.addGeneratedBlock(x, y, z, id);
            this.addGeneratedBlock(x, y + pairOffsetY, z, pairId);
            return true;
        }

        this.addGeneratedBlock(x, y, z, id);
        return true;
    }

    selectUndergroundBlock(wx, y, wz, biome) {
        const minY = this.world.minTerrainY; // -64

        // Bedrock: bottom 3 layers with some randomness
        if (y <= minY + 2) return 'bedrock';

        const h1 = this.world.hash3D(wx,       y * 7 + 3,  wz);
        const h2 = this.world.hash3D(wx + 97,  y * 7 + 11, wz - 63);
        const h3 = this.world.hash3D(wx - 31,  y * 7 + 19, wz + 71);

        const isDeep = y < -32;

        // ── Ores ─────────────────────────────────────────────────
        // Diamond  (y < -45, deepslate only)
        if (y < -45 && h1 < 0.0022) return 'deepslate_diamond_ore';
        // Redstone (y < -35)
        if (y < -35 && h1 < 0.0045) return isDeep ? 'deepslate_redstone_ore' : 'redstone_ore';
        // Gold     (y -50..−10)
        if (y > -50 && y < -10 && h1 < 0.006) return isDeep ? 'deepslate_gold_ore' : 'gold';
        // Lapis    (y -40..+5)
        if (y > -40 && y < 5 && h2 < 0.004) return isDeep ? 'deepslate_lapis_ore' : 'lapis_ore';
        // Iron     (y -30..+25)
        if (y > -30 && y < 25 && h1 < 0.014) return isDeep ? 'deepslate_iron_ore' : 'iron';
        // Copper   (y -16..+48)
        if (y > -16 && y < 48 && h3 < 0.009) return isDeep ? 'deepslate_copper_ore' : 'copper';
        // Coal     (y > -15)
        if (y > -15 && h2 < 0.024) return 'coal';
        // Emerald  (highlands only, y > -20)
        if (biome?.id === 'highlands' && y > -20 && h3 < 0.001) return 'emerald_ore';

        // ── Deep layer: deepslate variants ───────────────────────
        if (isDeep) {
            if (h2 < 0.07) return 'cobbled_deepslate';
            if (h3 < 0.04) return 'tuff';
            if (h3 < 0.06) return 'calcite';
            return 'deepslate';
        }

        // ── Stone variants ────────────────────────────────────────
        if (h2 < 0.07) return 'andesite';
        if (h2 < 0.13) return 'diorite';
        if (h2 < 0.19) return 'granite';
        if (h3 < 0.05 && y < 15) return 'gravel';
        if (h3 < 0.025 && y < 5) return 'tuff';
        // Clay pockets near sea level
        if (y > -4 && y < 3 && h1 < 0.06) return 'clay';

        return 'stone';
    }

    // ... existing terrain gen methods ...
    generateTerrainColumn(wx, wz) {
        const cs = this.world.chunkSize;
        const startY = this.cy * cs;
        const endY = (this.cy + 1) * cs - 1;
        
        const terrainHeight = this.world.getColumnHeight(wx, wz);
        const inForcedSpawnZone = this.world.shouldForceSpawnZone(wx, wz)
            || this.world.shouldPlaceStructureChunk(this.cx, this.cz)
            || this.world.shouldPlaceVillageChunk(this.cx, this.cz);
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
        if (terrainHeight >= startY && terrainHeight <= endY) {
            this.addGeneratedBlock(wx, terrainHeight, wz, surfaceId);
        }

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
        // Fill all the way down to minTerrainY so the world isn't hollow
        const totalDepth = terrainHeight - this.world.minTerrainY;
        for (let d = 4; d <= totalDepth; d++) {
            const y = terrainHeight - d;
            if (y < this.world.minTerrainY) break;
            if (this.world.shouldCarveCave(wx, y, wz, terrainHeight)) continue;
            this.addGeneratedBlock(wx, y, wz, this.selectUndergroundBlock(wx, y, wz, biome));
        }

        if (!inForcedSpawnZone) {
            for (let y = terrainHeight + 1; y <= waterLevel; y++) {
                this.addGeneratedBlock(wx, y, wz, 'water');
            }

            // --- UNDERWATER DECO: Kelp & Coral ---
            if (terrainHeight < waterLevel && (surfaceId === 'sand' || surfaceId === 'gravel')) {
                const uwHash = this.world.hash2D(wx + 31, wz - 57);
                if (uwHash < 0.08) {
                    // Kelp (stacks 1-3 high)
                    const kelpHeight = 1 + Math.floor(this.world.hash2D(wx + 11, wz + 89) * 3);
                    for (let k = 1; k <= kelpHeight && terrainHeight + k < waterLevel; k++) {
                        this.addGeneratedBlock(wx, terrainHeight + k, wz, 'kelp');
                    }
                } else if (uwHash < 0.11) {
                    this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'tube_coral_block');
                } else if (uwHash < 0.135) {
                    this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'brain_coral_block');
                } else if (uwHash < 0.155) {
                    this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'bubble_coral_block');
                } else if (uwHash < 0.17) {
                    this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'horn_coral_block');
                } else if (uwHash < 0.185) {
                    this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'sea_pickle');
                }
            }
        }

        if (this.world.shouldPlaceVirus(wx, wz, terrainHeight)) {
            this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'virus');
        } else if (this.world.shouldPlaceAnton(wx, wz, terrainHeight)) {
            this.addGeneratedBlock(wx, terrainHeight + 1, wz, 'anton');
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
        if (!inForcedSpawnZone && !isHighAltitude && terrainHeight > waterLevel && this.world.state.blockMap.get(this.world.getKey(wx, terrainHeight, wz)) !== 'water') {
            const decoHash = this.world.hash2D(wx * 22, wz * 33);
            if (decoHash < 0.72) {
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

    isLandSuitable(x, z, minDryRadius = 4) {
        for (let dx = -minDryRadius; dx <= minDryRadius; dx += 2) {
            for (let dz = -minDryRadius; dz <= minDryRadius; dz += 2) {
                const h = this.world.getColumnHeight(x + dx, z + dz);
                const biome = this.world.getBiomeAt(x + dx, z + dz);
                const wl = this.world.seaLevel + (biome.waterLevelOffset ?? 0);
                if (h <= wl) return false;
            }
        }
        return true;
    }

    placeUnderwaterStructure(centerX, centerZ) {
        const roll = this.world.hash2D(this.cx * 7 + 401, this.cz * 11 - 293);
        if (roll > 0.035) return; // ~3.5% of underwater chunks get a structure

        const h = this.world.getColumnHeight(centerX, centerZ);
        const biome = this.world.getBiomeAt(centerX, centerZ);
        const wl = this.world.seaLevel + (biome.waterLevelOffset ?? 0);
        if (h >= wl - 2) return; // must be properly submerged

        const pool = ['ocean_ruins', 'sunken_ship'];
        const pick = pool[Math.floor(this.world.hash2D(this.cx - 77, this.cz + 33) * pool.length)];
        const struct = STRUCTURES[pick];
        if (!struct) return;

        const blocks = struct.blueprints(centerX, h, centerZ);
        for (const b of blocks) this.addGeneratedStructureBlock(b.x, b.y, b.z, b.id);
        if (struct.name) this.world.registerLandmark(centerX, centerZ, struct.name);
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
        
        // ─── VOLUME CLEARING PASS ───
        const sw = struct.width || 7;
        const sh = (struct.height || 6) + 1;
        const sd = struct.depth || 7;

        for (let dx = 0; dx < sw; dx++) {
            for (let dz = 0; dz < sd; dz++) {
                for (let dy = 0; dy < sh; dy++) {
                    const bx = x + dx;
                    const by = y + dy;
                    const bz = z + dz;
                    // Pre-clear with air (overwritten by blueprint blocks later)
                    this.addGeneratedStructureBlock(bx, by, bz, 'air');
                }
            }
        }
        
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
        if (biome.id === 'desert')    return hash > 0.6 ? 'palm' : 'acacia';
        if (biome.id === 'badlands' || biome.id === 'canyon') return hash > 0.5 ? 'acacia' : 'palm';
        if (biome.id === 'forest')    return hash > 0.65 ? 'birch' : (hash > 0.35 ? 'oak' : (hash > 0.15 ? 'pine' : 'dark_oak'));
        if (biome.id === 'swamp')     return hash > 0.6 ? 'willow' : 'dark_oak';
        if (biome.id === 'plains')    return hash > 0.8 ? 'cherry' : (hash > 0.4 ? 'oak' : 'birch');
        if (biome.id === 'meadow')    return hash > 0.75 ? 'cherry' : (hash > 0.5 ? 'birch' : 'oak');
        if (biome.id === 'highlands') return hash > 0.65 ? 'redwood' : (hash > 0.3 ? 'pine' : 'dark_oak');
        if (biome.id === 'alpine' || biome.id === 'tundra') return hash > 0.5 ? 'pine' : 'spruce';
        if (biome.id === 'jungle')    return hash > 0.5 ? 'jungle' : 'palm';
        return 'oak';
    }

    placeGroundLife(x, surfaceY, z, biome) {
        const choices = BIOME_GROUND_LIFE[biome.id];
        if (!choices || choices.length === 0) return;

        const supportId = this.world.state.blockMap.get(this.world.getKey(x, surfaceY, z));
        if (!supportId || supportId === 'water' || supportId === 'path_block' || supportId === 'cobblestone') return;

        const roll = this.world.hash2D((x * 53) + 17, (z * 61) - 29);
        if (roll > 0.50) return;

        const pick = Math.floor(this.world.hash2D(x - 919, z + 771) * choices.length);
        const plantId = choices[pick];
        this.addGeneratedPlant(x, surfaceY + 1, z, plantId);
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
        if (config.style === 'acacia') {
            // Acacia: short trunk, flat wide canopy offset to one side
            const offX = this.world.hash2D(x + 3, z + 7) > 0.5 ? 1 : -1;
            const offZ = this.world.hash2D(x - 5, z + 2) > 0.5 ? 1 : -1;
            this.placeLeafBlob(x + offX, topY, z + offZ, config.radius, config.leaves, 0);
            this.placeLeafBlob(x + offX * 2, topY - 1, z + offZ * 2, config.radius - 1, config.leaves, 0);
            this.addGeneratedBlock(x + offX, topY + 1, z + offZ, config.leaves);
            return;
        }
        if (config.style === 'dark_oak') {
            // Dark oak: thick 2x2 trunk, large dense canopy
            this.addGeneratedBlock(x + 1, y, z, config.trunk);
            this.addGeneratedBlock(x, y, z + 1, config.trunk);
            this.addGeneratedBlock(x + 1, y, z + 1, config.trunk);
            for (let i = 1; i < trunkHeight; i++) {
                this.addGeneratedBlock(x + 1, y + i, z, config.trunk);
                this.addGeneratedBlock(x, y + i, z + 1, config.trunk);
                this.addGeneratedBlock(x + 1, y + i, z + 1, config.trunk);
            }
            this.placeLeafBlob(x, topY, z, config.radius, config.leaves, 2);
            this.placeLeafBlob(x, topY + 2, z, config.radius - 1, config.leaves, 1);
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
        for (const [key, id] of this.world.state.changedBlocks.entries()) {
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
        const cs = this.world.chunkSize;
        const minY = this.cy * cs;
        const maxY = (this.cy + 1) * cs - 1;
        let recovered = 0;

        for (let lx = 0; lx < cs; lx++) {
            for (let lz = 0; lz < cs; lz++) {
                const wx = startX + lx;
                const wz = startZ + lz;
                for (let y = minY; y <= maxY; y++) {
                    const key = this.world.getKey(wx, y, wz);
                    if (!this.world.state.blockMap.has(key)) continue;
                    this.blockKeys.add(key);
                    this.world.state.blockOwners.set(key, this.key);
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
            rebuildChunkInstancedMeshes(this);
        } catch (e) {
            console.error('[AntonCraft] rebuildMeshes failed:', this.key, e);
        }
    }

    async generate() {
        if (this.generating || this.destroyed) return;
        this.generating = true;
        try {
            this.beginGenerationPass();
            if (this.world.chunkGenerator && this.world.chunkGenerator.available) {
                try {
                    const results = await this.world.chunkGenerator.generateChunk(this.cx, this.cy, this.cz);
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
                            if (this.world.state.changedBlocks.get(key) === null) continue;
                            const override = this.world.state.changedBlocks.get(key);
                            const finalId = override ?? id;
                            const owner = this.noteTouchedGenerationChunk(x, z);
                            this.world.addBlock(x, y, z, finalId, owner.key);
                        }
                        
                        const startX = this.cx * this.world.chunkSize;
                        const startZ = this.cz * this.world.chunkSize;
                        const centerX = startX + Math.floor(this.world.chunkSize * 0.5);
                        const centerZ = startZ + Math.floor(this.world.chunkSize * 0.5);

                        this.registerRoadLandmark(startX, startZ);
                        if (this.world.shouldPlaceStructureChunk(this.cx, this.cz) && this.isLandSuitable(centerX, centerZ)) {
                            const sy = this.world.getColumnHeight(centerX, centerZ) + 1;
                            const biome = this.world.getBiomeAt(centerX, centerZ);
                            this.placeRandomStructure(centerX, sy, centerZ, biome);
                        }
                        if (this.world.shouldPlaceVillageChunk(this.cx, this.cz) && this.isLandSuitable(centerX, centerZ, 8)) {
                            const vy = this.world.getColumnHeight(centerX, centerZ) + 1;
                            this.placeVillageCluster(centerX, vy, centerZ);
                        }
                        this.placeUnderwaterStructure(centerX, centerZ);
                        this.applyPlayerOverrides();
                        this.finalizeGenerationPass();
                        return;
                    }
                } catch (error) {
                    console.warn('[AntonCraft] Chunk Worker failed, falling back to sync', error);
                }
            }

            this.generateSync();
        } finally {
            this.generating = false;
        }
    }

    generateSync() {
        if (this.destroyed) return;
        this.beginGenerationPass();
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
        if (this.world.shouldPlaceStructureChunk(this.cx, this.cz) && this.isLandSuitable(centerX, centerZ)) {
            const sy = this.world.getColumnHeight(centerX, centerZ) + 1;
            const biome = this.world.getBiomeAt(centerX, centerZ);
            this.placeRandomStructure(centerX, sy, centerZ, biome);
        }
        if (this.world.shouldPlaceVillageChunk(this.cx, this.cz) && this.isLandSuitable(centerX, centerZ, 8)) {
            const vy = this.world.getColumnHeight(centerX, centerZ) + 1;
            this.placeSettlementCluster(centerX, vy, centerZ);
        }
        this.placeUnderwaterStructure(centerX, centerZ);
        this.applyPlayerOverrides();
        this.finalizeGenerationPass();
        this.dirty = true;
    }

    registerRoadLandmark(startX, startZ) {
        const midX = startX + Math.floor(this.world.chunkSize * 0.5);
        const midZ = startZ + Math.floor(this.world.chunkSize * 0.5);
        if (!this.world.isHighwayAt(midX, midZ)) return;
        if (this.world.hash2D(this.cx + 519, this.cz - 733) < 0.78) return;
        this.world.registerLandmark(midX, midZ, 'Abandoned Highway');
    }

    placeSettlementCluster(centerX, centerY, centerZ) {
        const biome = this.world.getBiomeAt(centerX, centerZ);
        const biomeId = biome.id;
        const settlementName = this.world.getSettlementNameAt(centerX, centerZ);
        
        // Roll for settlement type
        const rng = this.world.hash2D(centerX, centerZ);
        let type = 'village';
        if (biomeId === 'desert') type = 'desert_town';
        else if (rng > 0.85) type = 'castle_outpost';
        else if (rng > 0.70) type = 'town';

        this.world.registerLandmark(centerX, centerZ, settlementName, {
            baseName: settlementName,
            category: type,
            displayName: settlementName
        });

        let offsets = [[-6, -4], [6, -3], [-5, 6], [5, 5]];
        let structures = [];

        if (type === 'desert_town') {
            structures = [STRUCTURES.desert_hut, STRUCTURES.desert_well, STRUCTURES.desert_hut, STRUCTURES.desert_hut];
        } else if (type === 'castle_outpost') {
            structures = [STRUCTURES.castle, STRUCTURES.castle_wall, STRUCTURES.castle_wall, STRUCTURES.blacksmith_forge];
            offsets = [[0, 0], [0, 8], [0, -8], [8, 0]];
        } else if (type === 'town') {
            structures = [STRUCTURES.village_manor, STRUCTURES.village_manor, STRUCTURES.village_hut, STRUCTURES.village_well];
        } else {
            structures = [STRUCTURES.village_hut, STRUCTURES.village_hut, STRUCTURES.village_hut, STRUCTURES.market_stall];
        }

        const placed = [];
        for (let i = 0; i < offsets.length; i++) {
            const [dx, dz] = offsets[i];
            const hx = centerX + dx;
            const hz = centerZ + dz;
            const hy = this.world.getColumnHeight(hx, hz) + 1;
            
            const struct = structures[i % structures.length];
            const blocks = struct.blueprints(hx, hy, hz);
            
            // Foundation
            const lowestYAtXZ = new Map();
            for (const b of blocks) {
                const xzKey = `${b.x},${b.z}`;
                if (!lowestYAtXZ.has(xzKey) || b.y < lowestYAtXZ.get(xzKey)) lowestYAtXZ.set(xzKey, b.y);
            }
            const filler = biome.fillerBlock || 'dirt';
            for (const [xzStr, minY] of lowestYAtXZ.entries()) {
                const [fx, fz] = xzStr.split(',').map(Number);
                const groundY = this.world.getColumnHeight(fx, fz);
                for (let fy = groundY; fy < minY; fy++) this.addGeneratedBlock(fx, fy, fz, filler);
            }

            for (const block of blocks) this.addGeneratedBlock(block.x, block.y, block.z, block.id);
            
            this.placeLampPost(hx + 2, hy, hz + 2);
            placed.push({ x: hx, z: hz, y: hy });
        }

        for (const hut of placed) this.placePathBetween(centerX, centerZ, hut.x, hut.z);
        this.placeLampPost(centerX, centerY, centerZ);
        
        // Spawn specialized villagers
        if (this.world.game?.entities && this.world.game.entities.entities.length < this.world.game.entities.maxEntities) {
            const villagerType = type === 'desert_town' ? 'villager_desert' : (type === 'castle_outpost' ? 'knight' : 'villager_anton');
            this.world.game.entities.spawn(villagerType, centerX + 0.5, centerY + 1.2, centerZ + 0.5);
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
            this.addGeneratedBlock(x, baseY + i, z, 'oak_planks');
        }
        this.addGeneratedBlock(x, baseY + 3, z, 'sea_lantern');
        this.addGeneratedBlock(x + 1, baseY + 2, z, 'sea_lantern');
        this.addGeneratedBlock(x - 1, baseY + 2, z, 'sea_lantern');
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
