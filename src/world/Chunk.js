import * as THREE from 'three';
import { STRUCTURES } from './structures/StructureRegistry.js';
import { biomeMatches } from '../data/biomes.js';
import { rebuildChunkInstancedMeshes } from './mesh/ChunkMeshBuilder.js';
import { generateChunkData } from '../voxel/gen/generateChunk.js';

const CORRUPTION_STRUCTURE_KEYS = new Set([
  'virus_nexus',
  'corrupted_lab',
  'restoration_shrine',
]);

// These structures have dedicated placement logic and should not appear in the random pool
const EXCLUDED_FROM_RANDOM_POOL = new Set([
  'dungeon_chamber',
  'village_manor',
  'village_hut',
  'village_farm',
  'village_well',
  // Theme-park rides look out of place in the wilderness.
  'mega_rollercoaster',
  'spinning_ride',
]);

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
  'windmill_outpost',
];

export class Chunk {
  constructor(world, cx, cy, cz) {
    this.world = world;
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.key = world.getChunkKey(cx, cy, cz);
    // Keys of blocks drawn by the instanced renderer (stairs, doors, ...).
    // Everything else is in the worker-built voxel meshes.
    this.blockKeys = new Set();
    this.voxelMeshes = { solid: null, cross: null, liquid: null };
    this.state = 'queued'; // queued -> generating -> ready
    this.meshVersion = 0;
    this.meshedVersion = -1;
    this.meshing = false;
    this._dirty = false;
    this.visible = true;
    this.group = new THREE.Group();
    this.group.position.set(
      cx * world.chunkSize,
      cy * world.chunkSize,
      cz * world.chunkSize
    );
    this.group.updateMatrix();
    this.group.matrixAutoUpdate = false;
    // Disabled active culling on the group level for small cubic stability; children handle their own.
    this.group.frustumCulled = true;
    this.world.scene.add(this.group);

    this.meshes = new Map(); // id -> Mesh or InstancedMesh (special blocks)
    this.lastRebuildTime = 0;
    this.destroyed = false;
    this.generating = false;
    this.touchedGenerationChunks = new Map();
  }

  beginGenerationPass() {
    this.touchedGenerationChunks.clear();
    this.touchedGenerationChunks.set(this.key, {
      key: this.key,
      cx: this.cx,
      cy: this.cy,
      cz: this.cz,
    });
  }

  get dirty() {
    return this._dirty;
  }

  set dirty(value) {
    this._dirty = Boolean(value);
    if (this._dirty) this.world.chunkManager?.markDirty(this);
  }

  finalizeGenerationPass() {
    this.touchedGenerationChunks.clear();
  }

  /**
   * World-generation write (structures, decoration). Recorded in the voxel
   * store so it is replayed whenever the target chunk loads; player edits
   * always win. `replace` false only fills air.
   */
  applyGeneratedBlock(x, y, z, id, options = {}) {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    const key = this.world.getKey(x, y, z);
    if (this.world.state.changedBlocks.has(key)) return;
    const finalId = id === 'air' ? null : id;
    const changed = this.world.voxels.setGenerated(
      x,
      y,
      z,
      finalId,
      !options.replace
    );
    if (changed) this.world.chunkManager.onBlockChanged(x, y, z);
  }

  addGeneratedStructureBlock(x, y, z, id) {
    this.applyGeneratedBlock(x, y, z, id, { replace: true });
  }

  isLandSuitable(x, z, minDryRadius = 4) {
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    let wetSamples = 0;

    for (let dx = -minDryRadius; dx <= minDryRadius; dx += 2) {
      for (let dz = -minDryRadius; dz <= minDryRadius; dz += 2) {
        const h = this.world.getColumnHeight(x + dx, z + dz);
        const wl = this.world.terrain.getSurfaceWaterLevelAt(x + dx, z + dz);
        minHeight = Math.min(minHeight, h);
        maxHeight = Math.max(maxHeight, h);
        if (h <= wl) wetSamples++;
      }
    }

    if (wetSamples > 0) return false;

    const maxVariance = minDryRadius >= 8 ? 5 : 4;
    return maxHeight - minHeight <= maxVariance;
  }

