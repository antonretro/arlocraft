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
  resolveChunkGeometry,
  resolveLODGeometry,
  shouldSkipChunkBlockInstance,
  shouldSkipStandaloneTypeRender,
} from './renderTypes.js';

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
  return { material: cloneMaterial(baseMaterial), owned: true };
}

function resolveBiomeTintHex(biome) {
  const fallback = 0x91bd59;
  const raw = biome?.color;
  const normalize = (hex) => {
    const value = Math.max(0, Math.min(0xffffff, Math.floor(hex)));
    let r = (value >> 16) & 0xff;
    let g = (value >> 8) & 0xff;
    let b = value & 0xff;

    const minChannel = 58;
    if (r < minChannel) r = minChannel;
    if (g < minChannel) g = minChannel;
    if (b < minChannel) b = minChannel;

    const sum = r + g + b;
    const minLumaSum = 230;
    if (sum < minLumaSum && sum > 0) {
      const scale = minLumaSum / sum;
      r = Math.min(255, Math.round(r * scale));
      g = Math.min(255, Math.round(g * scale));
      b = Math.min(255, Math.round(b * scale));
    }

    return (r << 16) | (g << 8) | b;
  };

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return normalize(raw);
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text) {
      const parsed = text.toLowerCase().startsWith('0x')
        ? Number(text)
        : Number.parseInt(text, 16);
      if (Number.isFinite(parsed) && parsed > 0) return normalize(parsed);
    }
  }
  return normalize(fallback);
}

function getRenderOrder(id, material) {
  if (id === 'water') return RENDER_LAYERS.WATER;
  if (materialUsesBlendTransparency(material)) return RENDER_LAYERS.TRANSPARENT;
  return RENDER_LAYERS.OPAQUE;
}

function clearInstancedMeshes(chunk) {
  for (const mesh of chunk.instancedMeshes.values()) {
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
    if (typeof mesh.dispose === 'function') mesh.dispose();
  }
  chunk.instancedMeshes.clear();
}

// Reuse vectors and matrices to prevent GC thrashing during heavy chunk rebuilds
const tempCoords = [0, 0, 0];
const tempPos = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempQuat = new THREE.Quaternion();
const tempEuler = new THREE.Euler();
const tempScale = new THREE.Vector3(1, 1, 1);

