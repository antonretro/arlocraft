import * as THREE from 'three';
import { ThrowableEntity } from './ThrowableEntity.js';

export class EnderPearl extends ThrowableEntity {
  constructor(game, owner, position, velocity) {
    super(game, 'ender_pearl', owner, position, velocity);
    // Ender pearls are heavier and fly slower in some versions, but we'll stick to default gravity
    this.drag = 0.98;
  }

  createMesh() {
    const geometry = new THREE.SphereGeometry(0.14, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0x0a3c2a }); // Dark teal
    return new THREE.Mesh(geometry, material);
  }

  playImpactEffects(point, targetType, hitDetail) {
    super.playImpactEffects(point, targetType, hitDetail);

    // Ender effect
    this.game.particles?.spawnBurst(point, 'PORTAL', 25, 0.4);

    // Teleport the player
    if (this.game.physics) {
      console.log('[EnderPearl] Teleporting player to:', point);
      // Move player slightly above impact to avoid getting stuck
      this.game.physics.position.set(point.x, point.y + 1.8, point.z);
      this.game.audio?.play('tp');
      this.game.notifications?.add('Swoooop!', 'success');
    }
  }
}
