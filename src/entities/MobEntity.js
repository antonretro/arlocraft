import * as THREE from 'three';

import { CowModel } from './models/CowModel.js';
import { PigModel } from './models/PigModel.js';
import { SheepModel } from './models/SheepModel.js';
import { ChickenModel } from './models/ChickenModel.js';
import { ZombieModel } from './models/ZombieModel.js';
import { CreeperModel } from './models/CreeperModel.js';
import { SkeletonModel } from './models/SkeletonModel.js';
import { HumanoidModel } from './models/HumanoidModel.js';
import { VillagerModel } from './models/VillagerModel.js';

/**
 * Generic Mob Entity. Now supports high-fidelity 3D Voxel Models or legacy Billboards.
 * Handles movement, simple AI, and combat.
 */
export class MobEntity {
  constructor(game, config, x, y, z) {
    this.game = game;
    this.config = config;
    this.hp = config.hp || 20;
    this.maxHp = this.hp;
    this.dead = false;

    // --- High-Fidelity 3D Model Selection ---
    this.model = this.createModelById(config.id);
    const size = config.boss ? 4.5 : config.heavy ? 2.2 : 1.2;

    if (this.model) {
      this.mesh = this.model.group;
      this.material = this.model.material;
    } else {
      // Legacy Billboard Fallback
      this.geometry = new THREE.PlaneGeometry(size, size);
      const color = this.getMobColor(config.id);
      this.material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.5,
      });
      this.mesh = new THREE.Mesh(this.geometry, this.material);
    }

    this.mesh.position.set(x, y + size / 2, z);
    this.mesh.userData.entity = this;
    this.baseColor = new THREE.Color(this.getMobColor(config.id));
    this.hitboxHalf = new THREE.Vector3(
      Math.max(0.38, size * 0.38),
      Math.max(0.6, size * 0.5),
      Math.max(0.32, size * 0.38)
    );
    this.isAlly = Boolean(config.friendly);

    this.velocity = new THREE.Vector3();
    this.moveVelocity = new THREE.Vector3();
    this.tmpMoveDir = new THREE.Vector3();
    this.tmpKnockbackDir = new THREE.Vector3();
    this.targetPos = new THREE.Vector3(x, y, z);
    this.state = 'IDLE'; // IDLE, WANDER, CHASE
    this.timer = 0;
    this.surfaceTargetY = this.mesh.position.y;
    this.maxMoveSpeed = this.getBalancedSpeed();
    this.contactCooldown = 0;
    this.chatCooldown = 2 + Math.random() * 3;
  }

  applyTexture(texture) {
    if (!texture || !this.material) return;
    if (this.model) {
      this.model.setTexture(texture);
    } else {
      this.material.map = texture;
    }
    this.baseColor.setHex(0xffffff);
    this.material.color.copy(this.baseColor);
    this.material.needsUpdate = true;
  }

  createModelById(id) {
    switch (id) {
      case 'cow':
        return new CowModel();
      case 'pig':
        return new PigModel();
      case 'sheep':
        return new SheepModel();
      case 'chicken':
        return new ChickenModel();
      case 'virus_grunt':
      case 'sand_worm':
      case 'arlo_evil':
        return new ZombieModel();
      case 'bit_spitter':
        return new SkeletonModel();
      case 'creeper':
        return new CreeperModel();
      case 'villager':
      case 'villager_arlo':
        return new VillagerModel();
      case 'arlo_bot':
      case 'prof_apple':
        return new HumanoidModel();
      default:
        return null; // Fallback to billboard
    }
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

  getBalancedSpeed() {
    const playerWalk = this.game?.physics?.walkSpeed ?? 6.2;
    const cap = playerWalk * 0.55;
    const raw = Number(this.config.speed) || 2;
    return Math.min(raw, cap);
  }

  getMobColor(id) {
    const colors = {
      virus_grunt: 0x9c27b0,
      bit_spitter: 0x673ab7,
      arlo_evil: 0xff0000,
      arlo_ai: 0x00ffff,
      prof_apple: 0xffffff,
      super_ball: 0x3f51b5,
      friendly_nugget: 0x795548,
    };
    return colors[id] || 0xffffff;
  }

  updateVillagerChatter(delta, distToPlayer) {
    if (!this.config.friendly) return;
    this.chatCooldown = Math.max(0, this.chatCooldown - delta);
    if (distToPlayer > 5.5 || this.chatCooldown > 0) return;

    this.showChat();
    this.chatCooldown = 12 + Math.random() * 8;
  }

  showChat() {
    if (!this.config.chat || this.config.chat.length === 0) return;
    const line =
      this.config.chat[Math.floor(Math.random() * this.config.chat.length)];
    window.dispatchEvent(
      new CustomEvent('action-prompt', { detail: { type: line } })
    );

    // Temporary glow effect when talking
    if (this.material) {
      const oldColor = this.material.color.getHex();
      this.material.color.setHex(0xffff00);
      setTimeout(() => {
        if (this.material) this.material.color.setHex(oldColor);
      }, 500);
    }
  }

  takeDamage(amount, sourcePosition = null, knockback = 0.7) {
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

    // Flash effect
    this.material.color.setHex(0xff0000);
    setTimeout(() => {
      if (!this.dead) this.material.color.copy(this.baseColor);
    }, 120);

    if (this.hp <= 0) {
      this.dead = true;
      this.game.renderer.scene.remove(this.mesh);
      window.dispatchEvent(
        new CustomEvent('mob-death', { detail: { id: this.config.id } })
      );
    }
  }

  update(delta) {
    if (this.dead) return;
    if (this.contactCooldown > 0)
      this.contactCooldown = Math.max(0, this.contactCooldown - delta);

    // --- VIRUS MERGING LOGIC ---
    if (this.config.id.includes('virus') || this.config.id === 'bit_spitter') {
      this.checkMergeEvolution();
    }

    const cam = this.game.camera.instance;
    const playerPos = cam.position;
    const distToPlayer = this.mesh.position.distanceTo(playerPos);

    // Billboarding: Face the camera (Only for legacy 2D legacy mobs if any remain)
    if (!this.model) {
      this.mesh.lookAt(cam.position.x, this.mesh.position.y, cam.position.z);
    } else {
      // 3D Models: Face movement direction
      if (this.moveVelocity.lengthSq() > 0.001) {
        const targetAngle = Math.atan2(this.moveVelocity.x, this.moveVelocity.z);
        this.mesh.rotation.y = THREE.MathUtils.lerpAngle(
          this.mesh.rotation.y,
          targetAngle,
          Math.min(1, delta * 10)
        );
      }
      this.model.update(delta, this.moveVelocity, this.dead);
    }

    this.timer -= delta;
    const isHostile = !this.config.friendly;
    const canUseWater = Boolean(
      this.config.aquatic || this.config.canSwim || isHostile
    );
    this.updateVillagerChatter(delta, distToPlayer);

    // Simple AI
    if (isHostile && distToPlayer < 9) {
      this.state = 'CHASE';
    } else if (this.timer <= 0) {
      this.state = Math.random() > 0.6 ? 'WANDER' : 'IDLE';
      this.timer = 2 + Math.random() * 4;
      if (this.state === 'WANDER') {
        this.pickWanderTarget(canUseWater);
      }
    }

    if (this.state === 'CHASE' && isHostile) {
      const dir = this.tmpMoveDir.subVectors(playerPos, this.mesh.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.0001) dir.normalize();
      const chaseSpeed = this.maxMoveSpeed * 0.5;
      this.moveVelocity.lerp(
        dir.multiplyScalar(chaseSpeed),
        Math.min(1, delta * 7)
      );
      this.moveWithCollision(
        this.moveVelocity.x * delta,
        this.moveVelocity.z * delta
      );

      // Basic attack contact
      if (distToPlayer < 1.35 && this.contactCooldown <= 0) {
        this.game.gameState.takeDamage(1);
        const knock = this.tmpKnockbackDir.subVectors(
          playerPos,
          this.mesh.position
        );
        this.game.physics.applyKnockback(knock, 2.3, 0.32);
        this.contactCooldown = 1.25;
      }
    } else if (this.state === 'WANDER') {
      const dir = this.tmpMoveDir.subVectors(
        this.targetPos,
        this.mesh.position
      );
      dir.y = 0;
      if (dir.lengthSq() > 0.0001) dir.normalize();
      const wanderSpeed = this.maxMoveSpeed * 0.22;
      this.moveVelocity.lerp(
        dir.multiplyScalar(wanderSpeed),
        Math.min(1, delta * 6)
      );
      this.moveWithCollision(
        this.moveVelocity.x * delta,
        this.moveVelocity.z * delta
      );
    } else {
      this.moveVelocity.multiplyScalar(Math.max(0, 1 - delta * 8));
    }

    this.updateSurfaceY(delta, canUseWater);
  }

  pickWanderTarget(canUseWater) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = this.mesh.position.x + (Math.random() - 0.5) * 8;
      const tz = this.mesh.position.z + (Math.random() - 0.5) * 8;
      const top = this.game.world.getTopBlockIdAt(tx, tz);
      if (!canUseWater && top === 'water') continue;
      this.targetPos.set(tx, this.mesh.position.y, tz);
      return;
    }

    this.targetPos.set(
      this.mesh.position.x + (Math.random() - 0.5) * 5,
      this.mesh.position.y,
      this.mesh.position.z + (Math.random() - 0.5) * 5
    );
  }

  updateSurfaceY(delta, canUseWater) {
    const world = this.game.world;
    const halfHeight =
      this.geometry.parameters.height * this.mesh.scale.y * 0.5;
    const groundY =
      world.getTerrainHeight(this.mesh.position.x, this.mesh.position.z) +
      halfHeight;
    const waterY = world.getWaterSurfaceYAt(
      this.mesh.position.x,
      this.mesh.position.z
    );

    let targetY = groundY;
    if (waterY !== null) {
      if (canUseWater || !this.config.aquatic) {
        targetY = Math.max(targetY, waterY + halfHeight * 0.2);
      }
    }

    this.surfaceTargetY = targetY;
    this.mesh.position.y = THREE.MathUtils.lerp(
      this.mesh.position.y,
      targetY,
      Math.min(1, delta * 8)
    );
  }

  checkMergeEvolution() {
    const others = this.game.entities.entities.filter(
      (e) => e !== this && !e.dead && e.config.id === this.config.id
    );
    for (const other of others) {
      if (this.mesh.position.distanceTo(other.mesh.position) < 1.0) {
        this.evolve(other);
        break;
      }
    }
  }

  evolve(other) {
    // Merge!
    this.hp += other.hp;
    this.maxHp += other.maxHp;

    // Scale up the mesh
    const currentScale = this.mesh.scale.x;
    const newScale = Math.min(6, currentScale * 1.5);
    this.mesh.scale.set(newScale, newScale, newScale);

    // Visual feedback
    this.material.emissiveIntensity = 1.0;
    setTimeout(() => {
      if (this.material) this.material.emissiveIntensity = 0;
    }, 200);

    // Terminate the other entity
    other.dead = true;
    this.game.renderer.scene.remove(other.mesh);
  }
}