function collectBlocksByType(chunk) {
  const byType = new Map();
  const add = (id, key) => {
    if (!byType.has(id)) byType.set(id, []);
    byType.get(id).push(key);
  };

  for (const key of chunk.blockKeys) {
    const id = chunk.world.state.blockMap.get(key);
    if (!id) continue;

    if (id.startsWith('water')) {
      const [ax, ay, az] = chunk.world.keyToCoords(key);
      const isFluid = (blockId) => {
        if (!blockId) return false;
        if (blockId === 'water' || blockId.startsWith('water')) return true;
        return (
          chunk.world.blocks?.isLiquid?.(blockId) ||
          chunk.world.getBlockData(blockId)?.liquid
        );
      };

      // Seamless water: Only add faces if neighbor is NOT water/fluid and is NOT solid opaque
      const aboveId = chunk.world.state.blockMap.get(
        chunk.world.getKey(ax, ay + 1, az)
      );
      if (!isFluid(aboveId)) {
        add('water_top', key);
      }

      const belowId = chunk.world.state.blockMap.get(
        chunk.world.getKey(ax, ay - 1, az)
      );
      if (!isFluid(belowId) && !chunk.world.blocks.isSolid(belowId)) {
        add('water_bottom', key);
      }

      const nxId = chunk.world.state.blockMap.get(
        chunk.world.getKey(ax + 1, ay, az)
      );
      if (!isFluid(nxId) && !chunk.world.blocks.isSolid(nxId))
        add('water_side_nx', key);

      const pxId = chunk.world.state.blockMap.get(
        chunk.world.getKey(ax - 1, ay, az)
      );
      if (!isFluid(pxId) && !chunk.world.blocks.isSolid(pxId))
        add('water_side_px', key);

      const nzId = chunk.world.state.blockMap.get(
        chunk.world.getKey(ax, ay, az + 1)
      );
      if (!isFluid(nzId) && !chunk.world.blocks.isSolid(nzId))
        add('water_side_nz', key);

      const pzId = chunk.world.state.blockMap.get(
        chunk.world.getKey(ax, ay, az - 1)
      );
      if (!isFluid(pzId) && !chunk.world.blocks.isSolid(pzId))
        add('water_side_pz', key);

      continue;
    }

    const blockData = chunk.world.getBlockData(id);
    const renderType = blockData?.renderType ?? 'cube';

    // --- Smart Rails & Connected Textures ---
    const [ax, ay, az] = chunk.world.keyToCoords(key);

    if (id === 'rail' || id === 'powered_rail' || id === 'detector_rail') {
      const hasRail = (nx, ny, nz) => {
        const nid = chunk.world.getBlockAt(nx, ny, nz);
        return nid && nid.includes('rail');
      };

      const n = hasRail(ax, ay, az - 1);
      const s = hasRail(ax, ay, az + 1);
      const e = hasRail(ax + 1, ay, az);
      const w = hasRail(ax - 1, ay, az);

      if ((n && e) || (e && s) || (s && w) || (w && n)) {
        // It's a corner!
        add(id + ':corner', key);
      } else if (e || w) {
        // Horizontal
        add(id + ':rotated', key);
      } else {
        // Vertical or single
        add(id, key);
      }
      continue;
    }

    // --- Neighborhood-Aware Face Culling for Box/Cube geometries ---
    if (renderType === 'cube' || id.includes('glass')) {
      const isOpaque = (neighborId) => {
        if (!neighborId || neighborId === 'air') return false;
        // Cull against any glass variant for seamless look
        if (id.includes('glass') && neighborId.includes('glass')) return true;
        if (neighborId === id) return true;

        const nData = chunk.world.getBlockData(neighborId);
        return nData && !nData.transparent && !nData.deco;
      };

      if (!isOpaque(chunk.world.getBlockAt(ax, ay + 1, az)))
        add(id + ':top', key);
      if (!isOpaque(chunk.world.getBlockAt(ax, ay - 1, az)))
        add(id + ':bottom', key);
      if (!isOpaque(chunk.world.getBlockAt(ax + 1, ay, az)))
        add(id + ':px', key);
      if (!isOpaque(chunk.world.getBlockAt(ax - 1, ay, az)))
        add(id + ':nx', key);
      if (!isOpaque(chunk.world.getBlockAt(ax, ay, az + 1)))
        add(id + ':pz', key);
      if (!isOpaque(chunk.world.getBlockAt(ax, ay, az - 1)))
        add(id + ':nz', key);

      continue;
    }

    add(id, key);
  }
  return byType;
}

function applyChunkTint(chunk, material) {
  const tintable = Array.isArray(material)
    ? material.some(isTintableMaterial)
    : isTintableMaterial(material);

  if (!tintable) return;

  const cx =
    chunk.cx * chunk.world.chunkSize + Math.floor(chunk.world.chunkSize / 2);
  const cz =
    chunk.cz * chunk.world.chunkSize + Math.floor(chunk.world.chunkSize / 2);
  const chunkTintHex = resolveBiomeTintHex(chunk.world.getBiomeAt(cx, cz));
  const tintColor = new THREE.Color(chunkTintHex);

  if (Array.isArray(material)) {
    for (const entry of material) {
      if (isTintableMaterial(entry)) {
        entry.color.copy(tintColor);
        entry.needsUpdate = true;
      }
    }
    return;
  }

  material.color.copy(tintColor);
  material.needsUpdate = true;
}

