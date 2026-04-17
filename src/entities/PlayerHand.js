import * as THREE from 'three';
import { TOOLS } from '../data/tools.js';

const itemTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/item/*.png', { eager: true, query: '?url' });
const ITEM_TEXTURES = new Map();
for (const [path, module] of Object.entries(itemTextureModules)) {
    const fileName = path.split('/').pop().replace('.png', '');
    ITEM_TEXTURES.set(fileName, module.default || module);
}

const TOOL_MAP = {
    'pick': 'wooden_pickaxe',
    'sword': 'wooden_sword',
    'axe': 'wooden_axe',
    'shovel': 'wooden_shovel',
    'hoe': 'wooden_hoe'
};

/**
 * Animated First-Person Viewmodel (Player Hand).
 * Handles arm mesh, held items, and procedural animations for walking/swinging.
 */
export class PlayerHand {
    constructor() {
        this.group = new THREE.Group();
        this.group.position.set(0.65, -0.55, -0.75); // Natural FPS position
        this.group.rotation.set(0.1, -0.4, 0);

        // Arm Mesh (Textured with Player Skin)
        this.armGeometry = new THREE.BoxGeometry(0.24, 0.24, 0.9);
        this.armMaterial = new THREE.MeshLambertMaterial({ color: 0x4a9eff }); // Initial Arlo Blue
        this.arm = new THREE.Mesh(this.armGeometry, this.armMaterial);
        this.arm.position.set(0, 0, 0.35);
        this.group.add(this.arm);

        // Item Slot (Where blocks/tools are held)
        this.itemSlot = new THREE.Group();
        this.itemSlot.position.set(0, 0.15, -0.5);
        this.itemSlot.rotation.set(0.2, 0.5, 0);
        this.group.add(this.itemSlot);

        this.heldItemMesh = null;
        this.swingTime = 0;
        this.bobCycle = 0;
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
    }

    disposeHeldObject(object) {
        if (!object) return;

        while (object.children?.length > 0) {
            const child = object.children[0];
            object.remove(child);
            this.disposeHeldObject(child);
        }

        if (typeof object.geometry?.dispose === 'function') {
            object.geometry.dispose();
        }

        if (Array.isArray(object.material)) {
            for (const mat of object.material) {
                if (typeof mat?.dispose === 'function') mat.dispose();
            }
        } else if (typeof object.material?.dispose === 'function') {
            object.material.dispose();
        }
    }

    buildGunMesh(tool) {
        const model = new THREE.Group();
        const baseColor = tool.id === 'rail_rifle' ? 0x9cb8ff : (tool.id === 'scatter_blaster' ? 0xffb35a : 0x7ee8ff);
        const bodyMat = new THREE.MeshLambertMaterial({ color: baseColor, emissive: 0x121212 });
        const darkMat = new THREE.MeshLambertMaterial({ color: 0x1f2430 });
        const glowMat = new THREE.MeshLambertMaterial({ color: 0x9ff8ff, emissive: 0x246a74 });

        const makePart = (w, h, d, mat, x, y, z) => {
            const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
            part.position.set(x, y, z);
            part.userData.ownedGeometry = true;
            part.userData.ownedMaterial = true;
            model.add(part);
        };

        // Grip
        makePart(0.12, 0.24, 0.12, darkMat, -0.14, -0.10, 0.02);
        // Main body
        makePart(0.42, 0.14, 0.17, bodyMat, 0.02, 0.02, -0.02);
        // Barrel
        makePart(0.28, 0.08, 0.08, darkMat, 0.34, 0.02, -0.02);
        // Sight
        makePart(0.08, 0.05, 0.05, glowMat, 0.10, 0.11, -0.02);

        if (tool.id === 'rail_rifle') {
            makePart(0.24, 0.07, 0.07, glowMat, 0.54, 0.02, -0.02);
            makePart(0.28, 0.10, 0.10, darkMat, -0.18, 0.02, -0.02);
            model.scale.set(1.10, 1.0, 0.92);
        } else if (tool.id === 'scatter_blaster') {
            makePart(0.18, 0.16, 0.20, bodyMat, 0.24, 0.02, -0.02);
            makePart(0.12, 0.10, 0.10, darkMat, 0.43, 0.02, 0.05);
            makePart(0.12, 0.10, 0.10, darkMat, 0.43, 0.02, -0.09);
            model.scale.set(0.98, 1.05, 1.06);
        }

        model.rotation.set(0.10, -0.20, 0.10);
        model.position.set(0.05, -0.03, -0.01);
        bodyMat.dispose();
        darkMat.dispose();
        glowMat.dispose();
        return model;
    }

    buildToolMesh(tool) {
        let texName = tool?.id || 'stick';
        if (tool?.type && TOOL_MAP[tool.type]) texName = TOOL_MAP[tool.type];
        else if (tool?.id && TOOL_MAP[tool.id]) texName = TOOL_MAP[tool.id];

        const url = ITEM_TEXTURES.get(texName) || ITEM_TEXTURES.get('stick');

        if (url) {
            const texture = new THREE.TextureLoader().load(url);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.colorSpace = THREE.SRGBColorSpace;
            const mat = new THREE.MeshLambertMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat);
            mesh.rotation.set(0, -0.6, 0); // Angle it slightly inwards
            mesh.position.set(0.15, 0.25, -0.1);
            mesh.userData.ownedGeometry = true;
            mesh.userData.ownedMaterial = true;
            return mesh;
        }

