import * as THREE from 'three';
import { STRUCTURES } from './structures/StructureRegistry.js';
import { getStructurePlanner } from './structures/StructurePlanner.js';
import { rebuildChunkInstancedMeshes } from './mesh/ChunkMeshBuilder.js';
import { generateChunkData } from '../voxel/gen/generateChunk.js';

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

  isStructureSupportCandidate(id) {
    if (!id || id === 'air' || id === 'water' || id === 'lava') return false;
    return this.world.isBlockSolid(id);
  }

  /** Foundation block under a structure (deterministic, no block reads). */
  getStructureSupportId(baseId) {
    const lowId = String(baseId || '').toLowerCase();
    if (lowId.includes('sandstone')) return 'sandstone';
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
      const supportId = this.getStructureSupportId(block.id);
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
        const top = ['sand', 'red_sand', 'snow_block', 'mud'].includes(surface)
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

  get structurePlanner() {
    return getStructurePlanner(this.world.seedString);
  }

  /**
   * Places a structure once per session. Its writes are recorded in the
   * voxel store, so when chunks reload they come back from that record
   * instead of being placed (and villagers spawned) again.
   */
  claimStructure(id) {
    const placed = this.world.voxels.placedStructures;
    if (!placed || placed.has(id)) return false;
    placed.add(id);
    return true;
  }

  placeUnderwaterStructure(centerX, centerZ) {
    const roll = this.world.hash2D(this.cx * 7 + 401, this.cz * 11 - 293);
    if (roll > 0.035) return; // ~3.5% of underwater chunks get a structure

    const h = this.world.getColumnHeight(centerX, centerZ);
    const wl = this.world.seaLevel;
    if (h >= wl - 2) return; // must be properly submerged
    if (!this.claimStructure(`underwater:${this.cx}:${this.cz}`)) return;

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
    const planner = this.structurePlanner;
    const chunkOf = (y) => this.world.getChunkCoord(y);

    const village = planner.villageAnchoredAt(this.cx, this.cz);
    if (village && chunkOf(village.plazaY) === this.cy) {
      if (this.claimStructure(village.id)) this.placeVillage(village);
      // Villagers despawn when the player travels far away; bring them back
      // when the village reloads, without duplicating the ones still there.
      else this.spawnVillagers(village);
    }

    const wild = planner.randomStructureAt(
      this.cx,
      this.cz,
      Boolean(this.world.corruptionEnabled)
    );
    if (wild && chunkOf(wild.y) === this.cy) {
      if (this.claimStructure(wild.id)) this.placeWildStructure(wild);
    }

    const anchorY = Math.floor(this.world.getColumnHeight(centerX, centerZ));
    if (chunkOf(anchorY) !== this.cy) return;
    this.registerRoadLandmark(
      this.cx * this.world.chunkSize,
      this.cz * this.world.chunkSize
    );
    this.placeUnderwaterStructure(centerX, centerZ);
  }

  /** A wilderness structure on a site the planner checked (dry, gentle). */
  placeWildStructure(plan) {
    const struct = STRUCTURES[plan.key];
    if (!struct) return;
    const blocks = struct.blueprints(plan.x, plan.y, plan.z);
    if (!blocks?.length) return;

    // Clear from the floor up (never dig below it) and level the ground.
    this.clearBlueprintVolume(this.getBlueprintBounds(blocks), 4, plan.y);
    this.addStructureSupports(blocks);
    for (const b of blocks) {
      this.addGeneratedStructureBlock(b.x, b.y, b.z, b.id);
    }
    if (struct.name) this.world.registerLandmark(plan.x, plan.z, struct.name);
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
    if (!this.claimStructure(`road:${this.cx}:${this.cz}`)) return;
    this.world.registerLandmark(midX, midZ, 'Abandoned Highway');
  }

  /** Writes a planned village (see StructurePlanner) and its villagers. */
  placeVillage(plan) {
    const writes = this.structurePlanner.buildVillage(plan);
    for (const [x, y, z, id] of writes) {
      this.addGeneratedStructureBlock(x, y, z, id);
    }

    const name = this.world.getSettlementNameAt(plan.x, plan.z);
    const category = plan.styleId === 'desert' ? 'desert_town' : 'village';
    this.world.registerLandmark(plan.x, plan.z, name, {
      baseName: name,
      category,
      displayName: name,
    });

    this.spawnVillagers(plan);
  }

  spawnVillagers(plan) {
    const entities = this.world.game?.entities;
    if (!entities || entities.entities.length >= entities.maxEntities) return;
    const villagerType =
      plan.styleId === 'desert' ? 'villager_desert' : 'villager_arlo';
    const spots = (plan.doors ?? []).slice(0, 4);
    const present = entities.entities.filter((e) => {
      const pos = e.mesh?.position;
      return (
        !e.dead &&
        /villager/.test(e.config?.id ?? '') &&
        pos &&
        Math.abs(pos.x - plan.x) < 56 &&
        Math.abs(pos.z - plan.z) < 56
      );
    }).length;
    for (let i = present; i < spots.length; i++) {
      const spot = spots[i];
      // Inside a house when its chunk is loaded, otherwise on the plaza.
      const inside = this.world.voxels.hasChunk(
        this.world.getChunkCoord(spot.x),
        this.world.getChunkCoord(spot.y),
        this.world.getChunkCoord(spot.z)
      );
      const x = inside ? spot.x : plan.x - 2 + i;
      const y = inside ? spot.y : plan.plazaY + 1;
      const z = inside ? spot.z : plan.z + 4;
      entities.spawn(villagerType, x + 0.5, y + 0.2, z + 0.5);
    }
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
