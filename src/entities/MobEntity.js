import * as THREE from 'three';

import { PigModel } from './models/PigModel.js';
import { ZombieModel } from './models/ZombieModel.js';
import { CreeperModel } from './models/CreeperModel.js';
import { SkeletonModel } from './models/SkeletonModel.js';
import { HumanoidModel } from './models/HumanoidModel.js';
import { VillagerModel } from './models/VillagerModel.js';
import { BoxModel } from './models/BoxModel.js';
import { MOB_MODEL_SPECS } from './models/mobModelSpecs.js';

const MODEL_CLASSES = {
  pig: PigModel,
  zombie: ZombieModel,
  creeper: CreeperModel,
  skeleton: SkeletonModel,
  humanoid: HumanoidModel,
  villager: VillagerModel,
};

/** Builds the 3D model named by a mob config's `model` key, or null. */
export function createMobModel(config) {
  const key = config?.model;
  if (!key) return null;
  const ModelClass = MODEL_CLASSES[key];
  if (ModelClass) return new ModelClass();
  const spec = MOB_MODEL_SPECS[key];
  if (spec) return new BoxModel(spec);
  return null;
}

const JUMP_VELOCITY = 7.6; // clears one block with GRAVITY
const GRAVITY = 22;
const CREEPER_FUSE = 1.5;
const RANGED_COOLDOWN = 2.2;

/**
 * Generic Mob Entity. Renders a 3D voxel model (hand-written or spec-driven)
 * or a legacy billboard, and runs wander / chase / flee / swim / fly AI.
 *
 * mesh.position is the centre of the mob's hitbox; feet sit at
 * mesh.position.y - halfHeight.
 */
export class MobEntity {
  constructor(game, config, x, y, z) {
    this.game = game;
    this.config = config;
    this.id = config.id;
    this.hp = config.hp || 20;
    this.maxHp = this.hp;
    this.dead = false;

    this.model = createMobModel(config);
    if (this.model) {
      this.buildModelMesh(config);
    } else {
      // Legacy billboard fallback for mobs without a model.
      const size = config.boss ? 4.5 : config.heavy ? 2.2 : 1.2;
      this.geometry = new THREE.PlaneGeometry(size, size);
      this.material = new THREE.MeshBasicMaterial({
        color: this.getMobColor(config.id),
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.5,
      });
      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.height = size;
      this.footprint = Math.max(0.3, size * 0.38);
    }

    this.mesh.position.set(x, y + this.height / 2, z);
    this.mesh.userData.entity = this;
    this.baseColor = new THREE.Color(this.getMobColor(config.id));
    if (this.model) this.material.color.copy(this.baseColor);
    this.hitboxHalf = new THREE.Vector3(
      this.footprint,
      Math.max(0.25, this.height / 2),
      this.footprint
    );
    this.isAlly = Boolean(config.friendly);

    this.velocity = new THREE.Vector3();
    this.moveVelocity = new THREE.Vector3();
    this.tmpMoveDir = new THREE.Vector3();
    this.tmpKnockbackDir = new THREE.Vector3();
    this.tmpAim = new THREE.Vector3();
    this.targetPos = new THREE.Vector3(x, y, z);

    // AI state
    this.state = 'IDLE'; // IDLE, WANDER, CHASE, FLEE
    this.timer = Math.random() * 1.5;
    this.jumpTimer = 0;
    this.fleeTimer = 0;
    this.provokedTimer = 0;
    this.fuseTimer = 0;
    this.rangedCooldown = RANGED_COOLDOWN * Math.random();
    this.maxMoveSpeed = this.getBalancedSpeed();
    this.contactCooldown = 0;
    this.chatCooldown = 2 + Math.random() * 3;
    this.swimPhase = Math.random() * Math.PI * 2;
    this.swimDepthBias = 0.8 + Math.random() * 1.4;
    this.flashTimeout = null;

    this.liftOutOfBlocks();
  }

