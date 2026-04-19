import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TOOLS } from '../data/tools.js';
import { FOOD_VALUES } from '../engine/SurvivalSystem.js';
import { normalizeBlockVariantId } from '../data/blockIds.js';

const itemTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/item/*.png', { eager: true, query: '?url' });
const ITEM_TEXTURES = new Map();
for (const [path, module] of Object.entries(itemTextureModules)) {
    const fileName = path.split('/').pop().replace('.png', '');
    ITEM_TEXTURES.set(fileName, module.default || module);
}

const blockTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/block/*.png', { eager: true, query: '?url' });
const BLOCK_TEXTURES = new Map();
for (const [path, module] of Object.entries(blockTextureModules)) {
    const fileName = path.split('/').pop().replace('.png', '');
    BLOCK_TEXTURES.set(fileName, module.default || module);
}

const TOOL_MAP = {
    // Basic Tools (ArloCraft IDs)
    'pick_wood': 'wooden_pickaxe',
    'axe_wood': 'wooden_axe',
    'sword_wood': 'wooden_sword',
    'shovel_wood': 'wooden_shovel',
    'hoe_wood': 'wooden_hoe',
    'pick_stone': 'stone_pickaxe',
    'axe_stone': 'stone_axe',
    'sword_stone': 'stone_sword',
    
    // Feature Tools / Tech Gear
    'sledge_iron': 'iron_pickaxe',
    'iron_pick': 'iron_pickaxe',
    'iron_sword': 'iron_sword',
    'power_blade': 'netherite_sword',
    'glitch_saber': 'diamond_sword',
    'byte_axe': 'diamond_axe',
    'echo_dagger': 'iron_sword',
    'arc_spear': 'trident',
    'plasma_hammer': 'netherite_axe',
    'data_drill': 'diamond_pickaxe',
    
    // Legacy / Type Fallbacks
    'pick': 'wooden_pickaxe',
    'sword': 'wooden_sword',
    'axe': 'wooden_axe',
    'shovel': 'wooden_shovel',
    'hoe': 'wooden_hoe',

    // Items & Food
    'tomato': 'apple',
    'blueberry': 'sweet_berries',
    'strawberry': 'sweet_berries',
    'carrot': 'carrot',
    'potato': 'potato',
    'iron_ingot': 'iron_ingot',
    'gold_ingot': 'gold_ingot',
    'diamond': 'diamond',
    'stick': 'stick',
    'musket': 'musket',
    'pistol': 'pistol',
    'blunderbuss': 'blunderbuss',
    'hoe_wood': 'wooden_hoe',
    'hoe_stone': 'stone_hoe',
    'hoe_iron': 'iron_hoe',
    'bone_meal': 'bone_meal'
};
const GRASS_PREVIEW_TINT = 0x79c05a;

/**
 * Animated First-Person Viewmodel (Player Hand).
 * Handles arm mesh, held items, and procedural animations for walking/swinging.
 */
