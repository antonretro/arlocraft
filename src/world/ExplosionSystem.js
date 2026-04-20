import * as THREE from 'three';

const blockTextureModules = import.meta.glob(
  '../Igneous 1.19.4/assets/minecraft/textures/block/*.png',
  { eager: true, query: '?url' }
);
const contentBlockAllModules = import.meta.glob('../content/blocks/*/all.png', {
  eager: true,
  query: '?url',
});
const particleTextureModules = import.meta.glob(
  '../Igneous 1.19.4/assets/minecraft/textures/particle/*.png',
  { eager: true, query: '?url' }
);

/**
 * ExplosionSystem — manages all particle/debris effects for explosions and block breaking.
 */
export class ExplosionSystem {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;

    // Flying block debris from explosions
    this.flyingBlocks = [];

    // Small break particles from mining
    this.breakParticles = [];
    this.breakParticleGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);

    // Sprite particles (Igneous)
    this.spriteParticles = [];

    // Pickup magnet effects
    this.pickupEffects = [];
    this.pickupGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);

    this.blockTextures = {};
    for (const [path, module] of Object.entries(blockTextureModules)) {
      const fileName = path.split('/').pop().replace('.png', '');
      this.blockTextures[fileName] = module.default || module;
    }
    for (const [path, module] of Object.entries(contentBlockAllModules)) {
      const parts = path.split('/');
      const folderId = parts[parts.length - 2];
      this.blockTextures[folderId] = module.default || module;
    }

    this.particleTextures = {};
    for (const [path, module] of Object.entries(particleTextureModules)) {
      const fileName = path.split('/').pop().replace('.png', '');
      this.particleTextures[fileName] = module.default || module;
    }

    this.textureLoader = new THREE.TextureLoader();
    this.textureCache = new Map();
    this.particleCache = new Map();
  }

  getTexture(id) {
    if (this.textureCache.has(id)) return this.textureCache.get(id);

    const path =
      this.blockTextures[id] || this.blockTextures[id.replace('_block', '')];
    if (path) {
      const tex = this.textureLoader.load(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      this.textureCache.set(id, tex);
      return tex;
    }
    return null;
  }

  // ─── Block Color Palette ──────────────────────────────────────────

  getBlockColor(id) {
    const palette = {
      grass_block: 0x7cc56a,
      dirt: 0x8a6442,
      stone: 0x8c969f,
      sand: 0xd2c48d,
      wood: 0x926d49,
      leaves: 0x4e9a57,
      water: 0x4a76df,
      iron: 0xbec0c4,
      gold: 0xf1cc4e,
      diamond: 0x6de5da,
      coal: 0x4a4d53,
      copper: 0xc57a44,
      tin: 0xbac2cb,
      silver: 0xdce2e8,
      ruby: 0xe2446a,
      sapphire: 0x4c7fff,
      amethyst: 0x9e72ef,
      uranium: 0x7dff5d,
      platinum: 0xd8e8f8,
      mythril: 0x62f1ff,
      anton: 0xffaac9,
      obsidian: 0x3b3054,
    };
    return palette[id] ?? 0xb8c0ca;
  }

  // ─── Explosion ────────────────────────────────────────────────────

  explode(x, y, z, radius) {
    const isNuke = radius > 10;
    const rSq = radius * radius;
    const blocksToRemove = [];

    // Find blocks in radius
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq <= rSq) {
            const bx = Math.round(x + dx);
            const by = Math.round(y + dy);
            const bz = Math.round(z + dz);
            const key = this.world.getKey(bx, by, bz);
            const blockId = this.world.state.blockMap.get(key);
            if (blockId && blockId !== 'bedrock') {
              blocksToRemove.push({ x: bx, y: by, z: bz, id: blockId, key });
            }
          }
        }
      }
    }

    // Remove blocks and spawn flying blocks
    blocksToRemove.forEach((b) => {
      const dist = Math.sqrt((b.x - x) ** 2 + (b.y - y) ** 2 + (b.z - z) ** 2);
      const chance = 0.4 - (dist / radius) * 0.3;
      if (Math.random() < chance) {
        this.spawnFlyingBlock(b.x, b.y, b.z, b.id, x, y, z);
      }
      this.world.removeBlockByKey(b.key);
    });

    // Impact player
    const playerPos = this.world.game.getPlayerPosition();
    const distToPlayer = playerPos.distanceTo(new THREE.Vector3(x, y, z));
    if (distToPlayer < radius * 2) {
      const dir = new THREE.Vector3()
        .subVectors(playerPos, new THREE.Vector3(x, y, z))
        .normalize();
      const falloff = 1 - Math.min(1, distToPlayer / (radius * 1.8));
      const force = falloff * radius * 1.5;
      const shakeScale = isNuke ? 2.5 : 1.0;
      this.world.game.physics.applyKnockback(
        dir,
        force * (isNuke ? 2 : 1),
        force * 0.4
      );
      this.world.game.screenShake = Math.max(
        this.world.game.screenShake,
        falloff * (radius / (isNuke ? 2 : 5)) * shakeScale
      );
      if (distToPlayer < radius) {
        this.world.game.gameState.takeDamage(
          Math.floor(falloff * radius * (isNuke ? 10 : 4))
        );
      }
    }

    // Visual prompt
    const type = isNuke ? 'NUCLEAR DETONATION' : 'TNT EXPLOSION';

    if (isNuke) {
      const flash = document.getElementById('nuke-flash-overlay');
      if (flash) {
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 500);
      }
    }

    window.dispatchEvent(
      new CustomEvent('action-prompt', { detail: { type } })
    );
  }

  // ─── Flying Block Debris ──────────────────────────────────────────

  spawnFlyingBlock(x, y, z, blockId, originX, originY, originZ) {
    const tex = this.getTexture(blockId);
    const material = tex
      ? new THREE.MeshLambertMaterial({ map: tex })
      : new THREE.MeshLambertMaterial({ color: this.getBlockColor(blockId) });

    const mesh = new THREE.Mesh(
      this.world.sharedChunkGeometries.solid,
      material
    );
    mesh.scale.set(0.5, 0.5, 0.5);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const dx = x - originX;
    const dy = y - originY;
    const dz = z - originZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    const force = 6 + Math.random() * 10 + 20 / dist;
    this.flyingBlocks.push({
      mesh,
      vx: (dx / dist) * force + (Math.random() - 0.5) * 5,
      vy: (dy / dist) * force + 4 + Math.random() * 8,
      vz: (dz / dist) * force + (Math.random() - 0.5) * 5,
      rx: (Math.random() - 0.5) * 10,
      ry: (Math.random() - 0.5) * 10,
      rz: (Math.random() - 0.5) * 10,
      life: 4.0 + Math.random() * 2,
    });
  }

  updateFlyingBlocks(delta) {
    for (let i = this.flyingBlocks.length - 1; i >= 0; i--) {
      const b = this.flyingBlocks[i];
      b.life -= delta;

      b.vy -= 24 * delta; // Gravity

      b.mesh.position.x += b.vx * delta;
      b.mesh.position.y += b.vy * delta;
      b.mesh.position.z += b.vz * delta;

      b.mesh.rotation.x += b.rx * delta;
      b.mesh.rotation.y += b.ry * delta;
      b.mesh.rotation.z += b.rz * delta;

      // Floor bounce
      const floorY = this.world.getColumnHeight(
        b.mesh.position.x,
        b.mesh.position.z
      );
      if (b.mesh.position.y < floorY) {
        b.mesh.position.y = floorY;
        b.vy = Math.abs(b.vy) * 0.3;
        b.vx *= 0.7;
        b.vz *= 0.7;
        b.rx *= 0.7;
        b.ry *= 0.7;
        b.rz *= 0.7;
      }

      if (b.life < 1.0) {
        b.mesh.material.opacity = b.life;
        b.mesh.material.transparent = true;
      }

      if (b.life <= 0 || this.flyingBlocks.length > 200) {
        this.scene.remove(b.mesh);
        b.mesh.material.dispose();
        this.flyingBlocks.splice(i, 1);
      }
    }
  }

  // ─── Break Particles (Mining) ─────────────────────────────────────

  spawnBreakParticles(x, y, z, blockId) {
    const tex = this.getTexture(blockId);
    for (let i = 0; i < 12; i++) {
      const material = tex
        ? new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.9,
          })
        : new THREE.MeshBasicMaterial({
            color: this.getBlockColor(blockId),
            transparent: true,
            opacity: 0.9,
          });

      const mesh = new THREE.Mesh(this.breakParticleGeometry, material);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.4,
        y + (Math.random() - 0.5) * 0.35,
        z + (Math.random() - 0.5) * 0.4
      );
      this.scene.add(mesh);
      this.breakParticles.push({
        mesh,
        vx: (Math.random() - 0.5) * 2.0,
        vy: 1.2 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * 2.0,
        life: 0.42,
      });
    }
  }

  updateBreakParticles(delta) {
    for (let i = this.breakParticles.length - 1; i >= 0; i--) {
      const p = this.breakParticles[i];
      p.life -= delta;
      p.vy -= 10.5 * delta;
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;

      p.mesh.material.opacity = Math.max(0, p.life / 0.42);
      if (p.life > 0) continue;

      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
      this.breakParticles.splice(i, 1);
    }
  }

  // ─── Pickup Effects ───────────────────────────────────────────────

  spawnPickupEffect(x, y, z, blockId, playerPosition) {
    if (!this.world.game?.features?.blockBreakPickupMagnet) return;
    const distanceSq = playerPosition
      ? (x - playerPosition.x) ** 2 +
        (y - playerPosition.y) ** 2 +
        (z - playerPosition.z) ** 2
      : Infinity;
    const attract = distanceSq <= 7 * 7;

    const material = new THREE.MeshBasicMaterial({
      color: this.getBlockColor(blockId),
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(this.pickupGeometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(1, 1, 1);
    this.scene.add(mesh);

    const popForce = 1.5;
    this.pickupEffects.push({
      mesh,
      age: 0,
      life: attract ? 0.8 : 0.3,
      attract,
      vx: (Math.random() - 0.5) * popForce,
      vy: 2.5 + Math.random() * 2,
      vz: (Math.random() - 0.5) * popForce,
      rvx: (Math.random() - 0.5) * 10,
      rvy: (Math.random() - 0.5) * 10,
      rvz: (Math.random() - 0.5) * 10,
    });
  }

  updatePickupEffects(delta, playerPosition) {
    for (let i = this.pickupEffects.length - 1; i >= 0; i--) {
      const fx = this.pickupEffects[i];
      fx.age += delta;
      fx.life -= delta;

      if (fx.age < 0.12) {
        const shrink = 1 - (fx.age / 0.12) * 0.4;
        fx.mesh.scale.set(shrink, shrink, shrink);
      }

      if (fx.attract && playerPosition) {
        // Initial pop phase
        if (fx.age < 0.25) {
          fx.vy -= 12 * delta;
          fx.mesh.position.x += fx.vx * delta;
          fx.mesh.position.y += fx.vy * delta;
          fx.mesh.position.z += fx.vz * delta;
        } else {
          // Magnet phase
          const tx = playerPosition.x;
          const ty = playerPosition.y + 0.65;
          const tz = playerPosition.z;
          const dx = tx - fx.mesh.position.x;
          const dy = ty - fx.mesh.position.y;
          const dz = tz - fx.mesh.position.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist > 0.0001) {
            const ageFactor = Math.min(1.0, (fx.age - 0.25) * 2);
            const speed = 6.0 + ageFactor * 14.0; // Accelerate
            const step = Math.min(dist, speed * delta);
            fx.mesh.position.x += (dx / dist) * step;
            fx.mesh.position.y += (dy / dist) * step;
            fx.mesh.position.z += (dz / dist) * step;
          }

          if (dist < 0.45) fx.life = 0;
        }

        // Smoothly spin items
        fx.mesh.rotation.x += fx.rvx * delta;
        fx.mesh.rotation.y += fx.rvy * delta;
        fx.mesh.rotation.z += fx.rvz * delta;

        const pullScale = Math.max(0.15, fx.mesh.scale.x * 0.95);
        fx.mesh.scale.set(pullScale, pullScale, pullScale);
      }

      fx.mesh.material.opacity = Math.max(
        0,
        fx.life / (fx.attract ? 0.55 : 0.24)
      );
      if (fx.life > 0) continue;

      this.scene.remove(fx.mesh);
      fx.mesh.material.dispose();
      this.pickupEffects.splice(i, 1);
    }
  }

  getParticleTexture(id) {
    if (this.particleCache.has(id)) return this.particleCache.get(id);
    const path = this.particleTextures[id];
    if (path) {
      const tex = this.textureLoader.load(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      this.particleCache.set(id, tex);
      return tex;
    }
    return null;
  }

  // ─── Igneous Sprite Particles ──────────────────────────────────────

  spawnIgneousBurst(x, y, z, type = 'soul') {
    const textureNames = {
      soul: Array.from({ length: 11 }, (_, i) => `soul_${i}`),
      spark: Array.from({ length: 8 }, (_, i) => `spark_${i}`),
      sweep: Array.from({ length: 8 }, (_, i) => `sweep_${i}`),
      portal: ['glint', 'spark_0', 'spark_1', 'spark_2'],
    };

    const names = textureNames[type] || textureNames.soul;
    const count = type === 'sweep' ? 3 : 20;

    for (let i = 0; i < count; i++) {
      const texName = names[0]; // Start at 0 for animated
      const tex = this.getParticleTexture(texName);
      if (!tex) continue;

      const material = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        color:
          type === 'soul' ? 0x8df6ff : type === 'portal' ? 0xbc8bff : 0xffffff,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);

      const scale = (type === 'sweep' ? 1.5 : 0.4) + Math.random() * 0.6;
      sprite.scale.set(scale, scale, 1);
      sprite.position.set(
        x + (Math.random() - 0.5) * 0.6,
        y + (Math.random() - 0.5) * 0.6,
        z + (Math.random() - 0.5) * 0.6
      );
      this.scene.add(sprite);

      this.spriteParticles.push({
        sprite,
        type,
        names,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 5 + 1.5,
        vz: (Math.random() - 0.5) * 4,
        life: 0.8 + Math.random() * 0.5,
        maxLife: 1.5,
        frame: 0,
        frameTimer: 0,
      });
    }
  }

  updateSpriteParticles(delta) {
    for (let i = this.spriteParticles.length - 1; i >= 0; i--) {
      const p = this.spriteParticles[i];
      p.life -= delta;

      p.sprite.position.x += p.vx * delta;
      p.sprite.position.y += p.vy * delta;
      p.sprite.position.z += p.vz * delta;

      p.vy -= 8 * delta; // Gravity
      p.vx *= 0.96;
      p.vz *= 0.96;

      // Simple frame animation (0.05s per frame)
      if (p.names.length > 1) {
        p.frameTimer += delta;
        if (p.frameTimer > 0.05) {
          p.frameTimer = 0;
          p.frame = (p.frame + 1) % p.names.length;
          const nextTex = this.getParticleTexture(p.names[p.frame]);
          if (nextTex) p.sprite.material.map = nextTex;
        }
      }

      const opacity = Math.min(1.0, p.life / 0.3);
      p.sprite.material.opacity = opacity;

      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.spriteParticles.splice(i, 1);
      }
    }
  }

  // ─── Per-frame update ─────────────────────────────────────────────

  update(delta, playerPosition) {
    const dt = Math.max(1 / 120, Math.min(1 / 24, delta));
    this.updateBreakParticles(dt);
    this.updatePickupEffects(dt, playerPosition);
    this.updateFlyingBlocks(dt);
    this.updateSpriteParticles(dt);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  clearAll() {
    for (const particle of this.breakParticles) {
      this.scene.remove(particle.mesh);
      particle.mesh.material.dispose();
    }
    this.breakParticles = [];

    for (const sprite of this.spriteParticles) {
      this.scene.remove(sprite.sprite);
      sprite.sprite.material.dispose();
    }
    this.spriteParticles = [];

    for (const pickup of this.pickupEffects) {
      this.scene.remove(pickup.mesh);
      pickup.mesh.material.dispose();
    }
    this.pickupEffects = [];

    for (const block of this.flyingBlocks) {
      this.scene.remove(block.mesh);
      block.mesh.material.dispose();
    }
    this.flyingBlocks = [];
  }
}