        // Deep fallback
        const model = new THREE.Group();
        const handleMat = new THREE.MeshLambertMaterial({ color: 0x6f4b2b });
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), handleMat);
        handle.userData.ownedGeometry = true; handle.userData.ownedMaterial = true;
        model.add(handle);
        return model;
    }

    setHeldItem(itemId, registry, selectedItem = null) {
        // Clear previous item
        while (this.itemSlot.children.length > 0) {
            const child = this.itemSlot.children[0];
            this.itemSlot.remove(child);
            try {
                this.disposeHeldObject(child);
            } catch (error) {
                console.warn('[ArloCraft] Held-item cleanup skipped due to disposal error:', error);
            }
        }

        if (!itemId) return;

        const tool = this.toolById.get(itemId);
        const blockConfig = registry.blocks.get(itemId);
        const isTool = selectedItem?.kind === 'tool' || Boolean(tool);
        const isDeco = blockConfig?.deco;

        if (isTool || isDeco) {
            let texName = itemId;
            // Map common block IDs to their item texture names if needed
            if (itemId.startsWith('flower_')) texName = itemId.replace('flower_', '');
            if (itemId === 'grass_tall') texName = 'tall_grass';
            
            if (isTool) {
                if (tool?.type && TOOL_MAP[tool.type]) texName = TOOL_MAP[tool.type];
                else if (tool?.id && TOOL_MAP[tool.id]) texName = TOOL_MAP[tool.id];
            }

            const url = ITEM_TEXTURES.get(texName) || ITEM_TEXTURES.get(itemId);

            if (url || isDeco) {
                let texture;
                if (url) {
                    texture = new THREE.TextureLoader().load(url);
                } else {
                    // Fallback to block texture if no item texture found
                    const mat = registry.getMaterial(itemId);
                    // Handle multi-texture materials (pick a side face usually)
                    texture = Array.isArray(mat) ? (mat[4].map || mat[0].map) : mat.map;
                    if (!texture && Array.isArray(mat)) {
                        // Find any texture in the array
                        texture = mat.find(m => m.map)?.map;
                    }
                }

                if (texture) {
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    texture.colorSpace = THREE.SRGBColorSpace;
                    const mat = new THREE.MeshLambertMaterial({
                        map: texture,
                        transparent: true,
                        alphaTest: 0.1,
                        side: THREE.DoubleSide
                    });
                    
                    // Apply biome tint if it's grass or foliage
                    if (itemId.includes('grass') || itemId.includes('leaves')) {
                        mat.color.set(0x79c05a); // Standard biome green
                    }

                    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat);
                    mesh.rotation.set(0, -0.6, 0);
                    mesh.position.set(0.15, 0.25, -0.1);
                    mesh.userData.ownedGeometry = true;
                    mesh.userData.ownedMaterial = true;
                    this.itemSlot.add(mesh);
                    this.heldItemMesh = mesh;
                    return;
                }
            }

            if (isTool) {
                const mesh = tool?.type === 'gun' ? this.buildGunMesh(tool) : this.buildToolMesh(tool ?? { id: itemId });
                this.itemSlot.add(mesh);
                this.heldItemMesh = mesh;
                return;
            }
        }

        // Try to get a block mesh from the registry
        const sourceMaterial = registry.getMaterial(itemId);
        const material = Array.isArray(sourceMaterial)
            ? sourceMaterial.map((mat) => (mat?.clone ? mat.clone() : mat))
            : (sourceMaterial?.clone ? sourceMaterial.clone() : sourceMaterial);
        const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.ownedGeometry = true;
        mesh.userData.ownedMaterial = true;
        this.itemSlot.add(mesh);
        this.heldItemMesh = mesh;
    }

    swing() {
        if (this.swingTime > 0) return;
        this.swingTime = 0.35; // Duration of one swing
    }

    update(delta, bobCycle, isMoving) {
        // Update bobbing
        if (isMoving) {
            this.bobCycle = bobCycle;
            const bobX = Math.sin(this.bobCycle * 0.5) * 0.04;
            const bobY = Math.abs(Math.cos(this.bobCycle)) * 0.05;
            this.group.position.x = 0.65 + bobX;
            this.group.position.y = -0.62 + bobY;
        } else {
            // Idle breathing
            const breathe = Math.sin(performance.now() * 0.002) * 0.015;
            this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, -0.55 + breathe, delta * 4);
            this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, 0.65, delta * 4);
        }

        // Action Swing Animation
        if (this.swingTime > 0) {
            this.swingTime -= delta;
            const t = 1 - (this.swingTime / 0.35); // 0 to 1
            const swingZ = Math.sin(t * Math.PI) * -0.6;
            const swingRotX = Math.sin(t * Math.PI) * -1.2;
            this.group.position.z = -0.75 + swingZ;
            this.group.rotation.x = 0.1 + swingRotX;
        } else {
            this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, -0.75, delta * 6);
            this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0.1, delta * 6);
        }
    }

    updateArmSkin(armMaterials) {
        if (!armMaterials) return;
        // Three.js BoxGeometry materials order: px, nx, py, ny, pz, nz
        // The SkinLoader returns them in this order.
        this.arm.material = armMaterials;
        this.arm.material.needsUpdate = true;
    }
}
