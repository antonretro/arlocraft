import * as THREE from 'three';
import { ThrowableEntity } from './ThrowableEntity.js';

export class Snowball extends ThrowableEntity {
    constructor(game, owner, position, velocity) {
        super(game, 'snowball', owner, position, velocity);
    }

    createMesh() {
        const geometry = new THREE.SphereGeometry(0.12, 6, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        return new THREE.Mesh(geometry, material);
    }

    playImpactEffects(point, targetType, hitDetail) {
        super.playImpactEffects(point, targetType, hitDetail);
        
        // Spawn snow particles on impact
        this.game.particles?.spawnBurst(point, 'SNOW', 10, 0.2);

        if (targetType === 'entity') {
            // Snowballs deal 0 damage but apply knockback in Minecraft
            // (Exception: Blazes and Endermen, which we can add later)
            hitDetail.entity.takeDamage(0, this.position, 0.4);
        }
    }
}
