import * as THREE from 'three';

export class Camera {
    constructor(scene) {
        this.instance = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 240);
        this.instance.position.set(0, 5, 0);
        this.instance.rotation.order = 'YXZ'; // FPS style
        this.eyeHeight = 1.32;
        
        // Bobbing Storage
        this.bobOffset = new THREE.Vector3();
        this.viewmodelGroup = new THREE.Group();
        this.instance.add(this.viewmodelGroup);

        scene.add(this.instance);
    }

    update(position, rotation, bobCycle, moveSpeed, eyeHeight = this.eyeHeight) {
        // Apply smooth camera bobbing
        const speedFactor = Math.min(1, moveSpeed / 6);
        this.bobOffset.x = Math.sin(bobCycle * 0.5) * 0.024 * speedFactor;
        this.bobOffset.y = Math.abs(Math.cos(bobCycle)) * 0.045 * speedFactor;
        
        
        this.instance.position.set(
            position.x + this.bobOffset.x,
            position.y + eyeHeight + this.bobOffset.y,
            position.z
        );
        this.instance.rotation.copy(rotation);
        
        // Slight lag on the viewmodel for fluid feel
        this.viewmodelGroup.rotation.y = THREE.MathUtils.lerp(this.viewmodelGroup.rotation.y, (rotation.y - this.instance.rotation.y) * 0.5, 0.1);
    }
}
