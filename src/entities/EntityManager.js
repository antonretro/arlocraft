import * as THREE from 'three';
import { MOBS } from '../data/mobs.js';
import { TOOLS } from '../data/tools.js';
import { MobEntity, createMobModel } from './MobEntity.js';
import { HumanoidModel } from './models/HumanoidModel.js';
import { Snowball } from './throwables/Snowball.js';
import { Egg } from './throwables/Egg.js';
import { EnderPearl } from './throwables/EnderPearl.js';
import { BuildBot } from './buildbot/BuildBot.js';
import { parseAddress, parseIntent } from './buildbot/BuildBotBrain.js';

export const MAX_BUILD_BOTS = 3;

/** Interpolates between two angles along the shortest way round. */
function lerpAngle(a, b, t) {
  const diff =
    ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}

const base = import.meta.env.BASE_URL || '/';
const RESOURCE_PACK_URL =
  (base.endsWith('/') ? base : base + '/') +
  'resource_pack/assets/minecraft/textures/entity/';

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

// Ids used by world generation that map onto existing mob definitions.
const MOB_ALIASES = {
  villager_desert: { id: 'villager', textureKey: 'villager/villager_desert' },
  knight: { id: 'iron_golem' },
};

const NIGHT_HOSTILES = [
  'zombie',
  'zombie',
  'skeleton',
  'skeleton',
  'creeper',
  'spider',
  'virus_grunt',
  'enderman',
  'phantom',
];
const BIOME_HOSTILES = {
  desert: ['sand_worm', 'bit_spitter'],
  forest: ['virus_grunt'],
  highlands: ['null_stalker'],
};
const DAY_PASSIVES = ['cow', 'sheep', 'pig', 'chicken', 'rabbit', 'horse'];

function resolveMobConfig(typeId) {
  const alias = MOB_ALIASES[typeId];
  const baseId = alias?.id ?? typeId;
  const config = MOBS.find((m) => m.id === baseId);
  if (!config) return null;
  return alias ? { ...config, ...alias, id: baseId } : config;
}

function createGrayscaleCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const v = Math.min(255, lum * 1.6);
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
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
    this.maxEntities = 24;
    this.naturalSpawning = true;
    this.naturalSpawnTimer = 3;
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
    // Blocks a Build Bot has reserved, so several bots split the work.
    this.botClaims = new Set();
    this.pendingCompanions = null;
  }

  // --- Remote Players (Multiplayer) ---

  spawnRemotePlayer(peerId, skinUsername) {
    if (this.remotePlayers.has(peerId)) return;

    const model = new HumanoidModel();
    const group = model.group;

    this.game.renderer.scene.add(group);
    this.remotePlayers.set(peerId, { group, model });

    // Load skin async
    if (this.game.skinLoader && skinUsername) {
      this.game.skinLoader
        .loadSkinTexture(skinUsername)
        .then((texture) => {
          if (texture && model) {
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
    netPlayer.group.rotation.y = lerpAngle(
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

  spawn(typeId, x, y, z, saved = null) {
    const config = resolveMobConfig(typeId);
    if (!config) {
      console.warn(`[EntityManager] Unknown mob id: ${typeId}`);
      return null;
    }
    if (![x, y, z].every(Number.isFinite)) return null;
    if (config.companion) return this.spawnBuildBot(config, x, y, z, saved);
    if (this.entities.length >= this.maxEntities) return null;

    const entity = new MobEntity(this.game, config, x, y, z);

    if (entity.mesh) {
      this.loadMobTexture(config)
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

    if (entity.mesh && config.overlayTextureKey) {
      this.loadEntityTexture(getEntityTextureUrl(config.overlayTextureKey))
        .then((texture) => {
          if (texture && !entity.dead) entity.applyOverlayTexture(texture);
        })
        .catch(() => {});
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

  getBuildBots() {
    return this.entities.filter((e) => e.isCompanion && !e.dead);
  }

  /** Build Bots ignore the mob cap but are limited to MAX_BUILD_BOTS. */
  spawnBuildBot(config, x, y, z, saved = null) {
    const bots = this.getBuildBots();
    if (bots.length >= MAX_BUILD_BOTS) return null;
    const used = new Set(bots.map((b) => b.botNumber));
    let number = saved?.number;
    if (!number || used.has(number)) {
      number = 1;
      while (used.has(number)) number++;
    }
    const bot = new BuildBot(this.game, config, x, y, z, { ...saved, number });
    this.entities.push(bot);
    this.game.renderer.scene.add(bot.mesh);
    return bot;
  }

  /**
   * Chat typed by the local player. Messages addressed to a Build Bot
   * ("hey build bot mine trees") go to the nearest bot, or to all of them
   * for "build bots …". Returns true when a bot took the message.
   */
  handleChatMessage(text) {
    const address = parseAddress(text);
    if (!address) return false;
    const bots = this.getBuildBots();
    if (bots.length === 0) {
      if (address.command.length > 0 || /build/i.test(text)) {
        this.game.chat?.addMessage(
          'SYSTEM',
          'No Build Bot is here. Summon one with /summon build_bot',
          'system'
        );
      }
      return false;
    }
    const intent = parseIntent(address.command);
    let targets = bots;
    if (!address.plural) {
      const p = this.game.getPlayerPosition();
      targets = [
        bots.reduce((best, b) =>
          b.mesh.position.distanceToSquared(p) <
          best.mesh.position.distanceToSquared(p)
            ? b
            : best
        ),
      ];
    }
    for (const bot of targets) bot.handleIntent(intent);
    return true;
  }

  serializeCompanions() {
    return this.getBuildBots().map((b) => b.serialize());
  }

  /** Saved bots come back next to the player once the world around is loaded. */
  restoreCompanions(list) {
    this.pendingCompanions = Array.isArray(list) && list.length ? list : null;
  }

  spawnPendingCompanions() {
    const list = this.pendingCompanions;
    const world = this.game.world;
    const p = this.game.getPlayerPosition();
    const key = world.getChunkKey(
      world.getChunkCoord(p.x),
      world.getChunkCoord(p.y),
      world.getChunkCoord(p.z)
    );
    if (!world.chunks?.has(key)) return;
    this.pendingCompanions = null;
    list.slice(0, MAX_BUILD_BOTS).forEach((saved, i) => {
      if (saved?.type !== 'build_bot') return;
      // Saved spot if it is close, else just behind the player.
      const near =
        Number.isFinite(saved.x) &&
        Math.hypot(saved.x - p.x, saved.z - p.z) < 24;
      const x = near ? saved.x : p.x + 1.5 + i;
      const y = near ? saved.y : p.y;
      const z = near ? saved.z : p.z + 1.5;
      this.spawn('build_bot', x, y, z, saved);
    });
  }

  getMobConfig(typeId) {
    return resolveMobConfig(typeId);
  }

  /** Builds a bare model for a mob id (used by the player /morph command). */
  createModelById(typeId) {
    const config = resolveMobConfig(typeId);
    if (!config) return null;
    return createMobModel(config);
  }

  // ScriptSystem API name.
  spawnEntity(typeId, x, y, z) {
    return this.spawn(typeId, x, y, z);
  }

  /** Custom texture first, then the resource-pack texture, else null. */
  loadMobTexture(config) {
    const mode = config.textureMode;
    const candidates = [];
    if (typeof config.texture === 'string' && config.texture) {
      candidates.push(config.texture);
    }
    if (typeof config.textureKey === 'string' && config.textureKey) {
      candidates.push(getEntityTextureUrl(config.textureKey));
    }
    const tryNext = (index) => {
      if (index >= candidates.length) return Promise.resolve(null);
      const url = candidates[index];
      if (this.failedTextureUrls.has(url)) return tryNext(index + 1);
      return this.loadEntityTexture(url, mode)
        .then((texture) => texture ?? tryNext(index + 1))
        .catch(() => tryNext(index + 1));
    };
    return tryNext(0);
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
          console.warn(`[ArloCraft] Entity texture failed to load: "${url}"`);
          this.failedTextureUrls.add(url);
          reject(e);
        };
        img.src = url;
      });
    };

    return loadBaseImage().then((texture) => {
      let finalTexture = texture;
      if (textureMode === 'grayscale') {
        // Neutral base so a mob's `tint` colour shows through unchanged.
        finalTexture = createTextureFromCanvas(
          createGrayscaleCanvas(texture.image)
        );
      } else if (textureMode === 'humanoid_billboard') {
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

    // Projectiles pass a bare { raycaster: { ray } } instead of a camera.
    let ray = camera.raycaster?.ray;
    if (!ray) {
      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      ray = this.raycaster.ray;
    }
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

  // Hostiles and animals can be hit; NPCs (friendly, no XP) cannot.
  isAttackable(entity) {
    const config = entity?.config;
    if (!config) return false;
    return !config.friendly || (Number(config.xp) || 0) > 0;
  }

  hasHostileTarget(camera, maxRange) {
    return Boolean(
      this.findEntityInCrosshair(camera, maxRange, (entity) =>
        this.isAttackable(entity)
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

    if (entity.config?.chat?.length && typeof entity.showChat === 'function') {
      entity.showChat();
      return { action: 'chat', entity };
    }

    return { entity };
  }

  attackFromCamera(camera, selectedItem) {
    if (this.attackCooldown > 0 || this.entities.length === 0) return false;

    const profile = this.getAttackProfile(selectedItem);
    const targetHit = this.findEntityInCrosshair(
      camera,
      profile.range,
      (entity) => this.isAttackable(entity)
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
    const camera = this.game.camera.instance;
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);

    if (this.pendingCompanions) this.spawnPendingCompanions();

    this.entities.forEach((entity) => {
      const pos = entity.mesh.position;

      // Companions never despawn and keep working off-screen.
      if (entity.persistent && !entity.dead) {
        entity.update(delta);
        return;
      }

      // 1. Distance Despawn
      const farDistanceSq = pos.distanceToSquared(playerPos);
      if (farDistanceSq > 110 * 110) {
        entity.dead = true;
      }

      // 2. Chunk Despawn (Cleanup from unloaded chunks). Chunks are 3D, so
      // look up the layer the mob is standing in.
      if (!entity.dead && this.game.world?.chunks) {
        const world = this.game.world;
        const cx = world.getChunkCoord(pos.x);
        const cy = world.getChunkCoord(pos.y);
        const cz = world.getChunkCoord(pos.z);
        if (
          !world.chunks.has(world.getChunkKey(cx, cy, cz)) &&
          !world.chunks.has(world.getChunkKey(cx, cy - 1, cz))
        ) {
          entity.dead = true;
        }
      }

      if (entity.dead) {
        if (entity.mesh) {
          // Clean cleanup
          this.game.renderer.scene.remove(entity.mesh);
        }
        if (entity.dispose) entity.dispose();
        return;
      }

      // 3. PROXIMITY & FRUSTUM CULLING (Optimization)
      // Skip logic/animation if too far, or off-screen and not close by
      // (nearby mobs keep running so they can still reach the player).
      const cullRangeSq = 72 * 72;
      const isVisible = farDistanceSq < 24 * 24 || frustum.containsPoint(pos);
      if (farDistanceSq > cullRangeSq || !isVisible) {
        return; // Skip update for this frame
      }

      entity.update(delta);
    });
    this.entities = this.entities.filter((entity) => !entity.dead);

    this.updateNaturalSpawning(delta);

    // Update Projectiles
    this.projectiles.forEach((p) => {
      p.update(delta);
      if (p.dead && p.mesh) {
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
        this.game.renderer.scene.remove(p.mesh);
      }
    });
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  /**
   * Keeps the world populated: hostiles at night, animals by day, fish in
   * water. Ambient chunk spawns only fire once per column, so without this
   * nothing new ever appears once the area around the player is loaded.
   */
  updateNaturalSpawning(delta) {
    if (!this.naturalSpawning) return;
    this.naturalSpawnTimer -= delta;
    if (this.naturalSpawnTimer > 0) return;
    this.naturalSpawnTimer = 4 + Math.random() * 4;

    const world = this.game.world;
    if (!world?.chunks || !world.getTerrainHeight) return;
    if (this.entities.length >= this.maxEntities - 4) return;

    const isNight = this.game.dayNight?.isNight?.() ?? false;
    const hostileCount = this.entities.filter((e) => !e.config.friendly).length;
    const player = this.game.camera.instance.position;

    for (let attempt = 0; attempt < 4; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 22;
      const x = Math.floor(player.x + Math.cos(angle) * dist) + 0.5;
      const z = Math.floor(player.z + Math.sin(angle) * dist) + 0.5;
      const terrainY = world.getTerrainHeight(x, z);
      if (!Number.isFinite(terrainY)) continue;
      const surfaceY = world.getGroundYBelow(x, terrainY + 2, z);
      const cy = world.getChunkCoord(surfaceY);
      const key = world.getChunkKey(
        world.getChunkCoord(x),
        cy,
        world.getChunkCoord(z)
      );
      if (!world.chunks.has(key)) continue;

      const biomeId = world.getBiomeAt?.(x, z)?.id;
      const waterY = world.getWaterSurfaceYAt(x, z);
      if (waterY !== null && waterY - surfaceY >= 1) {
        const fish = MOBS.filter(
          (m) =>
            m.aquatic &&
            m.friendly &&
            (!m.biomes || !biomeId || m.biomes.includes(biomeId))
        );
        const pick = fish[Math.floor(Math.random() * fish.length)];
        if (pick) this.spawn(pick.id, x, waterY - 1.2, z);
        return;
      }

      let typeId = null;
      if (isNight) {
        if (hostileCount >= 8) return;
        const pool = [...NIGHT_HOSTILES, ...(BIOME_HOSTILES[biomeId] ?? [])];
        typeId = pool[Math.floor(Math.random() * pool.length)];
      } else {
        const passiveCount = this.entities.length - hostileCount;
        if (passiveCount >= 10) return;
        const biomePassives = MOBS.filter(
          (m) =>
            m.friendly &&
            !m.aquatic &&
            (Number(m.xp) || 0) > 0 &&
            m.biomes?.includes(biomeId)
        ).map((m) => m.id);
        const pool = [...DAY_PASSIVES, ...biomePassives];
        typeId = pool[Math.floor(Math.random() * pool.length)];
      }
      if (typeId) this.spawn(typeId, x, surfaceY + 0.05, z);
      return;
    }
  }

  reset() {
    this.botClaims.clear();
    this.pendingCompanions = null;
    for (const entity of this.entities) {
      if (entity.dispose) entity.dispose();
      this.game.renderer.scene.remove(entity.mesh);
    }
    this.entities = [];

    for (const proj of this.projectiles) {
      if (proj.dispose) proj.dispose();
      this.game.renderer.scene.remove(proj.mesh);
    }
    this.projectiles = [];

    // Clear remote players
    for (const [id, data] of this.remotePlayers) {
      if (data.model?.dispose) data.model.dispose();
      this.game.renderer.scene.remove(data.group);
    }
    this.remotePlayers.clear();

    // Clear caches
    this.loadedTextureCache.forEach((tex) => tex.dispose());
    this.loadedTextureCache.clear();
    this.billboardTextureCache.forEach((tex) => tex.dispose());
    this.billboardTextureCache.clear();
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
