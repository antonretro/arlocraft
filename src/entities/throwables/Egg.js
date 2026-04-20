import * as THREE from 'three';
import { ThrowableEntity } from './ThrowableEntity.js';

export class Egg extends ThrowableEntity {
  constructor(game, owner, position, velocity) {
    super(game, 'egg', owner, position, velocity);
  }

  createMesh() {
    const geometry = new THREE.SphereGeometry(0.12, 6, 6);
    const material = new THREE.MeshBasicMaterial({ color: 0xf0e0d0 }); // Egg-like beige
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(0.8, 1, 0.8); // Slightly oval
    return mesh;
  }

  playImpactEffects(point, targetType, hitDetail) {
    super.playImpactEffects(point, targetType, hitDetail);

    // Break effect
    this.game.particles?.spawnBurst(point, 'SMOKE', 8, 0.15);

    // Minecraft mechanic: 1/8 chance to spawn a chicken
    if (Math.random() < 0.125) {
      console.log('[Egg] Spawned a chicken!');
      this.game.entities.spawn('chicken', point.x, point.y + 0.5, point.z);
    }
  }
}
