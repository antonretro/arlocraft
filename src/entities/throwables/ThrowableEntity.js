import * as THREE from 'three';

/**
 * ThrowableEntity
 * Base class for all physics-based projectiles.
 */
export class ThrowableEntity {
  constructor(game, type, owner, position, velocity) {
    this.game = game;
    this.type = type;
    this.owner = owner;
    this.position = position.clone();
    this.velocity = velocity.clone();

    // Physics constants (can be overridden by subclasses)
    this.gravity = new THREE.Vector3(0, -18, 0);
    this.drag = 0.99; // Air resistance

    this.dead = false;
    this.age = 0;
    this.maxAge = 10; // seconds

    // Visuals
    this.mesh = this.createMesh();
    if (this.mesh) {
      this.game.renderer.scene.add(this.mesh);
      this.mesh.position.copy(this.position);
    }

    // Raycaster for impact detection
    this.raycaster = new THREE.Raycaster();
    this.lastPosition = this.position.clone();
  }

  createMesh() {
    // Default sphere mesh
    const geometry = new THREE.SphereGeometry(0.15, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    return new THREE.Mesh(geometry, material);
  }

  update(delta) {
    if (this.dead) return;

    this.age += delta;
    if (this.age > this.maxAge) {
      this.destroy();
      return;
    }

    this.lastPosition.copy(this.position);

    // Apply physics
    this.velocity.addScaledVector(this.gravity, delta);
    this.velocity.multiplyScalar(Math.pow(this.drag, delta * 60)); // Resolution independent drag

    this.position.addScaledVector(this.velocity, delta);

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      // Optional: Rotate mesh to face direction of travel
      // this.mesh.lookAt(this.position.clone().add(this.velocity));
    }

    this.checkCollisions(delta);
  }

  checkCollisions(delta) {
    const moveDir = new THREE.Vector3().subVectors(
      this.position,
      this.lastPosition
    );
    const distance = moveDir.length();
    if (distance < 0.001) return;

    const normalizedDir = moveDir.clone().normalize();
    this.raycaster.set(this.lastPosition, normalizedDir);

    // 1. Check World Blocks (DDA voxel walk along this frame's movement)
    const worldHit = this.game.world.raycastBlocks?.(
      { position: this.lastPosition },
      distance,
      false,
      this.lastPosition,
      normalizedDir
    );
    if (worldHit) {
      // Impact just outside the block that was hit.
      this.onImpact(this.lastPosition.clone(), 'block', worldHit);
      return;
    }

    // 2. Mob-fired projectiles can hit the player.
    if (this.owner?.config && this.hitsPlayer()) {
      this.onImpact(this.position.clone(), 'player', null);
      return;
    }

    // 3. Check Entities (using EntityManager's optimized broadphase/hitbox logic)
    const entityHit = this.game.entities.findEntityInCrosshair(
      {
        instance: { position: this.lastPosition },
        raycaster: { ray: this.raycaster.ray },
      },
      distance,
      (e) => e !== this.owner && !e.dead
    );

    if (entityHit) {
      this.onImpact(entityHit.entity.mesh.position, 'entity', entityHit);
    }
  }

  hitsPlayer() {
    const eye = this.game.camera?.instance?.position;
    if (!eye) return false;
    // Player body: ~0.35 radius column from the feet up to the eye.
    for (const t of [0.5, 1]) {
      const x = THREE.MathUtils.lerp(this.lastPosition.x, this.position.x, t);
      const y = THREE.MathUtils.lerp(this.lastPosition.y, this.position.y, t);
      const z = THREE.MathUtils.lerp(this.lastPosition.z, this.position.z, t);
      const dx = x - eye.x;
      const dz = z - eye.z;
      if (
        dx * dx + dz * dz < 0.45 * 0.45 &&
        y < eye.y + 0.25 &&
        y > eye.y - 1.7
      )
        return true;
    }
    return false;
  }

  onImpact(point, targetType, hitDetail) {
    if (this.dead) return;
    this.dead = true;

    if (targetType === 'player') {
      const damage = this.playerDamage ?? 1;
      if (damage > 0) this.game.gameState?.takeDamage?.(damage);
      this.game.physics?.applyKnockback?.(this.velocity, 1.6, 0.2);
      this.game.audio?.play('player-damaged');
      this.destroy();
      return;
    }

    this.playImpactEffects(point, targetType, hitDetail);
    this.destroy();
  }

  playImpactEffects(point, targetType, hitDetail) {
    // Default impact logic
    this.game.audio?.play('impact');
    // TODO: Spawn particles
  }

  destroy() {
    this.dead = true;
    if (this.mesh) {
      this.game.renderer.scene.remove(this.mesh);
      this.mesh.traverse((node) => {
        if (node.geometry?.dispose) node.geometry.dispose();
        if (Array.isArray(node.material)) {
          for (const material of node.material) {
            if (material?.dispose) material.dispose();
          }
        } else if (node.material?.dispose) {
          node.material.dispose();
        }
      });
      this.mesh = null;
    }
  }
}