  isStructureSupportCandidate(id) {
    if (!id || id === 'air' || id === 'water' || id === 'lava') return false;
    return this.world.isBlockSolid(id);
  }

  getStructureSupportId(x, z, baseId) {
    const terrainY = Math.floor(this.world.getColumnHeight(x, z));
    const terrainId = this.world.getBlockAt(x, terrainY, z);
    const lowTerrainId = String(terrainId || '').toLowerCase();
    const softTerrain =
      lowTerrainId.includes('dirt') ||
      lowTerrainId.includes('grass') ||
      lowTerrainId.includes('sand') ||
      lowTerrainId.includes('gravel') ||
      lowTerrainId.includes('mud') ||
      lowTerrainId.includes('clay') ||
      lowTerrainId.includes('snow') ||
      lowTerrainId.includes('path') ||
      lowTerrainId.includes('farmland');
    if (
      terrainId &&
      terrainId !== 'air' &&
      terrainId !== 'water' &&
      terrainId !== 'lava' &&
      !softTerrain
    ) {
      return terrainId;
    }

    const lowId = String(baseId || '').toLowerCase();
    if (lowId.includes('sandstone')) return 'sandstone';
    if (
      lowId.includes('stone') ||
      lowId.includes('brick') ||
      lowId.includes('obsidian') ||
      lowId.includes('prismarine') ||
      lowId.includes('deepslate')
    ) {
      return 'cobblestone';
    }
    if (
      lowId.includes('planks') ||
      lowId.includes('log') ||
      lowId.includes('wood') ||
      lowId.includes('fence')
    ) {
      return 'cobblestone';
    }

    const biome = this.world.getBiomeAt(x, z);
    if (biome?.id === 'desert') return 'sandstone';
    return 'cobblestone';
  }

  addStructureSupports(blocks) {
    const lowestByColumn = new Map();

    for (const block of blocks) {
      if (!this.isStructureSupportCandidate(block?.id)) continue;
      const key = `${block.x}|${block.z}`;
      const existing = lowestByColumn.get(key);
      if (!existing || block.y < existing.y) {
        lowestByColumn.set(key, block);
      }
    }

    for (const block of lowestByColumn.values()) {
      const terrainY = Math.floor(this.world.getColumnHeight(block.x, block.z));
      const supportId = this.getStructureSupportId(block.x, block.z, block.id);
      for (let y = block.y - 1; y > terrainY; y--) {
        this.addGeneratedStructureBlock(block.x, y, block.z, supportId);
      }
    }
  }

  getBlueprintBounds(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const block of blocks) {
      if (!block) continue;
      if (block.x < minX) minX = block.x;
      if (block.y < minY) minY = block.y;
      if (block.z < minZ) minZ = block.z;
      if (block.x > maxX) maxX = block.x;
      if (block.y > maxY) maxY = block.y;
      if (block.z > maxZ) maxZ = block.z;
    }

    if (!Number.isFinite(minX)) return null;
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  /**
   * Terraforms a structure's plot: clears everything from its floor up
   * (hills, trees) and fills a foundation down to the terrain so it never
   * floats or gets buried. Works on chunks that are not loaded yet because
   * generation writes are replayed when they load.
   */
  clearBlueprintVolume(bounds, verticalPadding = 4, floorY = bounds?.minY) {
    if (!bounds) return;
    for (let bx = bounds.minX - 1; bx <= bounds.maxX + 1; bx++) {
      for (let bz = bounds.minZ - 1; bz <= bounds.maxZ + 1; bz++) {
        for (let by = floorY; by <= bounds.maxY + verticalPadding; by++) {
          this.addGeneratedStructureBlock(bx, by, bz, 'air');
        }
        const ground = Math.floor(this.world.getColumnHeight(bx, bz));
        const surface = this.world.getBiomeAt(bx, bz)?.surfaceBlock;
        const top =
          surface === 'sand' || surface === 'red_sand'
            ? surface
            : 'grass_block';
        for (let by = Math.min(ground + 1, floorY - 1); by < floorY; by++) {
          this.addGeneratedStructureBlock(
            bx,
            by,
            bz,
            by === floorY - 1 ? top : 'dirt'
          );
        }
      }
    }
  }