function finalizeInstancedMesh(mesh, id, blockData, material) {
  const isWater = id.startsWith('water');
  const isDeco = Boolean(blockData?.deco);
  const transparentMaterial = materialIsTransparent(material);
  const blendedTransparency = materialUsesBlendTransparency(material);

  mesh.matrixAutoUpdate = false;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.StaticDrawUsage);
  }

  mesh.renderOrder = getRenderOrder(isWater ? 'water' : id, material);
  mesh.castShadow = !isWater && !isDeco && !transparentMaterial;
  mesh.receiveShadow = !blendedTransparency && !isDeco;
}

export function rebuildChunkInstancedMeshes(chunk) {
  if (chunk.destroyed) return;
  try {
    _rebuildChunkInstancedMeshesInner(chunk);
  } catch (err) {
    console.error(
      `[ArloCraft] Fatal chunk rebuild error (${chunk.cx},${chunk.cy},${chunk.cz}):`,
      err
    );
  }
}

function _rebuildChunkInstancedMeshesInner(chunk) {
  if (chunk.destroyed) return;
  const startTime = performance.now();

  chunk.resyncBlockKeysFromWorld();
  clearInstancedMeshes(chunk);

  const byType = collectBlocksByType(chunk);
  const worldX = chunk.cx * chunk.world.chunkSize;
  const worldY = chunk.cy * chunk.world.chunkSize;
  const worldZ = chunk.cz * chunk.world.chunkSize;
  const cam = chunk.world?.game?.camera?.instance;
  const camPos = cam ? cam.position : new THREE.Vector3(0, 0, 0);
  const isNear =
    Math.abs(chunk.cx - chunk.world.getChunkCoord(camPos.x)) <= 2 &&
    Math.abs(chunk.cy - chunk.world.getChunkCoord(camPos.y)) <= 2 &&
    Math.abs(chunk.cz - chunk.world.getChunkCoord(camPos.z)) <= 2;

  const buildMesh = (
    id,
    baseId,
    keys,
    geometry,
    material,
    owned,
    blockData,
    lodFar
  ) => {
    const isTintable = (() => {
      if (!Array.isArray(material)) return isTintableMaterial(material);
      if (!geometry.groups || geometry.groups.length === 0) {
        return material.some(isTintableMaterial);
      }
      return geometry.groups.some((g) =>
        isTintableMaterial(material[g.materialIndex])
      );
    })();
    const mesh = new THREE.InstancedMesh(geometry, material, keys.length);
    if (owned) mesh.userData.ownedMaterial = true;
    finalizeInstancedMesh(mesh, id, blockData, material);

    let renderCount = 0;
    const color = new THREE.Color();
    const property =
      baseId === 'water' || id.startsWith('water_') ? 'waterColor' : 'color';

    for (const key of keys) {
      const coords = chunk.world.keyToCoords(key);
      const ax = coords[0],
        ay = coords[1],
        az = coords[2];

      if (
        shouldSkipChunkBlockInstance({
          world: chunk.world,
          id: baseId,
          blockData,
          ax,
          ay,
          az,
          isNear,
        })
      )
        continue;

      tempPos.set(ax - worldX, ay - worldY, az - worldZ);

      // Sinking plants on shortened blocks (path, farmland)
      if (isDecoType(blockData)) {
        const below = chunk.world.state.blockMap.get(
          chunk.world.getKey(ax, ay - 1, az)
        );
        if (below === 'path_block' || below === 'dirt_path' || below === 'farmland') {
          tempPos.y -= 0.0625; // 1/16 height
        }
      }
      tempEuler.set(0, 0, 0);

      if (lodFar) {
        tempEuler.y = Math.atan2(camPos.x - ax, camPos.z - az);
      } else {
        if (id === 'water_side_nx') tempEuler.y = Math.PI / 2;
        else if (id === 'water_side_px') tempEuler.y = -Math.PI / 2;
        else if (id === 'water_side_nz') tempEuler.y = Math.PI;
        else if (id === 'water_bottom') tempEuler.x = Math.PI / 2;

        if (id.includes(':x')) tempEuler.z = Math.PI / 2;
        else if (id.includes(':z')) tempEuler.x = Math.PI / 2;

        // Cardinal Orientation (_n, _s, _w, _e suffixes)
        if (id.includes('_n')) tempEuler.y = Math.PI;
        else if (id.includes('_e')) tempEuler.y = Math.PI / 2;
        else if (id.includes('_w')) tempEuler.y = -Math.PI / 2;
        else if (id.includes('_s')) tempEuler.y = 0;
      }

      tempQuat.setFromEuler(tempEuler);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      mesh.setMatrixAt(renderCount, tempMatrix);

      if (isTintable) {
        const hex = chunk.world.terrain.getBlendedColor(ax, az, property);
        color.setHex(hex);
        mesh.setColorAt(renderCount, color);
      }
      renderCount += 1;
    }

    if (renderCount === 0) {
      if (owned) {
        if (Array.isArray(mesh.material)) {
          for (const m of mesh.material) {
            if (typeof m?.dispose === 'function') m.dispose();
          }
        } else if (typeof mesh.material?.dispose === 'function') {
          mesh.material.dispose();
        }
      }
      mesh.dispose?.();
      return;
    }

    mesh.count = renderCount;
    mesh.instanceMatrix.needsUpdate = true;
    if (isTintable) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.frustumCulled = true;
    const meshKey = lodFar ? `${id}_lod` : id;
    chunk.instancedMeshes.set(meshKey, mesh);
    chunk.group.add(mesh);
  };

  for (const [id, keys] of byType.entries()) {
    try {
      const baseId = id.startsWith('water')
        ? 'water'
        : normalizeBlockVariantId(id);
      const blockData = chunk.world.getBlockData(baseId);
      if (shouldSkipStandaloneTypeRender(blockData)) continue;

      const baseMaterial = chunk.world.blockRegistry.getMaterial(baseId);
      const specialized = specializeMaterial(baseMaterial);
      if (!specialized) {
        console.warn(
          `[ArloCraft] No material for block "${baseId}" — skipping mesh (chunk ${chunk.cx},${chunk.cy},${chunk.cz})`
        );
        continue;
      }
      const { material, owned } = specialized;
      if (!material) continue;

      if (isDecoType(blockData)) {
        const nearKeys = [],
          farKeys = [];
        for (const key of keys) {
          const coords = chunk.world.keyToCoords(key);
          const dx = coords[0] - camPos.x,
            dz = coords[2] - camPos.z;
          if (dx * dx + dz * dz > DECO_LOD_DIST_SQ) farKeys.push(key);
          else nearKeys.push(key);
        }
        const crossGeo = resolveChunkGeometry(chunk.world, id, blockData);
        if (crossGeo && nearKeys.length > 0)
          buildMesh(
            id,
            baseId,
            nearKeys,
            crossGeo,
            material,
            owned,
            blockData,
            false
          );

        if (farKeys.length > 0) {
          const lodGeo = resolveLODGeometry(chunk.world, blockData);
          if (lodGeo) {
            const { material: lodMat, owned: lodOwned } =
              specializeMaterial(baseMaterial);
            if (lodMat) {
              const mats = Array.isArray(lodMat) ? lodMat : [lodMat];
              for (const m of mats) {
                if (m) m.side = THREE.DoubleSide;
              }
              buildMesh(
                id,
                baseId,
                farKeys,
                lodGeo,
                lodMat,
                lodOwned,
                blockData,
                true
              );
            }
          }
        }
      } else {
        const geometry = resolveChunkGeometry(chunk.world, id, blockData);
        if (!geometry) continue;
        buildMesh(
          id,
          baseId,
          keys,
          geometry,
          material,
          owned,
          blockData,
          false
        );
      }
    } catch (err) {
      console.error(
        `[ArloCraft] Chunk mesh error for block "${id}" — skipping (other blocks unaffected):`,
        err
      );
    }
  }

  if (chunk.world.game) {
    chunk.world.game._lastMeshMs = performance.now() - startTime;
  }
}