  /**
   * Spawn heights often come from the natural terrain height, which can sit
   * under structures or placed blocks. Step up until the hitbox is free.
   */
  liftOutOfBlocks() {
    if (!this.game.world?.isSolidAt) return;
    const pos = this.mesh.position;
    for (let i = 0; i < 24 && !this.canOccupyAt(pos.x, pos.y, pos.z); i++) {
      pos.y = Math.floor(pos.y - this.halfHeight) + 1 + this.halfHeight;
    }
  }

  /**
   * Wraps the model in a root group whose origin is the hitbox centre, so
   * every model stands on the ground regardless of how it was authored.
   */
  buildModelMesh(config) {
    const inner = this.model.group;
    inner.position.set(0, 0, 0);
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    inner.position.set(
      -(box.min.x + box.max.x) / 2,
      -(box.min.y + box.max.y) / 2,
      0
    );

    const scale = config.modelScale ?? 1;
    const root = new THREE.Group();
    root.add(inner);
    root.scale.setScalar(scale);

    this.mesh = root;
    this.material = this.model.material;
    this.modelScale = scale;
    this.height = Math.max(0.2, size.y * scale);
    const narrow = Math.min(size.x, size.z) * scale;
    this.footprint = THREE.MathUtils.clamp(narrow / 2, 0.2, 0.7);
  }

  get halfHeight() {
    const growth = this.model ? this.mesh.scale.y / this.modelScale : 1;
    return (this.height * growth) / 2;
  }

  applyTexture(texture) {
    if (!texture || !this.material) return;
    if (this.model) {
      this.model.setTexture(texture);
    } else {
      this.material.map = texture;
    }
    this.baseColor.setHex(this.config.tint ?? 0xffffff);
    this.material.color.copy(this.baseColor);
    this.material.needsUpdate = true;
  }

  applyOverlayTexture(texture) {
    this.model?.setOverlayTexture?.(texture);
  }