  placeUnderwaterStructure(centerX, centerZ) {
    const roll = this.world.hash2D(this.cx * 7 + 401, this.cz * 11 - 293);
    if (roll > 0.035) return; // ~3.5% of underwater chunks get a structure

    const h = this.world.getColumnHeight(centerX, centerZ);
    const wl = this.world.seaLevel;
    if (h >= wl - 2) return; // must be properly submerged

    const pool = ['ocean_ruins', 'sunken_ship'];
    const pick =
      pool[
        Math.floor(this.world.hash2D(this.cx - 77, this.cz + 33) * pool.length)
      ];
    const struct = STRUCTURES[pick];
    if (!struct) return;

    const blocks = struct.blueprints(centerX, h, centerZ);
    for (const b of blocks)
      this.addGeneratedStructureBlock(b.x, b.y, b.z, b.id);
    if (struct.name) this.world.registerLandmark(centerX, centerZ, struct.name);
  }

  placeChunkLandmarksAndStructures(centerX, centerZ) {
    const anchorY = Math.floor(this.world.getColumnHeight(centerX, centerZ));
    if (this.world.getChunkCoord(anchorY) !== this.cy) return;

    this.registerRoadLandmark(
      this.cx * this.world.chunkSize,
      this.cz * this.world.chunkSize
    );

    if (
      this.world.shouldPlaceStructureChunk(this.cx, this.cz) &&
      this.isLandSuitable(centerX, centerZ)
    ) {
      const structureY = this.world.getColumnHeight(centerX, centerZ) + 1;
      const biome = this.world.getBiomeAt(centerX, centerZ);
      this.placeRandomStructure(centerX, structureY, centerZ, biome);
    }

    if (
      this.world.shouldPlaceVillageChunk(this.cx, this.cz) &&
      this.isLandSuitable(centerX, centerZ, 8)
    ) {
      const villageY = this.world.getColumnHeight(centerX, centerZ) + 1;
      this.placeSettlementCluster(centerX, villageY, centerZ);
    }

    this.placeUnderwaterStructure(centerX, centerZ);
  }

  placeRandomStructure(x, y, z, biome) {
    const allKeys = Object.keys(STRUCTURES).filter(
      (k) => !EXCLUDED_FROM_RANDOM_POOL.has(k)
    );
    const virusRoll = this.world.hash2D(x + 811, z - 204);
    let keys = allKeys;
    if (!this.world.corruptionEnabled) {
      const allowVirusRuin = virusRoll > 0.996;
      keys = allKeys.filter((key) => {
        if (!CORRUPTION_STRUCTURE_KEYS.has(key)) return true;
        return allowVirusRuin && key !== 'restoration_shrine';
      });
      if (virusRoll < 0.94) {
        const civicOnly = CIVIC_STRUCTURE_POOL.filter((key) =>
          keys.includes(key)
        );
        if (civicOnly.length > 0) keys = civicOnly;
      }
    }
    if (keys.length === 0) return;

    const hash = this.world.hash2D(x - 99, z + 88);
    const structKey = keys[Math.floor(hash * keys.length)];
    const struct = STRUCTURES[structKey];
    if (!struct) return;

    if (Array.isArray(struct.biomes) && struct.biomes.length > 0) {
      if (
        !struct.biomes.includes('any') &&
        !struct.biomes.some((id) => biomeMatches(biome, id))
      )
        return;
    } else {
      // Backward compatibility for older structures.
      if (structKey === 'desert_pyramid' && biome.id !== 'desert') return;
      if (structKey === 'igloo' && biome.id !== 'highlands') return;
    }

    if (
      structKey === 'mega_rollercoaster' &&
      this.world.hash2D(x + 311, z - 125) < 0.72
    )
      return;
    if (
      structKey === 'spinning_ride' &&
      this.world.hash2D(x - 207, z + 519) < 0.5
    )
      return;

    const blocks = struct.blueprints(x, y, z);
    if (!blocks || blocks.length === 0) return;

    this.clearBlueprintVolume(this.getBlueprintBounds(blocks), 4);
    this.addStructureSupports(blocks);

    for (const b of blocks) {
      this.addGeneratedStructureBlock(b.x, b.y, b.z, b.id);
    }
    if (struct.name) {
      this.world.registerLandmark(x, z, struct.name);
    }
  }

