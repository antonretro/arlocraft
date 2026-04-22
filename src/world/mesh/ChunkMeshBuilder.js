import * as THREE from 'three';
import { normalizeBlockVariantId } from '../../data/blockIds.js';
import {
  RENDER_LAYERS,
  materialIsTransparent,
  materialUsesBlendTransparency,
} from '../../rendering/RenderConfig.js';
import {
  DECO_LOD_DIST_SQ,
  isDecoType,
  isPaneType,
  resolveChunkGeometry,
  resolveLODGeometry,
  shouldSkipChunkBlockInstance,
  shouldSkipStandaloneTypeRender,
} from './renderTypes.js';
import { VoxelGeometryBuilder } from './VoxelGeometryBuilder.js';

let sharedGeoBuilder = null;
function getSharedGeoBuilder(world) {
  if (!sharedGeoBuilder) sharedGeoBuilder = new VoxelGeometryBuilder(world);
  return sharedGeoBuilder;
}

function isTintableMaterial(material) {
  return Boolean(material?.userData?.tintable);
}

function cloneMaterial(material) {
  if (Array.isArray(material)) {
    return material.map((entry) => (entry?.clone ? entry.clone() : entry));
  }
  return material?.clone ? material.clone() : material;
}

function specializeMaterial(baseMaterial) {
  if (!baseMaterial) return null;

  const needsSpecialization = Array.isArray(baseMaterial)
    ? baseMaterial.some(isTintableMaterial)
    : isTintableMaterial(baseMaterial);

  if (!needsSpecialization) return { material: baseMaterial, owned: false };
  
  const material = cloneMaterial(baseMaterial);
  if (Array.isArray(material)) {
    material.forEach((m) => {
      if (isTintableMaterial(m)) m.vertexColors = true;
    });
  } else if (isTintableMaterial(material)) {
    material.vertexColors = true;
  }
  
  return { material, owned: true };
}

function specializePaneMaterial(baseMaterial) {
  const source = Array.isArray(baseMaterial)
    ? baseMaterial.find((entry) => entry?.map) ?? baseMaterial[0]
    : baseMaterial;
  if (!source) return null;

  if (!isTintableMaterial(source)) {
    return { material: source, owned: false };
  }

  const material = cloneMaterial(source);
  if (isTintableMaterial(material)) material.vertexColors = true;
  return { material, owned: true };
}

function getRenderOrder(id, material) {
  if (id === 'water') return RENDER_LAYERS.WATER;
  if (materialUsesBlendTransparency(material)) return RENDER_LAYERS.TRANSPARENT;
  return RENDER_LAYERS.OPAQUE;
}

function usesCustomInstancedGeometry(blockData) {
  const renderType = blockData?.renderType;
  return (
    renderType === 'flat' ||
    renderType === 'slab' ||
    renderType === 'stairs' ||
    renderType === 'trapdoor' ||
    renderType === 'door'
  );
}

function isPaneConnectable(world, x, y, z) {
  const neighborId = world.getBlockAt(x, y, z);
  if (!neighborId || neighborId === 'air') return false;
  const neighborData = world.getBlockData(normalizeBlockVariantId(neighborId));
  return world.isBlockSolid(neighborId) || isPaneType(neighborData);
}