  canOccupyAt(x, y, z) {
    // Blocks occupy [b, b + 1) on every axis, matching Physics/World.
    const half = this.hitboxHalf;
    const hh = this.halfHeight;
    const minY = y - hh + 0.01;
    const maxY = y + hh;
    const minBlockY = Math.floor(minY);
    const maxBlockY = Math.floor(maxY);
    const minX = Math.floor(x - half.x);
    const maxX = Math.floor(x + half.x);
    const minZ = Math.floor(z - half.z);
    const maxZ = Math.floor(z + half.z);
    const world = this.game.world;

    for (let by = minBlockY; by <= maxBlockY; by++) {
      for (let bx = minX; bx <= maxX; bx++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (world.isSolidAt(bx, by, bz)) return false;
        }
      }
    }
    return true;
  }

  moveWithCollision(dx, dz) {
    if (Math.abs(dx) + Math.abs(dz) < 0.00001) return false;

    const ox = this.mesh.position.x;
    const oz = this.mesh.position.z;
    const y = this.mesh.position.y;
    const nx = ox + dx;
    const nz = oz + dz;

    if (this.canOccupyAt(nx, y, nz)) {
      this.mesh.position.x = nx;
      this.mesh.position.z = nz;
      return false;
    }

    let blocked = false;
    if (this.canOccupyAt(nx, y, oz)) {
      this.mesh.position.x = nx;
    } else {
      blocked = true;
    }

    if (this.canOccupyAt(this.mesh.position.x, y, nz)) {
      this.mesh.position.z = nz;
    } else {
      blocked = true;
    }
    return blocked;
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
    if (!this.config.friendly || !this.config.chat) return;
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

    this.game.audio?.play('action-success', { position: this.mesh.position });
    this.flashColor(0xffff00, 500);
  }

  flashColor(hex, ms) {
    if (!this.material) return;
    this.material.color.setHex(hex);
    clearTimeout(this.flashTimeout);
    this.flashTimeout = setTimeout(() => {
      if (this.material && !this.dead) this.material.color.copy(this.baseColor);
    }, ms);
  }

  isHostile() {
    if (this.config.friendly) return false;
    if (this.config.neutral) return this.provokedTimer > 0;
    return true;
  }

  takeDamage(amount, sourcePosition = null, knockback = 0.7) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.config.neutral) this.provokedTimer = 20;

    if (sourcePosition) {
      const away = this.tmpKnockbackDir.subVectors(
        this.mesh.position,
        sourcePosition
      );
      away.y = 0;
      if (away.lengthSq() > 0.0001) {
        away.normalize();
        this.moveWithCollision(away.x * knockback, away.z * knockback);
        if (amount > 0) this.velocity.y = Math.max(this.velocity.y, 3);

        // Passive mobs panic and run away from the attacker.
        if (this.config.friendly) {
          this.state = 'FLEE';
          this.fleeTimer = 5.0;
          this.timer = 5.0;
          this.targetPos.copy(this.mesh.position).addScaledVector(away, 10);
        }
      }
    }

    this.flashColor(0xff0000, 120);

    if (this.hp <= 0) this.die(true);
  }

  die(killedByPlayer = false) {
    if (this.dead) return;
    this.dead = true;
    this.game.renderer.scene.remove(this.mesh);
    window.dispatchEvent(
      new CustomEvent('mob-death', { detail: { id: this.config.id } })
    );
    if (!killedByPlayer) return;

    const xp = Number(this.config.xp) || 0;
    if (xp > 0) {
      // EngineBootstrap grants XP and plays the defeat sound.
      window.dispatchEvent(
        new CustomEvent('enemy-defeated', {
          detail: { id: this.config.id, xp },
        })
      );
      if (this.game.stats) this.game.stats.enemiesDefeated += 1;
    }
    this.grantDrops();
    this.game.particles?.spawnBurst?.(this.mesh.position, 'CRIT', 8, 0.3);
  }

  grantDrops() {
    const drops = this.config.drops;
    const gameState = this.game.gameState;
    if (!Array.isArray(drops) || !gameState?.addItemToInventory) return;
    for (const drop of drops) {
      if (!this.game.world?.getBlockData?.(drop.id)) continue;
      const min = drop.min ?? 1;
      const max = drop.max ?? min;
      const count = min + Math.floor(Math.random() * (max - min + 1));
      if (count > 0) gameState.addItemToInventory(drop.id, count, 'block');
    }
  }

  update(delta) {
    if (this.dead) return;
    if (this.contactCooldown > 0)
      this.contactCooldown = Math.max(0, this.contactCooldown - delta);

    if (this.config.id.includes('virus') || this.config.id === 'bit_spitter') {
      this.checkMergeEvolution();
    }

    const cam = this.game.camera.instance;
    const playerPos = cam.position;
    const distToPlayer = this.mesh.position.distanceTo(playerPos);

    if (!this.model) {
      // Billboards always face the camera.
      this.mesh.lookAt(cam.position.x, this.mesh.position.y, cam.position.z);
    } else {
      if (this.moveVelocity.lengthSq() > 0.001) {
        this.faceAngle(
          Math.atan2(this.moveVelocity.x, this.moveVelocity.z),
          delta
        );
      } else if (this.state === 'CHASE') {
        this.faceAngle(
          Math.atan2(
            playerPos.x - this.mesh.position.x,
            playerPos.z - this.mesh.position.z
          ),
          delta
        );
      }
      this.model.update(delta, this.moveVelocity, this.dead);
    }

    this.timer -= delta;
    this.jumpTimer = Math.max(0, this.jumpTimer - delta);
    this.fleeTimer = Math.max(0, this.fleeTimer - delta);
    this.provokedTimer = Math.max(0, this.provokedTimer - delta);
    this.rangedCooldown = Math.max(0, this.rangedCooldown - delta);

    const isHostile = this.isHostile();
    const canUseWater = Boolean(
      this.config.aquatic || this.config.canSwim || isHostile
    );
    this.updateVillagerChatter(delta, distToPlayer);

    const chaseRange = this.config.neutral ? 16 : this.config.flying ? 14 : 10;
    const creative = this.game.gameState?.mode === 'CREATIVE';

    // AI state transitions
    if (this.fleeTimer > 0) {
      this.state = 'FLEE';
    } else if (isHostile && !creative && distToPlayer < chaseRange) {
      this.state = 'CHASE';
    } else if (this.timer <= 0 || this.state === 'CHASE') {
      this.state = Math.random() > 0.45 ? 'WANDER' : 'IDLE';
      this.timer = 2 + Math.random() * 4;
      if (this.state === 'WANDER') this.pickWanderTarget(canUseWater);
    }

    if (this.fuseTimer > 0 && this.state !== 'CHASE') {
      this.fuseTimer = 0;
      this.material.color.copy(this.baseColor);
    }

    switch (this.state) {
      case 'FLEE':
        this.executeMovement(delta, this.targetPos, this.maxMoveSpeed * 1.4);
        break;
      case 'CHASE':
        this.updateChase(delta, playerPos, distToPlayer);
        break;
      case 'WANDER': {
        const dx = this.targetPos.x - this.mesh.position.x;
        const dz = this.targetPos.z - this.mesh.position.z;
        if (dx * dx + dz * dz < 0.3) {
          this.state = 'IDLE';
          this.moveVelocity.multiplyScalar(0.5);
        } else {
          this.executeMovement(delta, this.targetPos, this.maxMoveSpeed * 0.45);
        }
        break;
      }
      case 'IDLE':
      default:
        this.moveVelocity.multiplyScalar(Math.max(0, 1 - delta * 8));
        break;
    }

    this.updateSurfaceY(delta, canUseWater);
  }

  faceAngle(targetAngle, delta) {
    const current = this.mesh.rotation.y;
    const diff =
      ((((targetAngle - current + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2)) -
      Math.PI;
    this.mesh.rotation.y = current + diff * Math.min(1, delta * 10);
  }

  updateChase(delta, playerPos, distToPlayer) {
    // Ranged mobs keep their distance and lob projectiles.
    if (this.config.ranged) {
      if (distToPlayer > 7) {
        this.executeMovement(delta, playerPos, this.maxMoveSpeed * 0.7);
      } else if (distToPlayer < 4) {
        this.tmpAim.copy(this.mesh.position).multiplyScalar(2).sub(playerPos);
        this.executeMovement(delta, this.tmpAim, this.maxMoveSpeed * 0.6);
      } else {
        this.moveVelocity.multiplyScalar(Math.max(0, 1 - delta * 8));
      }
      if (distToPlayer < 14 && this.rangedCooldown <= 0)
        this.shootAt(playerPos);
      return;
    }

    if (this.config.explodes) {
      if (distToPlayer < 2.6 || this.fuseTimer > 0) {
        this.moveVelocity.multiplyScalar(Math.max(0, 1 - delta * 10));
        this.updateFuse(delta, distToPlayer);
      } else {
        this.executeMovement(delta, playerPos, this.maxMoveSpeed * 0.7);
      }
      return;
    }

    this.executeMovement(delta, playerPos, this.maxMoveSpeed * 0.7);
    this.tryMeleeAttack(playerPos, distToPlayer);
  }

  tryMeleeAttack(playerPos, distToPlayer) {
    const reach = 1.1 + this.footprint;
    const verticalGap = Math.abs(playerPos.y - 1.2 - this.mesh.position.y);
    if (distToPlayer > reach + this.halfHeight || verticalGap > 2.2) return;
    if (this.contactCooldown > 0) return;

    const damage = this.config.boss ? 3 : this.config.hp >= 40 ? 2 : 1;
    this.game.gameState.takeDamage(damage);
    const knock = this.tmpKnockbackDir.subVectors(
      playerPos,
      this.mesh.position
    );
    this.game.physics?.applyKnockback?.(knock, 2.3, 0.32);
    this.contactCooldown = 1.25;
    this.game.audio?.play('player-damaged', { position: this.mesh.position });
  }

  shootAt(playerPos) {
    const entities = this.game.entities;
    if (!entities?.spawnProjectile) return;
    const origin = this.mesh.position.clone();
    origin.y += this.halfHeight * 0.5;
    const dir = this.tmpAim.copy(playerPos);
    dir.y -= 0.4;
    dir.sub(origin).normalize();
    origin.addScaledVector(dir, this.footprint + 0.4);
    const projectile = entities.spawnProjectile('snowball', this, origin, dir);
    if (projectile) projectile.playerDamage = 1;
    this.rangedCooldown = RANGED_COOLDOWN + Math.random() * 0.8;
  }

  updateFuse(delta, distToPlayer) {
    this.fuseTimer += delta;
    const blink = Math.floor(this.fuseTimer * 8) % 2 === 0;
    this.material.color.setHex(blink ? 0xffffff : 0xff8888);
    if (distToPlayer > 6) {
      this.fuseTimer = 0;
      this.material.color.copy(this.baseColor);
      return;
    }
    if (this.fuseTimer < CREEPER_FUSE) return;

    const p = this.mesh.position;
    try {
      this.game.world.explode?.(p.x, p.y - this.halfHeight + 0.5, p.z, 3);
    } catch (error) {
      console.warn('[MobEntity] Creeper explosion failed:', error);
    }
    this.game.particles?.spawnBurst?.(p, 'CRIT', 30, 0.6);
    this.die(false);
  }

  executeMovement(delta, target, speed) {
    const dir = this.tmpMoveDir.subVectors(target, this.mesh.position);
    dir.y = 0;
    if (dir.lengthSq() > 0.0001) dir.normalize();

    this.moveVelocity.lerp(dir.multiplyScalar(speed), Math.min(1, delta * 7));

    const blocked = this.moveWithCollision(
      this.moveVelocity.x * delta,
      this.moveVelocity.z * delta
    );

    // Hop up one-block steps when walking into them.
    if (
      blocked &&
      !this.config.flying &&
      !this.config.aquatic &&
      this.jumpTimer <= 0 &&
      this.onGround
    ) {
      this.velocity.y = JUMP_VELOCITY;
      this.jumpTimer = 0.6;
      this.onGround = false;
    }
  }

  pickWanderTarget(canUseWater) {
    const world = this.game.world;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = this.mesh.position.x + (Math.random() - 0.5) * 12;
      const tz = this.mesh.position.z + (Math.random() - 0.5) * 12;
      const waterY = world.getWaterSurfaceYAt(tx, tz);
      if (this.config.aquatic) {
        if (waterY === null) continue;
      } else if (!canUseWater && waterY !== null) {
        continue;
      }
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
    const pos = this.mesh.position;
    const halfHeight = this.halfHeight;
    const feetY = pos.y - halfHeight;
    // Search from just above the feet so overhangs and leaves overhead
    // never teleport the mob on top of them.
    const groundSurfaceY = world.getGroundYBelow(pos.x, feetY + 0.6, pos.z);
    const groundY = groundSurfaceY + halfHeight;
    const waterY = world.getWaterSurfaceYAt(pos.x, pos.z);
    const hasWater = waterY !== null && waterY > groundSurfaceY;

    if (this.config.flying) {
      this.updateFlight(
        delta,
        groundY,
        hasWater ? waterY + halfHeight : groundY
      );
      return;
    }

    if (this.config.aquatic && hasWater) {
      const waterFloor = groundSurfaceY + halfHeight * 1.1;
      const swimRoom = Math.max(0.6, waterY - waterFloor);
      const desiredDepth = Math.min(
        Math.max(0.75, swimRoom * 0.45),
        this.swimDepthBias + swimRoom * 0.2
      );
      const bob = Math.sin(performance.now() * 0.0018 + this.swimPhase) * 0.3;
      const targetY = Math.min(
        waterY - halfHeight,
        Math.max(waterFloor, waterY - desiredDepth + bob)
      );
      this.velocity.y = THREE.MathUtils.lerp(
        this.velocity.y,
        (targetY - pos.y) * 4.5,
        Math.min(1, delta * 4)
      );
      pos.y += this.velocity.y * delta;
      if (pos.y < groundY) pos.y = groundY;
      this.onGround = false;
      return;
    }

    const inWater = hasWater && pos.y <= waterY + halfHeight * 0.3;
    const floatTargetY =
      inWater && canUseWater
        ? Math.max(groundY, waterY + halfHeight * 0.2)
        : groundY;

    const gravity = inWater ? 10 : GRAVITY;
    const buoyancy = inWater && canUseWater ? 14 : 0;

    this.velocity.y -= gravity * delta;
    if (buoyancy > 0 && pos.y < floatTargetY) {
      this.velocity.y += buoyancy * delta;
    }
    this.velocity.y = Math.max(this.velocity.y, -40);

    let nextY = pos.y + this.velocity.y * delta;
    this.onGround = false;
    if (nextY <= floatTargetY) {
      nextY = floatTargetY;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.onGround = true;
    } else if (this.velocity.y > 0 && !this.canOccupyAt(pos.x, nextY, pos.z)) {
      // Bumped a ceiling.
      this.velocity.y = 0;
      nextY = pos.y;
    }

    pos.y = nextY;
  }

  updateFlight(delta, groundY, floorY) {
    const pos = this.mesh.position;
    const hover = this.config.flyHeight ?? 2;
    const bob = Math.sin(performance.now() * 0.002 + this.swimPhase) * 0.35;
    let targetY = Math.max(groundY, floorY) + hover + bob;
    if (this.state === 'CHASE') {
      // Swoop down to the player's chest.
      const playerY = this.game.camera.instance.position.y - 0.4;
      targetY = Math.max(groundY + 0.2, playerY);
      this.tryMeleeAttack(
        this.game.camera.instance.position,
        pos.distanceTo(this.game.camera.instance.position)
      );
    }
    const nextVy = THREE.MathUtils.lerp(
      this.velocity.y,
      THREE.MathUtils.clamp((targetY - pos.y) * 2.5, -6, 6),
      Math.min(1, delta * 3)
    );
    this.velocity.y = nextVy;
    const nextY = pos.y + nextVy * delta;
    if (this.canOccupyAt(pos.x, nextY, pos.z)) pos.y = nextY;
    else this.velocity.y = 0;
    if (pos.y < groundY) pos.y = groundY;
    this.onGround = false;
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
    this.hp += other.hp;
    this.maxHp += other.maxHp;

    const oldHalf = this.halfHeight;
    const newScale = Math.min(6, this.mesh.scale.x * 1.5);
    this.mesh.scale.setScalar(newScale);
    // Keep the feet planted while growing.
    this.mesh.position.y += this.halfHeight - oldHalf;
    this.hitboxHalf.y = Math.max(0.25, this.halfHeight);

    this.flashColor(0xffffff, 200);

    other.dead = true;
    this.game.renderer.scene.remove(other.mesh);
    if (other.dispose) other.dispose();
  }

  dispose() {
    clearTimeout(this.flashTimeout);
    if (this.model?.dispose) {
      this.model.dispose();
    } else {
      if (this.geometry) this.geometry.dispose();
      if (this.material) this.material.dispose();
    }
    if (this.mesh?.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