  /** Replays this chunk's player edits on top of freshly installed terrain. */
  applyPlayerOverrides() {
    const voxels = this.world.voxels;
    for (const [key, id] of this.world.state.changedBlocks.forChunk(this.key)) {
      const [x, y, z] = this.world.keyToCoords(key);
      voxels.set(x, y, z, id);
    }
  }

  /** Rebuilds the set of special (instanced) block keys from storage. */
  resyncBlockKeysFromWorld() {
    this.blockKeys.clear();
    const arr = this.world.voxels.getChunkArray(this.cx, this.cy, this.cz);
    if (!arr) return 0;
    const table = this.world.chunkManager.renderTable;
    const cs = this.world.chunkSize;
    const bx = this.cx * cs;
    const by = this.cy * cs;
    const bz = this.cz * cs;
    for (let i = 0; i < arr.length; i++) {
      const num = arr[i];
      if (num === 0 || !table.isSpecial(num)) continue;
      this.blockKeys.add(
        this.world.getKey(bx + (i & 15), by + (i >> 8), bz + ((i >> 4) & 15))
      );
    }
    return this.blockKeys.size;
  }

  /**
   * Installs terrain from the generator: maps the chunk-local palette to
   * global ids, replays recorded generation writes and player edits, then
   * places this chunk's structures and spills tree canopies into
   * neighbouring chunks.
   */
  installTerrain({ blocks, palette, outside }) {
    const voxels = this.world.voxels;
    const lookup = new Uint16Array(palette.length);
    for (let i = 1; i < palette.length; i++) {
      lookup[i] = voxels.toNumeric(palette[i]);
    }
    const arr = new Uint16Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) arr[i] = lookup[blocks[i]];
    voxels.setChunkArray(this.cx, this.cy, this.cz, arr);
    this.applyPlayerOverrides();

    this.beginGenerationPass();
    for (let i = 0; i + 3 < outside.length; i += 4) {
      this.applyGeneratedBlock(
        outside[i],
        outside[i + 1],
        outside[i + 2],
        palette[outside[i + 3]]
      );
    }
    const cs = this.world.chunkSize;
    const centerX = this.cx * cs + Math.floor(cs / 2);
    const centerZ = this.cz * cs + Math.floor(cs / 2);
    try {
      this.placeChunkLandmarksAndStructures(centerX, centerZ);
    } catch (error) {
      console.warn('[ArloCraft] Structure placement failed:', this.key, error);
    }
    this.finalizeGenerationPass();

