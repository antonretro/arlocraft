import * as THREE from 'three';
import { RENDER_LAYERS, materialIsTransparent, materialUsesBlendTransparency } from '../../rendering/RenderConfig.js';
import { resolveChunkGeometry, shouldSkipChunkBlockInstance, shouldSkipStandaloneTypeRender } from './renderTypes.js';

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

function collectBlocksByType(chunk) {
    const byType = new Map();
    const add = (id, key) => {
        if (!byType.has(id)) byType.set(id, []);
        byType.get(id).push(key);
    };

    for (const key of chunk.blockKeys) {
        const id = chunk.world.state.blockMap.get(key);
        if (!id) continue;

        if (id === 'water') {
            const [ax, ay, az] = chunk.world.keyToCoords(key);
            
            // Seamless water: Only add faces if neighbor is NOT water
            const above = chunk.world.state.blockMap.get(chunk.world.getKey(ax, ay + 1, az));
            if (above !== 'water') add('water_top', key);

            const below = chunk.world.state.blockMap.get(chunk.world.getKey(ax, ay - 1, az));
            if (below !== 'water' && below !== 'bedrock' && below !== 'stone') add('water_bottom', key);

            const nx = chunk.world.state.blockMap.get(chunk.world.getKey(ax + 1, ay, az));
            if (nx !== 'water' && !chunk.world.blocks.isSolid(nx)) add('water_side_nx', key);

            const px = chunk.world.state.blockMap.get(chunk.world.getKey(ax - 1, ay, az));
            if (px !== 'water' && !chunk.world.blocks.isSolid(px)) add('water_side_px', key);

            const nz = chunk.world.state.blockMap.get(chunk.world.getKey(ax, ay, az + 1));
            if (nz !== 'water' && !chunk.world.blocks.isSolid(nz)) add('water_side_nz', key);

            const pz = chunk.world.state.blockMap.get(chunk.world.getKey(ax, ay, az - 1));
            if (pz !== 'water' && !chunk.world.blocks.isSolid(pz)) add('water_side_pz', key);
            
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

    const cx = chunk.cx * chunk.world.chunkSize + Math.floor(chunk.world.chunkSize / 2);
    const cz = chunk.cz * chunk.world.chunkSize + Math.floor(chunk.world.chunkSize / 2);
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

    chunk.resyncBlockKeysFromWorld();
    clearInstancedMeshes(chunk);

    const byType = collectBlocksByType(chunk);
    const temp = new THREE.Object3D();
    const worldX = chunk.cx * chunk.world.chunkSize;
    const worldZ = chunk.cz * chunk.world.chunkSize;
    const cam = chunk.world?.game?.camera?.instance;
    const camPos = cam ? cam.position : new THREE.Vector3(0, 0, 0);
    const isNear = Math.abs(chunk.cx - chunk.world.getChunkCoord(camPos.x)) <= 2 &&
        Math.abs(chunk.cz - chunk.world.getChunkCoord(camPos.z)) <= 2;

    for (const [id, keys] of byType.entries()) {
        const baseId = id.startsWith('water') ? 'water' : id.split(':')[0];
        const blockData = chunk.world.getBlockData(baseId);
        if (shouldSkipStandaloneTypeRender(blockData)) continue;

        const geometry = resolveChunkGeometry(chunk.world, id, blockData);
        if (!geometry) continue;

        const baseMaterial = chunk.world.blockRegistry.getMaterial(baseId);
        const { material, owned } = specializeMaterial(baseMaterial);
        if (!material) continue;

        const isTintable = Array.isArray(material) ? material.some(isTintableMaterial) : isTintableMaterial(material);

        const mesh = new THREE.InstancedMesh(geometry, material, keys.length);
        if (owned) mesh.userData.ownedMaterial = true;
        finalizeInstancedMesh(mesh, id, blockData, material);

        let renderCount = 0;
        const color = new THREE.Color();
        const property = baseId === 'water' ? 'waterColor' : 'color';
        for (const key of keys) {
            const [ax, ay, az] = chunk.world.keyToCoords(key);
            if (shouldSkipChunkBlockInstance({
                world: chunk.world,
                id: baseId,
                blockData,
                ax,
                ay,
                az,
                isNear
            })) {
                continue;
            }

            const lx = ax - worldX;
            const ly = ay;
            const lz = az - worldZ;
            if (!Number.isFinite(lx) || !Number.isFinite(ly) || !Number.isFinite(lz)) continue;

            temp.position.set(lx, ly, lz);
            temp.rotation.set(0, 0, 0);
            temp.scale.set(1, 1, 1);

            // Special Handle: Water orientations
            if (id === 'water_side_nx') temp.rotation.y = Math.PI / 2;
            else if (id === 'water_side_px') temp.rotation.y = -Math.PI / 2;
            else if (id === 'water_side_nz') temp.rotation.y = Math.PI;
            else if (id === 'water_bottom') temp.rotation.x = Math.PI / 2;
            
            // Special Handle: Log Axis
            if (id.includes(':x')) {
                temp.rotation.z = Math.PI / 2;
            } else if (id.includes(':z')) {
                temp.rotation.x = Math.PI / 2;
            }

            if (id.includes('_stairs')) {
                if (id.endsWith('_n')) temp.rotation.y = Math.PI;
                else if (id.endsWith('_e')) temp.rotation.y = Math.PI / 2;
                else if (id.endsWith('_w')) temp.rotation.y = -Math.PI / 2;
            }

            temp.updateMatrix();
            mesh.setMatrixAt(renderCount, temp.matrix);

            if (isTintable) {
                const hex = chunk.world.terrain.getBlendedColor(ax, az, property);
                color.setHex(hex);
                mesh.setColorAt(renderCount, color);
            }

            renderCount += 1;
        }

        if (renderCount === 0) {
            if (mesh.userData?.ownedMaterial) {
                if (Array.isArray(mesh.material)) {
                    for (const entry of mesh.material) {
                        if (typeof entry?.dispose === 'function') entry.dispose();
                    }
                } else if (typeof mesh.material?.dispose === 'function') {
                    mesh.material.dispose();
                }
            }
            mesh.dispose?.();
            continue;
        }

        mesh.count = renderCount;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        mesh.frustumCulled = false;
        chunk.instancedMeshes.set(id, mesh);
        chunk.group.add(mesh);
    }
}
