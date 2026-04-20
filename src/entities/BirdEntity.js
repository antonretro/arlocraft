import * as THREE from 'three';
import { MobEntity } from './MobEntity.js';

/**
 * BirdEntity: A purely aesthetic flying billboard.
 * Soars high in the sky and circles the player.
 */
export class BirdEntity extends MobEntity {
  constructor(game, config, x, y, z) {
    super(game, config, x, y, z);
    this.isBird = true;
    this.hoverOffset = Math.random() * Math.PI * 2;

    // Randomize scale
    const s = 0.4 + Math.random() * 0.4;
    this.mesh.scale.set(s, s, s);
  }

  update(delta) {
    if (this.dead) return;

    // Circular flight path
    const time = performance.now() * 0.001;
    const angle = time * 0.5 + this.hoverOffset;
    const radius = 20 + Math.sin(time * 0.2) * 5;

    const targetX =
      this.game.camera.instance.position.x + Math.cos(angle) * radius;
    const targetZ =
      this.game.camera.instance.position.z + Math.sin(angle) * radius;

    this.mesh.position.x = THREE.MathUtils.lerp(
      this.mesh.position.x,
      targetX,
      delta * 2
    );
    this.mesh.position.z = THREE.MathUtils.lerp(
      this.mesh.position.z,
      targetZ,
      delta * 2
    );
    this.mesh.position.y = 70 + Math.sin(time * 0.8 + this.hoverOffset) * 4;

    // Always face movement direction roughly
    this.mesh.lookAt(targetX, this.mesh.position.y, targetZ);
  }
}