    this.state = 'ready';
    this.resyncBlockKeysFromWorld();
    this.world.redstone?.wakeChunk(
      this.cx,
      this.cy,
      this.cz,
      voxels.getChunkArray(this.cx, this.cy, this.cz)
    );
    this.dirty = true;
  }

  /** Rebuilds the instanced meshes for special blocks (stairs, doors...). */
  update() {
    if (this.destroyed) return;
    this.rebuildMeshes();
  }

  rebuildMeshes() {
    if (this.destroyed) return;
    if (this.blockKeys.size === 0 && this.meshes.size === 0) return;
    try {
      rebuildChunkInstancedMeshes(this);
    } catch (e) {
      console.error('[ArloCraft] rebuildMeshes failed:', this.key, e);
    }
  }

  /** Swaps in the worker-built voxel meshes. */
  applyVoxelMeshes(groups, materials) {
    for (const name of ['solid', 'cross', 'liquid']) {
      const old = this.voxelMeshes[name];
      if (old) {
        this.group.remove(old);
        old.geometry.dispose();
        this.voxelMeshes[name] = null;
      }
      const data = groups?.[name];
      if (!data) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(data.position, 3)
      );
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(data.normal, 3)
      );
      geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
      geometry.setAttribute('layer', new THREE.BufferAttribute(data.layer, 1));
      geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
      geometry.setAttribute('tint', new THREE.BufferAttribute(data.tint, 4));
      geometry.setAttribute('emit', new THREE.BufferAttribute(data.emit, 1));
      geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
      const cs = this.world.chunkSize;
      geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(cs, cs, cs)
      );
      geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(cs / 2, cs / 2, cs / 2),
        (cs * Math.sqrt(3)) / 2
      );
      const mesh = new THREE.Mesh(geometry, materials[name]);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = name === 'solid';
      mesh.receiveShadow = true;
      mesh.renderOrder = name === 'liquid' ? 2 : 0;
      this.voxelMeshes[name] = mesh;
      this.group.add(mesh);
    }
  }

  // Generation is driven by ChunkManager (worker pool -> installTerrain).
  generate() {
    this.world.chunkManager?.queueChunkLoad(this.cx, this.cy, this.cz);
  }

  generateSync() {
    if (this.destroyed || this.state === 'ready') return;
    this.installTerrain(
      generateChunkData({
        cx: this.cx,
        cy: this.cy,
        cz: this.cz,
        seedString: this.world.seedString,
        corruptionEnabled: Boolean(this.world.corruptionEnabled),
        cavesEnabled: this.world.game?.features?.caves !== false,
      })
    );
  }

  registerRoadLandmark(startX, startZ) {
    const midX = startX + Math.floor(this.world.chunkSize * 0.5);
    const midZ = startZ + Math.floor(this.world.chunkSize * 0.5);
    if (!this.world.isHighwayAt(midX, midZ)) return;
    if (this.world.hash2D(this.cx + 519, this.cz - 733) < 0.78) return;
    this.world.registerLandmark(midX, midZ, 'Abandoned Highway');
  }

  placeSettlementCluster(centerX, _centerY, centerZ) {
    const biome = this.world.getBiomeAt(centerX, centerZ);
    const settlementName = this.world.getSettlementNameAt(centerX, centerZ);
    let seed = Math.floor(this.world.hash2D(centerX, centerZ) * 2147483647);
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    const roll = rand();
    let type = 'village';
    if (biomeMatches(biome, 'desert')) type = 'desert_town';
    else if (roll > 0.88) type = 'castle_outpost';
    else if (roll > 0.65) type = 'town';

    this.world.registerLandmark(centerX, centerZ, settlementName, {
      baseName: settlementName,
      category: type,
      displayName: settlementName,
    });

    const pools = {
      desert_town: ['desert_hut', 'desert_hut', 'desert_hut', 'market_stall'],
      castle_outpost: [
        'castle',
        'blacksmith_forge',
        'village_hut',
        'village_farm',
      ],
      town: [
        'village_manor',
        'village_hut',
        'village_hut',
        'market_stall',
        'blacksmith_forge',
        'village_farm',
      ],
      village: [
        'village_hut',
        'village_hut',
        'village_hut',
        'village_farm',
        'market_stall',
        'blacksmith_forge',
      ],
    };
    const pool = pools[type].map((key) => STRUCTURES[key]).filter(Boolean);
    const centerpiece =
      type === 'desert_town' ? STRUCTURES.desert_well : STRUCTURES.village_well;

    const plazaY = Math.floor(this.world.getColumnHeight(centerX, centerZ)) + 1;
    const footprints = [];
    const doors = [];

    const placeBuilding = (struct, cornerX, cornerZ, fixedY = null) => {
      const w = struct.width ?? 7;
      const d = struct.depth ?? 7;
      const box = {
        x0: cornerX - 2,
        z0: cornerZ - 2,
        x1: cornerX + w + 1,
        z1: cornerZ + d + 1,
      };
      if (
        footprints.some(
          (f) =>
            box.x0 <= f.x1 && box.x1 >= f.x0 && box.z0 <= f.z1 && box.z1 >= f.z0
        )
      ) {
        return null;
      }
      // Sit on the average ground of the plot, close to the plaza level.
      let ground = fixedY;
      if (ground === null) {
        let sum = 0;
        for (const [px, pz] of [
          [0, 0],
          [w, 0],
          [0, d],
          [w, d],
          [w >> 1, d >> 1],
        ]) {
          sum += this.world.getColumnHeight(cornerX + px, cornerZ + pz);
        }
        ground = Math.round(sum / 5) + 1;
        ground = Math.max(plazaY - 3, Math.min(plazaY + 3, ground));
      }
      if (ground <= this.world.seaLevel + 1) return null;
      const blocks = struct.blueprints(cornerX, ground, cornerZ);
      if (!blocks?.length) return null;
      this.clearBlueprintVolume(this.getBlueprintBounds(blocks), 3, ground);
      for (const b of blocks)
        this.addGeneratedStructureBlock(b.x, b.y, b.z, b.id);
      footprints.push(box);
      return { x: cornerX + (w >> 1), y: ground, z: cornerZ - 1 };
    };

    if (centerpiece) {
      const w = centerpiece.width ?? 7;
      const d = centerpiece.depth ?? 7;
      placeBuilding(
        centerpiece,
        centerX - (w >> 1),
        centerZ - (d >> 1),
        plazaY
      );
    }

    const count = 5 + Math.floor(rand() * 4);
    const startAngle = rand() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const struct = pool[Math.floor(rand() * pool.length)];
      if (!struct) continue;
      const angle =
        startAngle + (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const radius = 12 + rand() * 7;
      const w = struct.width ?? 7;
      const d = struct.depth ?? 7;
      const cornerX = Math.round(centerX + Math.cos(angle) * radius - w / 2);
      const cornerZ = Math.round(centerZ + Math.sin(angle) * radius - d / 2);
      const door = placeBuilding(struct, cornerX, cornerZ);
      if (door) doors.push(door);
    }

    for (const door of doors) {
      this.placePathBetween(door.x, door.z, centerX, centerZ + 4);
    }
    // Lamp posts at the plaza corners light the village at night.
    for (const [lx, lz] of [
      [-5, -5],
      [5, 5],
    ]) {
      this.placeLampPost(centerX + lx, plazaY, centerZ + lz);
    }

    if (
      this.world.game?.entities &&
      this.world.game.entities.entities.length <
        this.world.game.entities.maxEntities
    ) {
      const villagerType =
        type === 'desert_town'
          ? 'villager_desert'
          : type === 'castle_outpost'
            ? 'knight'
            : 'villager_arlo';
      for (let i = 0; i < Math.min(3, doors.length); i++) {
        const door = doors[i];
        this.world.game.entities.spawn(
          villagerType,
          door.x + 0.5,
          door.y + 1.2,
          door.z - 1.5
        );
      }
    }
  }

  placePathBetween(x0, z0, x1, z1) {
    let x = x0;
    let z = z0;
    const stepX = x1 >= x0 ? 1 : -1;
    const stepZ = z1 >= z0 ? 1 : -1;
    let guard = 0;
    while ((x !== x1 || z !== z1) && guard++ < 256) {
      const y = Math.floor(this.world.getColumnHeight(x, z));
      const existing = this.world.getBlockAt(x, y, z);
      // Never pave over building floors or water.
      if (!existing || /grass|dirt|sand|podzol|snow/.test(existing)) {
        this.addGeneratedStructureBlock(x, y, z, 'path_block');
        this.addGeneratedStructureBlock(x, y + 1, z, 'air');
      }
      if (Math.abs(x1 - x) > Math.abs(z1 - z)) x += stepX;
      else z += stepZ;
    }
  }

  placeLampPost(x, _y, z) {
    const baseY = Math.floor(this.world.getColumnHeight(x, z)) + 1;
    this.addGeneratedStructureBlock(x, baseY - 1, z, 'cobblestone');
    for (let i = 0; i < 3; i++) {
      this.addGeneratedStructureBlock(x, baseY + i, z, 'oak_log');
    }
    this.addGeneratedStructureBlock(x, baseY + 3, z, 'lantern');
  }

  setVisible(visible) {
    if (this.visible === visible) return;
    this.visible = visible;
    if (this.group) this.group.visible = visible;
  }

  destroy() {
    this.destroyed = true;
    for (const mesh of this.meshes.values()) {
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
      if (
        mesh.userData?.ownedGeometry &&
        mesh.geometry &&
        typeof mesh.geometry.dispose === 'function'
      ) {
        mesh.geometry.dispose();
      }
      if (typeof mesh.dispose === 'function') mesh.dispose();
    }
    this.meshes.clear();
    for (const name of ['solid', 'cross', 'liquid']) {
      this.voxelMeshes[name]?.geometry.dispose();
      this.voxelMeshes[name] = null;
    }
    if (this.blockKeys) this.blockKeys.clear();
    if (this.group?.parent) this.group.parent.remove(this.group);
    this.world.voxels.dropChunk(this.cx, this.cy, this.cz);
  }
}
