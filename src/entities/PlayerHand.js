import * as THREE from 'three';
import { TOOLS } from '../data/tools.js';

/**
 * Animated First-Person Viewmodel (Player Hand).
 * Handles arm mesh, held items, and procedural animations for walking/swinging.
 */
export class PlayerHand {
    constructor() {
        this.group = new THREE.Group();
        this.group.position.set(0.65, -0.55, -0.75); // Natural FPS position
        this.group.rotation.set(0.1, -0.4, 0);

        // Arm Mesh
        this.armGeometry = new THREE.BoxGeometry(0.35, 0.35, 1.2);
        this.armMaterial = new THREE.MeshLambertMaterial({ color: 0x4a9eff }); // Arlo Blue
        this.arm = new THREE.Mesh(this.armGeometry, this.armMaterial);
        this.arm.position.set(0, 0, 0.4);
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
        const model = new THREE.Group();
        const handleMat = new THREE.MeshLambertMaterial({ color: 0x6f4b2b });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xb7c3d0, emissive: 0x111111 });

        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), handleMat.clone());
        handle.position.set(-0.03, -0.08, 0.00);
        handle.userData.ownedGeometry = true;
        handle.userData.ownedMaterial = true;

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.08), headMat.clone());
        head.position.set(0.08, 0.08, 0.00);
        head.userData.ownedGeometry = true;
        head.userData.ownedMaterial = true;

        model.add(handle);
        model.add(head);
        model.rotation.set(0.25, -0.25, -0.25);
        model.position.set(0.04, -0.02, 0.00);
        handleMat.dispose();
        headMat.dispose();
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
        const isTool = selectedItem?.kind === 'tool' || Boolean(tool);
        if (isTool) {
            const mesh = tool?.type === 'gun' ? this.buildGunMesh(tool) : this.buildToolMesh(tool ?? { id: itemId });
            this.itemSlot.add(mesh);
            this.heldItemMesh = mesh;
            return;
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
}