export class PlayerHand {
    constructor() {
        this.group = new THREE.Group();
        this.group.position.set(0.65, -0.55, -0.75); // Natural FPS position
        this.group.rotation.set(0.1, -0.4, 0);

        // Arm Mesh (Textured with Player Skin) - Proportions: 4x12x4 (Minecraft ratio)
        this.armGeometry = new THREE.BoxGeometry(0.21, 0.63, 0.21);
        this.armGeometry.rotateX(Math.PI / 2); // Map Top (Shoulder) to Z+ and Bottom (Hand) to Z-
        
        this.armMaterial = new THREE.MeshLambertMaterial({ color: 0x4a9eff }); // Initial Anton Blue
        this.arm = new THREE.Mesh(this.armGeometry, this.armMaterial);
        this.arm.rotation.y = 0; // Point away from player
        this.arm.position.set(0, 0, 0.3); // Push forward
        this.group.add(this.arm);

        // Item Slot (Where blocks/tools are held)
        this.itemSlot = new THREE.Group();
        this.itemSlot.position.set(0, 0.15, -0.6); // Slightly further forward
        this.itemSlot.rotation.set(0.4, -0.2, 0); // Point forward naturally
        this.group.add(this.itemSlot);

        this.heldItemMesh = null;
        this.swingTime = 0;
        this.swingType = 'CHOP';
        this.bobCycle = 0;
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
        this.canvas = document.createElement('canvas'); // For pixel reading
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.geometryCache = new Map(); // Cache for merged voxel geometries
        this.lastParentRot = new THREE.Euler();
        this.swayOffset = new THREE.Vector2();
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
            const mesh = this.createVoxelMesh(url);
            mesh.position.set(0, 0.25, -0.1);
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

    createVoxelMesh(url) {
        const group = new THREE.Group();
        const loader = new THREE.TextureLoader();
        
        loader.load(url, (texture) => {
            const img = texture.image;
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            this.ctx.clearRect(0, 0, img.width, img.height);
            this.ctx.drawImage(img, 0, 0);
            
            const imageData = this.ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            const w = img.width;
            const h = img.height;
            
            const boxGeo = new THREE.BoxGeometry(1/w, 1/h, 1/16); // 1-pixel depth relative to size
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            const mat = new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.5 });
            
            const front = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat);
            front.position.z = 0.025;
            group.add(front);

            const back = front.clone();
            back.rotation.y = Math.PI;
            back.position.z = -0.025;
            group.add(back);

            // Pixel Extrusion (Minecraft style 3D depth) - Optimized with Merging
            const pixelW = 0.7 / w;
            const pixelH = 0.7 / h;
            // Sample average color from opaque pixels for edge tint
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] >= 128) { rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; count++; }
            }
            const edgeColor = count > 0
                ? new THREE.Color(rSum/count/255, gSum/count/255, bSum/count/255).multiplyScalar(0.6)
                : new THREE.Color(0x555555);
            const sideMat = new THREE.MeshLambertMaterial({ color: edgeColor });
            
            // Check cache first
            if (this.geometryCache.has(url)) {
                const cachedGeo = this.geometryCache.get(url);
                const sideMesh = new THREE.Mesh(cachedGeo, sideMat);
                group.add(sideMesh);
                return;
            }

            const edgeGeometries = [];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const alpha = data[idx + 3];
                    if (alpha < 128) continue;

                    const up = y > 0 ? data[((y - 1) * w + x) * 4 + 3] : 0;
                    const down = y < h - 1 ? data[((y + 1) * w + x) * 4 + 3] : 0;
                    const left = x > 0 ? data[(y * w + (x - 1)) * 4 + 3] : 0;
                    const right = x < w - 1 ? data[(y * w + (x + 1)) * 4 + 3] : 0;

                    if (up < 128 || down < 128 || left < 128 || right < 128) {
                        const posX = (x / w - 0.5) * 0.7 + (pixelW * 0.5);
                        const posY = (0.5 - y / h) * 0.7 - (pixelH * 0.5);
                        
                        const geo = new THREE.BoxGeometry(pixelW, pixelH, 0.04);
                        geo.translate(posX, posY, 0);
                        edgeGeometries.push(geo);
                    }
                }
            }

            if (edgeGeometries.length > 0) {
                const mergedGeo = BufferGeometryUtils.mergeGeometries(edgeGeometries);
                const sideMesh = new THREE.Mesh(mergedGeo, sideMat);
                group.add(sideMesh);
                
                // Store in cache for next time
                this.geometryCache.set(url, mergedGeo);
                
                // Cleanup individual geometries
                edgeGeometries.forEach(g => g.dispose());
            }
        });

        group.userData.ownedGeometry = true;
        group.userData.ownedMaterial = true;
        return group;
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

        const normalizedId = normalizeBlockVariantId(itemId);
        const tool = this.toolById.get(normalizedId);
        const blockConfig = registry.blocks.get(normalizedId);
        const isTool = selectedItem?.kind === 'tool' || Boolean(tool);
        
        // Determine Swing Type
        if (isTool) {
            if (itemId.includes('sword') || itemId.includes('blade') || itemId.includes('dagger')) this.swingType = 'SLASH';
            else if (itemId.includes('pick') || itemId.includes('axe') || itemId.includes('hammer') || itemId.includes('drill')) this.swingType = 'CHOP';
            else if (itemId.includes('musket') || itemId.includes('pistol') || itemId.includes('blunderbuss')) this.swingType = 'RECOIL';
            else this.swingType = 'CHOP';
        } else {
            this.swingType = 'SHAKE';
        }
        const isDeco = blockConfig?.deco;
        const isFood = Boolean(FOOD_VALUES[itemId] || itemId === 'milk_bucket');
        const isItem = isTool || isDeco || isFood || itemId.includes('bucket');

        let textureKey = blockConfig?.textureId || normalizedId;
        if (blockConfig?.pairId && typeof textureKey === 'string' && textureKey.endsWith('_bottom')) {
            const pairTextureKey = registry.blocks.get(blockConfig.pairId)?.textureId;
            if (pairTextureKey) textureKey = pairTextureKey;
        }

        if (isItem) {
            let texName = textureKey;
            
            if (isTool) {
                if (tool?.type && TOOL_MAP[tool.type]) texName = TOOL_MAP[tool.type];
                else if (tool?.id && TOOL_MAP[tool.id]) texName = TOOL_MAP[tool.id];
            } else if (isFood) {
                if (TOOL_MAP[itemId]) texName = TOOL_MAP[itemId];
            } else if (itemId.includes('bucket')) {
                texName = itemId;
            }

            const url = ITEM_TEXTURES.get(texName) || ITEM_TEXTURES.get(normalizedId) || BLOCK_TEXTURES.get(texName);

            if (url || isDeco) {
                let texture;
                if (url) {
                    texture = new THREE.TextureLoader().load(url);
                } else {
                    // Fallback to block texture if no item texture found
                    const mat = registry.getMaterial(normalizedId);
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
                    
                    const mesh = this.createVoxelMesh(url || texture.image.src);
                    mesh.position.set(0, 0.25, -0.1);
                    
                    if (textureKey === 'grass' || textureKey.includes('grass') || textureKey.includes('fern') || textureKey.includes('leaves')) {
                         mesh.traverse(child => { if (child.material) child.material.color?.set(0x79c05a); });
                    }

                    this.itemSlot.add(mesh);
                    this.heldItemMesh = mesh;
                    return;
                }
            }

            if (isTool) {
                const mesh = tool?.type === 'gun' ? this.buildGunMesh(tool) : this.buildToolMesh(tool ?? { id: normalizedId });
                this.itemSlot.add(mesh);
                this.heldItemMesh = mesh;
                return;
            }
        }

        // Try to get a block mesh from the registry
        const sourceMaterial = registry.getMaterial(normalizedId);
        const material = Array.isArray(sourceMaterial)
            ? sourceMaterial.map((mat) => (mat?.clone ? mat.clone() : mat))
            : (sourceMaterial?.clone ? sourceMaterial.clone() : sourceMaterial);
        const tintColor = new THREE.Color(GRASS_PREVIEW_TINT);
        const applyTint = (m) => { if (m?.userData?.tintable) m.color.copy(tintColor); };
        if (Array.isArray(material)) material.forEach(applyTint);
        else applyTint(material);
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
        // Item Sway (Procedural weight/inertia)
        const parent = this.group.parent;
        if (parent) {
            const rotDeltaX = (parent.rotation.x - this.lastParentRot.x);
            const rotDeltaY = (parent.rotation.y - this.lastParentRot.y);
            
            // Limit deltas to avoid massive snaps on wrap-around
            const safeDX = Math.abs(rotDeltaX) > 1 ? 0 : rotDeltaX;
            const safeDY = Math.abs(rotDeltaY) > 1 ? 0 : rotDeltaY;

            this.swayOffset.x = THREE.MathUtils.lerp(this.swayOffset.x, safeDY * 0.45, delta * 10);
            this.swayOffset.y = THREE.MathUtils.lerp(this.swayOffset.y, safeDX * 0.45, delta * 10);
            
            this.lastParentRot.copy(parent.rotation);
        }

        // Apply animations
        if (isMoving) {
            this.bobCycle = bobCycle;
            const bobX = (Math.sin(this.bobCycle * 0.5) * 0.014) + this.swayOffset.x;
            const bobY = (Math.abs(Math.cos(this.bobCycle)) * 0.018) + this.swayOffset.y;
            this.group.position.x = 0.65 + bobX;
            this.group.position.y = -0.62 + bobY;
        } else {
            // Idle breathing
            const breathe = Math.sin(performance.now() * 0.002) * 0.015;
            this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, -0.55 + breathe + this.swayOffset.y, delta * 4);
            this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, 0.65 + this.swayOffset.x, delta * 4);
        }

        // Action Swing Animation
        if (this.swingTime > 0) {
            this.swingTime -= delta;
            const t = 1 - (this.swingTime / 0.35); // 0 to 1
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            if (this.swingType === 'SLASH') {
                const angle = (eased * Math.PI * 1.2) - (Math.PI / 2);
                this.group.rotation.y = -0.4 + Math.sin(angle) * 1.5;
                this.group.rotation.z = Math.cos(angle) * 0.8;
                this.group.position.x = 0.65 + Math.sin(angle) * 0.4;
            } else if (this.swingType === 'CHOP') {
                const chop = Math.sin(t * Math.PI);
                this.group.rotation.x = 0.1 - chop * 1.6;
                this.group.position.z = -0.75 - chop * 0.4;
            } else if (this.swingType === 'RECOIL') {
                const recoil = Math.sin(t * Math.PI * 0.5); // Peak at the very start
                const snap = Math.pow(1 - t, 4); // Quick recovery 
                this.group.position.z = -0.75 + (snap * 0.25);
                this.group.rotation.x = 0.1 - (snap * 0.6);
            } else {
                // SHAKE (Blocks)
                const shake = Math.sin(t * Math.PI * 2) * 0.15;
                this.group.position.x = 0.65 + shake;
                this.group.rotation.z = shake * 0.5;
            }
        } else {
            this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, -0.75, delta * 6);
            this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0.1, delta * 6);
            this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, -0.4, delta * 6);
            this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, 0, delta * 6);
        }
    }

    updateArmSkin(armMaterials) {
        if (!armMaterials) return;
        this.arm.material = armMaterials;
        armMaterials.forEach(m => { m.needsUpdate = true; });
    }
}
