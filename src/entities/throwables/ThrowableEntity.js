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

    // 1. Check World Blocks
    const worldHit = this.game.world.interaction.raycastBlocks(
      this.lastPosition,
      normalizedDir,
      distance
    );
    if (worldHit) {
      this.onImpact(worldHit.point, 'block', worldHit);
      return;
    }

    // 2. Check Entities (using EntityManager's optimized broadphase/hitbox logic)
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

  onImpact(point, targetType, hitDetail) {
    if (this.dead) return;
    this.dead = true;

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
