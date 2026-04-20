import * as THREE from 'three';

export class VirusEnemy {
  constructor(game, config, x, y, z) {
    this.game = game;
    this.config = config;
    this.hp = config.hp;
    this.dead = false;
    this.hitCooldown = 0;
    const playerWalk = this.game?.physics?.walkSpeed ?? 6.2;
    this.maxMoveSpeed = Math.min(Number(config.speed) || 2, playerWalk * 0.55);
    this.moveVelocity = new THREE.Vector3();
    this.tmpDir = new THREE.Vector3();
    this.tmpKnockbackDir = new THREE.Vector3();

    const geometry = config.boss
      ? new THREE.BoxGeometry(1.6, 2.4, 1.6)
      : new THREE.BoxGeometry(0.9, 1.5, 0.9);
    const material = new THREE.MeshLambertMaterial({
      color: config.boss ? 0xff0000 : 0xaa00ff,
      emissive: config.boss ? 0x440000 : 0x24002f,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.hitboxHalf = new THREE.Vector3(
      (geometry.parameters.width ?? 1) * 0.5,
      (geometry.parameters.height ?? 1.6) * 0.5,
      (geometry.parameters.depth ?? 1) * 0.5
    );
    this.isAlly = false;
  }

  canOccupyAt(x, y, z) {
    const half = this.hitboxHalf;
    const minY = y - half.y;
    const maxY = y + half.y;
    const minBlockY = Math.floor(minY - 0.5);
    const maxBlockY = Math.floor(maxY + 0.5);
    const minX = Math.floor(x - half.x - 0.5);
    const maxX = Math.floor(x + half.x + 0.5);
    const minZ = Math.floor(z - half.z - 0.5);
    const maxZ = Math.floor(z + half.z + 0.5);

    for (let by = minBlockY; by <= maxBlockY; by++) {
      const blockMinY = by - 0.5;
      const blockMaxY = by + 0.5;
      if (maxY <= blockMinY || minY >= blockMaxY) continue;
      for (let bx = minX; bx <= maxX; bx++) {
        const dx = x - bx;
        const overlapX = half.x + 0.5 - Math.abs(dx);
        if (overlapX <= 0) continue;
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (!this.game.world.isSolidAt(bx, by, bz)) continue;
          const dz = z - bz;
          const overlapZ = half.z + 0.5 - Math.abs(dz);
          if (overlapZ <= 0) continue;
          return false;
        }
      }
    }
    return true;
  }

  moveWithCollision(dx, dz) {
    if (Math.abs(dx) + Math.abs(dz) < 0.00001) return;

    const ox = this.mesh.position.x;
    const oz = this.mesh.position.z;
    const y = this.mesh.position.y;
    const nx = ox + dx;
    const nz = oz + dz;

    if (this.canOccupyAt(nx, y, nz)) {
      this.mesh.position.x = nx;
      this.mesh.position.z = nz;
      return;
    }

    let moved = false;
    if (this.canOccupyAt(nx, y, oz)) {
      this.mesh.position.x = nx;
      moved = true;
    } else {
      this.moveVelocity.x = 0;
    }

    if (this.canOccupyAt(this.mesh.position.x, y, nz)) {
      this.mesh.position.z = nz;
      moved = true;
    } else {
      this.moveVelocity.z = 0;
    }

    if (!moved) {
      this.moveVelocity.multiplyScalar(0.3);
    }
  }

  update(delta) {
    if (!this.game.physics.isReady || this.dead) return;
    if (this.hitCooldown > 0) {
      this.hitCooldown = Math.max(0, this.hitCooldown - delta);
    }

    const playerPos = this.game.camera.instance.position;
    const dir = this.tmpDir.subVectors(playerPos, this.mesh.position);
    dir.y = 0;
    const dist = dir.length();

    if (dist < 14 && dist > 1.5) {
      if (dir.lengthSq() > 0.0001) dir.normalize();
      const chaseSpeed = Math.min(2.8, this.maxMoveSpeed * 0.62);
      this.moveVelocity.lerp(
        dir.multiplyScalar(chaseSpeed),
        Math.min(1, delta * 7)
      );
      this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
    } else {
      this.moveVelocity.multiplyScalar(Math.max(0, 1 - delta * 8));
    }
    this.moveWithCollision(
      this.moveVelocity.x * delta,
      this.moveVelocity.z * delta
    );

    const halfHeight = this.config.boss ? 1.2 : 0.75;
    const groundY =
      this.game.world.getTerrainHeight(
        this.mesh.position.x,
        this.mesh.position.z
      ) + halfHeight;
    const waterY = this.game.world.getWaterSurfaceYAt(
      this.mesh.position.x,
      this.mesh.position.z
    );
    const targetY =
      waterY === null ? groundY : Math.max(groundY, waterY + halfHeight * 0.2);
    this.mesh.position.y = THREE.MathUtils.lerp(
      this.mesh.position.y,
      targetY,
      Math.min(1, delta * 7)
    );

    if (dist < 1.4 && this.hitCooldown <= 0) {
      const damage = this.config.boss ? 2 : 1;
      this.game.gameState.takeDamage(damage);
      const knock = this.tmpKnockbackDir.subVectors(
        playerPos,
        this.mesh.position
      );
      this.game.physics.applyKnockback(
        knock,
        this.config.boss ? 3.1 : 2.2,
        this.config.boss ? 0.42 : 0.28
      );
      this.hitCooldown = this.config.boss ? 0.9 : 1.25;
    }
  }

  takeDamage(amount, sourcePosition = null, knockback = 0.85) {
    if (this.dead) return;
    this.hp -= amount;

    if (sourcePosition) {
      const away = this.tmpKnockbackDir.subVectors(
        this.mesh.position,
        sourcePosition
      );
      away.y = 0;
      if (away.lengthSq() > 0.0001) {
        away.normalize();
        this.mesh.position.addScaledVector(away, knockback);
      }
    }

    // Red flash effect
    const originalColor = this.mesh.material.color.clone();
    this.mesh.material.color.set(0xff0000); // Pure red flash
    this.mesh.material.emissiveIntensity = 2.0;

    setTimeout(() => {
      if (!this.dead) {
        this.mesh.material.color.copy(originalColor);
        this.mesh.material.emissiveIntensity = 1.0;
      }
    }, 100);

    if (this.hp <= 0) {
      this.die();
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.game.renderer.scene.remove(this.mesh);
    window.dispatchEvent(
      new CustomEvent('enemy-defeated', {
        detail: { id: this.config.id, xp: this.config.xp },
      })
    );
  }
}