function clearMeshes(chunk) {
  // Clear both instanced meshes and standard meshes
  for (const mesh of chunk.meshes.values()) {
    chunk.group.remove(mesh);
    if (mesh.userData?.ownedMaterial) {
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) {
          if (typeof material?.dispose === 'function') material.dispose();
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
  chunk.meshes.clear();
}

const tempPos = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempQuat = new THREE.Quaternion();
const tempEuler = new THREE.Euler();
const tempScale = new THREE.Vector3(1, 1, 1);

function collectBlocksByBaseId(chunk) {
  const byBaseId = new Map();
  for (const key of chunk.blockKeys) {
    const rawId = chunk.world.state.blockMap.get(key);
    if (!rawId) continue;
    
    let baseId = rawId.startsWith('water') ? 'water' : normalizeBlockVariantId(rawId);
    const blockData = chunk.world.getBlockData(baseId);
    
    // Specialize Base ID for Instanced Variants
    if (blockData?.renderType === 'slab') {
        if (rawId.endsWith(':top')) baseId += ':top';
    } else if (blockData?.renderType === 'stairs') {
        const [x, y, z] = chunk.world.keyToCoords(key);
        const shape = getStairShape(chunk.world, x, y, z, baseId, rawId);
        if (shape !== 'straight') baseId += `__${shape}`;
    }

    if (!byBaseId.has(baseId)) byBaseId.set(baseId, []);
    byBaseId.get(baseId).push(key);
  }
  return byBaseId;
}

function getStairShape(world, x, y, z, baseId, rawId) {
    const dir = rawId.split(':').shift().split('_').pop(); // n, s, e, w
    
    // Check neighbor stairs to determine if we are a corner
    // This is a simplified version of Minecraft's stair logic
    const getDir = (ox, oy, oz) => {
        const id = world.state.blockMap.get(world.getKey(ox, oy, oz));
        if (!id || !id.includes('_stairs')) return null;
        return id.split(':').shift().split('_').pop();
    };

    const n = getDir(x, y, z - 1);
    const s = getDir(x, y, z + 1);
    const e = getDir(x + 1, y, z);
    const w = getDir(x - 1, y, z);

    // Inner Corner Logic (very simplified)
    if (dir === 'n' && (e === 's' || w === 's')) return 'inner';
    if (dir === 's' && (e === 'n' || w === 'n')) return 'inner';
    if (dir === 'e' && (n === 'w' || s === 'w')) return 'inner';
    if (dir === 'w' && (n === 'e' || s === 'e')) return 'inner';

    // Outer Corner Logic (very simplified)
    if (dir === 'n' && (e === 'n' || w === 'n')) return 'straight'; // Already straight
    
    return 'straight';
}

export function rebuildChunkInstancedMeshes(chunk) {
  if (chunk.destroyed) return;
  try {
    _rebuildChunkMeshesInner(chunk);
  } catch (err) {
    console.error(
      `[ArloCraft] Fatal chunk rebuild error (${chunk.cx},${chunk.cy},${chunk.cz}):`,
      err
    );
  }
}

function _rebuildChunkMeshesInner(chunk) {
  if (chunk.destroyed) return;
  const startTime = performance.now();

  chunk.resyncBlockKeysFromWorld();
  clearMeshes(chunk);

  const byBaseId = collectBlocksByBaseId(chunk);
  const cam = chunk.world?.game?.camera?.instance;
  const camPos = cam ? cam.position : new THREE.Vector3(0, 0, 0);
  const isNear =
    Math.abs(chunk.cx - chunk.world.getChunkCoord(camPos.x)) <= 2 &&
    Math.abs(chunk.cy - chunk.world.getChunkCoord(camPos.y)) <= 2 &&
    Math.abs(chunk.cz - chunk.world.getChunkCoord(camPos.z)) <= 2;

  const geoBuilder = getSharedGeoBuilder(chunk.world);
  geoBuilder.prepareBuffer(chunk);

  for (const [baseId, keys] of byBaseId.entries()) {
    try {
      const blockData = chunk.world.getBlockData(baseId);
      if (shouldSkipStandaloneTypeRender(blockData)) continue;

      const baseMaterial = chunk.world.blockRegistry.getMaterial(baseId);
      const specialized = specializeMaterial(baseMaterial);
      if (!specialized) continue;
      
      const { material, owned } = specialized;
      if (!material) continue;

      if (isPaneType(blockData)) {
        const paneMaterial = specializePaneMaterial(baseMaterial);
        if (!paneMaterial?.material) continue;
        createPaneMeshes(
          chunk,
          baseId,
          keys,
          paneMaterial.material,
          paneMaterial.owned
        );
        continue;
      }

      // Handle custom-shape instancing before falling back to greedy cube meshing.
      if (usesCustomInstancedGeometry(blockData)) {
        const geometry = resolveChunkGeometry(chunk.world, baseId, blockData);
        if (geometry) {
          createInstancedMesh(
            chunk,
            baseId,
            keys,
            geometry,
            material,
            owned,
            blockData,
            false
          );
        }
        continue;
      }

      // Handle Deco (Instanced) vs Solid (Consolidated/Greedy)
      if (isDecoType(blockData)) {
        const nearKeys = [], farKeys = [];
        for (const key of keys) {
          const coords = chunk.world.keyToCoords(key);
          if (shouldSkipChunkBlockInstance({ 
            world: chunk.world, id: baseId, blockData, 
            ax: coords[0], ay: coords[1], az: coords[2], isNear 
          })) continue;

          const dx = coords[0] - camPos.x, dz = coords[2] - camPos.z;
          if (dx * dx + dz * dz > DECO_LOD_DIST_SQ) farKeys.push(key);
          else nearKeys.push(key);
        }

        if (nearKeys.length > 0) {
          const geometry = resolveChunkGeometry(chunk.world, baseId, blockData);
          if (geometry) createInstancedMesh(chunk, baseId, nearKeys, geometry, material, owned, blockData, false);
        }
        if (farKeys.length > 0) {
          const geometry = resolveLODGeometry(chunk.world, blockData);
          if (geometry) createInstancedMesh(chunk, baseId, farKeys, geometry, material, owned, blockData, true);
        }
      } else {
        // SOLID/CUBES: Consolidate and Greedy Mesh
        const numericIdSet = new Set();
        for (const rawId of keys) {
          const raw = chunk.world.state.blockMap.get(rawId);
          numericIdSet.add(chunk.world.state.getInternalId(normalizeBlockVariantId(raw)));
        }
        
        const geo = geoBuilder.build(chunk, numericIdSet);
        if (geo) {
          const mesh = new THREE.Mesh(geo, material);
          if (owned) mesh.userData.ownedMaterial = true;
          mesh.userData.ownedGeometry = true;
          
          mesh.renderOrder = getRenderOrder(baseId, material);
          mesh.castShadow = !baseId.startsWith('water') && !materialUsesBlendTransparency(material);
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          
          chunk.meshes.set(baseId, mesh);
          chunk.group.add(mesh);
        }
      }
    } catch (err) {
      console.error(`[ArloCraft] Chunk mesh error for "${baseId}":`, err);
    }
  }

  if (chunk.world.game) {
    chunk.world.game._lastMeshMs = performance.now() - startTime;
  }
}

function createInstancedMesh(chunk, id, keys, geometry, material, owned, blockData, isLod) {
  if (!geometry.boundingSphere) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  const mesh = new THREE.InstancedMesh(geometry, material, keys.length);
  if (owned) mesh.userData.ownedMaterial = true;
  
  const worldX = chunk.cx * chunk.world.chunkSize;
  const worldY = chunk.cy * chunk.world.chunkSize;
  const worldZ = chunk.cz * chunk.world.chunkSize;
  const cam = chunk.world?.game?.camera?.instance;
  const camPos = cam ? cam.position : new THREE.Vector3(0, 0, 0);

  const isTintable = Array.isArray(material) ? material.some(isTintableMaterial) : isTintableMaterial(material);
  const color = new THREE.Color();

  let renderCount = 0;
  for (const key of keys) {
    const [ax, ay, az] = chunk.world.keyToCoords(key);
    const rawId = chunk.world.state.blockMap.get(key) ?? id;
    tempPos.set(ax - worldX + 0.5, ay - worldY + 0.5, az - worldZ + 0.5);

    if (blockData?.renderType === 'slab' && rawId.includes(':top')) {
      tempPos.y += 0.5;
    }

    if (isDecoType(blockData)) {
      const below = chunk.world.getBlockAt(ax, ay - 1, az);
      if (below === 'path_block' || below === 'dirt_path' || below === 'farmland') {
        tempPos.y -= 0.0625;
      }
    }

    if (isTintable) {
      const hex = chunk.world.terrain.getBlendedColor(ax, az, 'color');
      color.setHex(hex);
      mesh.setColorAt(renderCount, color);
    }

    tempEuler.set(0, 0, 0);
    if (blockData?.renderType === 'stairs') {
      if (rawId.includes('_n')) tempEuler.y = Math.PI;
      else if (rawId.includes('_e')) tempEuler.y = -Math.PI / 2;
      else if (rawId.includes('_w')) tempEuler.y = Math.PI / 2;
    } else if (blockData?.renderType === 'door') {
      const isOpen = rawId.includes(':open');
      const dir = rawId.includes('_n') ? 'n' : (rawId.includes('_e') ? 'e' : (rawId.includes('_w') ? 'w' : 's'));
      
      if (dir === 'n') tempEuler.y = Math.PI;
      else if (dir === 'e') tempEuler.y = -Math.PI / 2;
      else if (dir === 'w') tempEuler.y = Math.PI / 2;
      
      if (isOpen) tempEuler.y += Math.PI / 2;
    } else if (blockData?.renderType === 'trapdoor') {
      if (rawId.includes(':open')) tempEuler.x = -Math.PI / 2;
    }
    if (isLod) {
      tempEuler.y = Math.atan2(camPos.x - ax, camPos.z - az);
    }
    
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    mesh.setMatrixAt(renderCount, tempMatrix);
    renderCount++;
  }

  mesh.count = renderCount;
  mesh.instanceMatrix.needsUpdate = true;
  if (isTintable && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  
  mesh.frustumCulled = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = getRenderOrder(id, material);
  
  const key = isLod ? `${id}_lod` : id;
  chunk.meshes.set(key, mesh);
  chunk.group.add(mesh);
}

function createPaneMeshes(chunk, id, keys, material, owned) {
  const geo = chunk.world.sharedChunkGeometries;
  if (!geo?.paneCenter) return;

  const buckets = {
    center: [...keys],
    north: [],
    south: [],
    east: [],
    west: [],
  };

  for (const key of keys) {
    const [ax, ay, az] = chunk.world.keyToCoords(key);
    const north = isPaneConnectable(chunk.world, ax, ay, az - 1);
    const south = isPaneConnectable(chunk.world, ax, ay, az + 1);
    const east = isPaneConnectable(chunk.world, ax + 1, ay, az);
    const west = isPaneConnectable(chunk.world, ax - 1, ay, az);
    const connected = north || south || east || west;

    if (north || !connected) buckets.north.push(key);
    if (south || !connected) buckets.south.push(key);
    if (east || !connected) buckets.east.push(key);
    if (west || !connected) buckets.west.push(key);
  }

  const variants = [
    ['center', geo.paneCenter],
    ['north', geo.paneNorth],
    ['south', geo.paneSouth],
    ['east', geo.paneEast],
    ['west', geo.paneWest],
  ];

  for (const [suffix, geometry] of variants) {
    const variantKeys = buckets[suffix];
    if (!geometry || !variantKeys || variantKeys.length === 0) continue;
    createInstancedMesh(
      chunk,
      `${id}__${suffix}`,
      variantKeys,
      geometry,
      material,
      owned,
      { renderType: 'pane' },
      false
    );
  }
}
