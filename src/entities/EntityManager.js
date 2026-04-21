import * as THREE from 'three';
import { MOBS } from '../data/mobs.js';
import { TOOLS } from '../data/tools.js';
import { MobEntity } from './MobEntity.js';
import { HumanoidModel } from './models/HumanoidModel.js';
import { Snowball } from './throwables/Snowball.js';
import { Egg } from './throwables/Egg.js';
import { EnderPearl } from './throwables/EnderPearl.js';

const RESOURCE_PACK_URL = '/resource_pack/assets/minecraft/textures/entity/';

function getEntityTextureUrl(textureKey) {
  // Direct access to the public resource pack
  return `${RESOURCE_PACK_URL}${textureKey}.png`;
}

console.log(
  `[ArloCraft] Entity Manager using static resource pack: ${RESOURCE_PACK_URL}`
);

function createTextureFromCanvas(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createHumanoidBillboardCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const draw = (sx, sy, sw, sh, dx, dy) => {
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw, sh);
  };

  draw(8, 8, 8, 8, 4, 0); // head front
  draw(20, 20, 8, 12, 4, 8); // body front
  draw(44, 20, 4, 12, 0, 8); // right arm front
  draw(44, 20, 4, 12, 12, 8); // left arm mirrored from right arm
  draw(4, 20, 4, 12, 4, 20); // right leg front
  draw(4, 20, 4, 12, 8, 20); // left leg mirrored from right leg

  return canvas;
}

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.entities = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
    this.attackCooldown = 0;
    this.maxEntities = 18;
    this.comboChain = 0;
    this.comboTimer = 0;
    this.tmpHitMin = new THREE.Vector3();
    this.tmpHitMax = new THREE.Vector3();
    this.tmpHitPoint = new THREE.Vector3();
    this.tmpHitBox = new THREE.Box3();
    this.textureLoader = new THREE.TextureLoader();
    this.loadedTextureCache = new Map();
    this.billboardTextureCache = new Map();
    this.remotePlayers = new Map(); // PeerID -> {group, parts}
    this.projectiles = [];
    this.failedTextureUrls = new Set();
  }

  // --- Remote Players (Multiplayer) ---

  spawnRemotePlayer(peerId, skinUsername) {
    if (this.remotePlayers.has(peerId)) return;

    const model = new HumanoidModel();
    const group = model.group;

    this.game.renderer.scene.add(group);
    this.remotePlayers.set(peerId, { group, model });

    // Load skin async
    if (this.game.skinSystem && skinUsername) {
      this.game.skinSystem
        .loadSkin(skinUsername)
        .then((texture) => {
          if (texture) {
            model.setTexture(texture);
          }
        })
        .catch((e) =>
          console.warn('[Multiplayer] Failed to load skin for', peerId, e)
        );
    }

    console.log('[Multiplayer] Spawned remote player:', peerId);
  }

  updateRemotePlayer(peerId, pos, rot) {
    const netPlayer = this.remotePlayers.get(peerId);
    if (!netPlayer) return;

    const lerpSpeed = 0.15; // Smooth movement interpolation
    netPlayer.group.position.lerp(
      new THREE.Vector3(pos.x, pos.y, pos.z),
      lerpSpeed
    );

    // Smoothly rotate body toward movement direction
    netPlayer.group.rotation.y = THREE.MathUtils.lerpAngle(
      netPlayer.group.rotation.y,
      rot.yaw + Math.PI,
      lerpSpeed
    );

    // Update head rotation separately
    if (netPlayer.model && netPlayer.model.parts.headGroup) {
      netPlayer.model.parts.headGroup.rotation.x = rot.pitch;
    }

    // Pass velocity to the model for walking animations
    if (netPlayer.model) {
      // Estimate velocity from position delta or just use a fixed "walking" status if moving
      const velocity = new THREE.Vector3(pos.x, 0, pos.z).sub(
        new THREE.Vector3(netPlayer.lastX || pos.x, 0, netPlayer.lastZ || pos.z)
      );
      netPlayer.model.update(0.016, velocity.divideScalar(0.016));
      netPlayer.lastX = pos.x;
      netPlayer.lastZ = pos.z;
    }
  }

  removeRemotePlayer(peerId) {
    const netPlayer = this.remotePlayers.get(peerId);
    if (netPlayer) {
      this.game.renderer.scene.remove(netPlayer.group);
      this.remotePlayers.delete(peerId);
    }
  }

  spawn(typeId, x, y, z) {
    if (this.entities.length >= this.maxEntities) return null;
    const config = MOBS.find((m) => m.id === typeId);
    if (!config) return null;

    const entity = new MobEntity(this.game, config, x, y, z);

    const textureUrl = this.resolveTextureUrl(config);
    if (textureUrl && !this.failedTextureUrls.has(textureUrl) && entity.mesh) {
      this.loadEntityTexture(textureUrl, config.textureMode)
        .then((texture) => {
          if (!texture || entity.dead) return;
          entity.applyTexture?.(texture);
        })
        .catch((error) => {
          console.warn(
            `[ArloCraft] Failed to load entity texture for ${config.id}:`,
            error
          );
        });
    }

    this.entities.push(entity);
    if (
      entity.mesh?.geometry?.computeBoundsTree &&
      !entity.mesh.geometry.boundsTree
    ) {
      entity.mesh.geometry.computeBoundsTree();
    }
    this.game.renderer.scene.add(entity.mesh);
    return entity;
  }

  spawnProjectile(type, owner, position, direction) {
    const speed = 25;
    const velocity = direction.clone().multiplyScalar(speed);
    // Add slightly upward arc as in Minecraft
    velocity.y += 3;

    let projectile;
    switch (type) {
      case 'snowball':
        projectile = new Snowball(this.game, owner, position, velocity);
        break;
      case 'egg':
        projectile = new Egg(this.game, owner, position, velocity);
        break;
      case 'ender_pearl':
        projectile = new EnderPearl(this.game, owner, position, velocity);
        break;
      default:
        console.warn('[EntityManager] Unknown projectile type:', type);
        return null;
    }

    this.projectiles.push(projectile);
    return projectile;
  }

  resolveTextureUrl(config) {
    if (typeof config.texture === 'string' && config.texture)
      return config.texture;
    if (typeof config.textureKey === 'string' && config.textureKey) {
      return getEntityTextureUrl(config.textureKey);
    }
    return null;
  }

  loadEntityTexture(url, textureMode = 'billboard') {
    if (this.failedTextureUrls.has(url)) return Promise.resolve(null);

    const cacheKey = `${textureMode}:${url}`;
    if (this.billboardTextureCache.has(cacheKey)) {
      return Promise.resolve(this.billboardTextureCache.get(cacheKey));
    }

    const loadBaseImage = () => {
      if (this.loadedTextureCache.has(url))
        return Promise.resolve(this.loadedTextureCache.get(url));
      return new Promise((resolve, reject) => {
        const img = new Image();
        if (url.startsWith('http')) img.crossOrigin = 'anonymous';
        img.onload = () => {
          const tex = new THREE.CanvasTexture(img);
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          this.loadedTextureCache.set(url, tex);
          resolve(tex);
        };
        img.onerror = (e) => {
          console.error(
            `[ArloCraft] FATAL: Image load failed for URL: "${url}"`
          );
          this.failedTextureUrls.add(url);
          reject(e);
        };
        img.src = url;
      });
    };

    return loadBaseImage().then((texture) => {
      let finalTexture = texture;
      if (textureMode === 'humanoid_billboard') {
        finalTexture = createTextureFromCanvas(
          createHumanoidBillboardCanvas(texture.image)
        );
      }
      this.billboardTextureCache.set(cacheKey, finalTexture);
      return finalTexture;
    });
  }

  getAttackDamage(selectedItem) {
    const baseDamage = 4;
    const offhand = this.game?.gameState?.getOffhandItem?.();
    const offhandTool = offhand ? this.toolById.get(offhand.id) : null;
    const offhandBonus = offhandTool ? offhandTool.damage * 0.25 : 0;
    if (!selectedItem) return baseDamage + offhandBonus;

    const tool = this.toolById.get(selectedItem.id);
    if (!tool) return baseDamage + offhandBonus;
    return baseDamage + tool.damage * 0.6 + offhandBonus;
  }

  getAttackProfile(selectedItem) {
    const tool = selectedItem ? this.toolById.get(selectedItem.id) : null;
    return {
      tool,
      damage: this.getAttackDamage(selectedItem),
      range: tool?.range ?? (tool?.type === 'ranged' ? 12 : 4),
      cooldown: tool?.cooldown ?? 0.25,
      knockback: tool?.knockback ?? 0.65,
      critChance: tool?.critChance ?? 0.03,
    };
  }

  findEntityInCrosshair(camera, maxRange, predicate = null) {
    if (!camera || this.entities.length === 0) return null;

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const ray = this.raycaster.ray;
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const entity of this.entities) {
      if (!entity || entity.dead) continue;
      if (predicate && !predicate(entity)) continue;

      const center = entity.mesh?.position;
      if (!center) continue;

      const half = entity.hitboxHalf ?? entity.hitboxSize ?? null;
      const hx = Math.max(0.2, half?.x ?? 0.45);
      const hy = Math.max(0.4, half?.y ?? 0.9);
      const hz = Math.max(0.2, half?.z ?? 0.45);

      this.tmpHitMin.set(center.x - hx, center.y - hy, center.z - hz);
      this.tmpHitMax.set(center.x + hx, center.y + hy, center.z + hz);
      this.tmpHitBox.set(this.tmpHitMin, this.tmpHitMax);

      const hit = ray.intersectBox(this.tmpHitBox, this.tmpHitPoint);
      if (!hit) continue;

      const dist = hit.distanceTo(ray.origin);
      if (dist > maxRange) continue;
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearest = entity;
      }
    }

    if (!nearest) return null;
    return { entity: nearest, distance: nearestDistance };
  }

  hasHostileTarget(camera, maxRange) {
    return Boolean(
      this.findEntityInCrosshair(
        camera,
        maxRange,
        (entity) => !entity.config?.friendly
      )
    );
  }

  interactEntityFromCamera(camera, maxRange = 4.5) {
    const hit = this.findEntityInCrosshair(camera, maxRange);
    if (!hit) return null;

    const entity = hit.entity;
    const selected = this.game.gameState.getSelectedItem();

    // Milking logic
    if (entity.id === 'cow' && selected?.id === 'bucket') {
      selected.id = 'milk_bucket';
      this.game.audio?.play('milking');
      window.dispatchEvent(new CustomEvent('inventory-changed'));
      return { action: 'milked', entity };
    }

    return { entity };
  }

  attackFromCamera(camera, selectedItem) {
    if (this.attackCooldown > 0 || this.entities.length === 0) return false;

    const profile = this.getAttackProfile(selectedItem);
    const targetHit = this.findEntityInCrosshair(
      camera,
      profile.range,
      (entity) => !entity.config?.friendly
    );
    if (!targetHit) return false;
    const target = targetHit.entity;

    const comboBonus =
      this.comboTimer > 0 ? Math.min(5, this.comboChain) * 0.08 : 0;
    let damage = profile.damage * (1 + comboBonus);
    const distance = targetHit.distance;

    if (
      (profile.tool?.type === 'ranged' || profile.tool?.type === 'gun') &&
      distance > profile.range * 0.72
    ) {
      damage *= 0.86;
    }

    const critChance = profile.critChance + comboBonus * 0.03;
    const isCrit = Math.random() < critChance;
    if (isCrit) {
      damage *= 1.75;
      this.game.particles?.spawnBurst(target.mesh.position, 'CRIT', 15, 0.3);
      window.dispatchEvent(
        new CustomEvent('action-prompt', { detail: { type: 'CRIT HIT' } })
      );
    }

    const knockback = profile.knockback * (1 + comboBonus * 0.65);
    target.takeDamage(damage, camera.position, knockback);
    this.attackCooldown = profile.cooldown;

    this.comboChain = Math.min(8, this.comboChain + 1);
    this.comboTimer = 1.25;
    if (this.comboChain >= 3) {
      window.dispatchEvent(
        new CustomEvent('action-prompt', {
          detail: { type: `COMBO x${this.comboChain}` },
        })
      );
    }
    return true;
  }

  interactFromCamera(camera, selectedItem) {
    if (this.entities.length === 0) return false;
    const hit = this.findEntityInCrosshair(
      camera,
      4.5,
      (entity) => entity.config?.friendly
    );
    if (!hit) return false;
    const target = hit.entity;
    if (!target || !target.isAlly) return false;

    if (selectedItem && selectedItem.foodVal) {
      target.feed(selectedItem);
      return true;
    } else {
      target.pet();
      return true;
    }
  }

  update(delta) {
    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    }
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - delta);
      if (this.comboTimer === 0) this.comboChain = 0;
    }

    const playerPos = this.game.camera.instance.position;
    this.entities.forEach((entity) => {
      const farDistanceSq = entity.mesh.position.distanceToSquared(playerPos);
      if (farDistanceSq > 110 * 110) {
        entity.dead = true;
        if (entity.mesh?.geometry?.disposeBoundsTree)
          entity.mesh.geometry.disposeBoundsTree();
        this.game.renderer.scene.remove(entity.mesh);
        return;
      }
      entity.update(delta);
    });
    this.entities = this.entities.filter((entity) => !entity.dead);

    // Update Projectiles
    this.projectiles.forEach((p) => p.update(delta));
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  interactNearbyEntity(position, maxDist) {
    if (!position) return false;
    let best = null;
    let minDist = maxDist;

    for (const entity of this.entities) {
      // Find the closest friendly NPC
      if (entity.config?.friendly && !entity.dead) {
        const dist = entity.mesh.position.distanceTo(position);
        if (dist < minDist) {
          minDist = dist;
          best = entity;
        }
      }
    }

    if (best && typeof best.showChat === 'function') {
      best.showChat();
      return true;
    }
    return false;
  }
}
