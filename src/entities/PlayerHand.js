import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TOOLS } from '../data/tools.js';
import { FOOD_VALUES } from '../engine/SurvivalSystem.js';
import { normalizeBlockVariantId } from '../data/blockIds.js';

const itemTextureModules = import.meta.glob(
  '../Igneous_Pack/assets/minecraft/textures/item/*.png',
  { eager: true, query: '?url' }
);
const ITEM_TEXTURES = new Map();
for (const [path, module] of Object.entries(itemTextureModules)) {
  const fileName = path.split('/').pop().replace('.png', '');
  ITEM_TEXTURES.set(fileName, module.default || module);
}

const blockTextureModules = import.meta.glob(
  '../Igneous_Pack/assets/minecraft/textures/block/*.png',
  { eager: true, query: '?url' }
);
const BLOCK_TEXTURES = new Map();
for (const [path, module] of Object.entries(blockTextureModules)) {
  const fileName = path.split('/').pop().replace('.png', '');
  BLOCK_TEXTURES.set(fileName, module.default || module);
}

const TOOL_MAP = {
  // Basic Tools (ArloCraft IDs)
  pick_wood: 'wooden_pickaxe',
  axe_wood: 'wooden_axe',
  sword_wood: 'wooden_sword',
  shovel_wood: 'wooden_shovel',
  hoe_wood: 'wooden_hoe',
  pick_stone: 'stone_pickaxe',
  axe_stone: 'stone_axe',
  sword_stone: 'stone_sword',
  shovel_stone: 'stone_shovel',
  pick_iron: 'iron_pickaxe',
  axe_iron: 'iron_axe',
  sword_iron: 'iron_sword',
  shovel_iron: 'iron_shovel',
  pick_gold: 'golden_pickaxe',
  axe_gold: 'golden_axe',
  sword_gold: 'golden_sword',
  shovel_gold: 'golden_shovel',
  hoe_gold: 'golden_hoe',
  pick_diamond: 'diamond_pickaxe',
  axe_diamond: 'diamond_axe',
  sword_diamond: 'diamond_sword',
  shovel_diamond: 'diamond_shovel',
  hoe_diamond: 'diamond_hoe',

  // Feature Tools / Tech Gear
  sledge_iron: 'iron_pickaxe',
  iron_pick: 'iron_pickaxe',
  iron_sword: 'iron_sword',
  power_blade: 'netherite_sword',
  glitch_saber: 'diamond_sword',
  byte_axe: 'diamond_axe',
  echo_dagger: 'iron_sword',
  arc_spear: 'trident',
  plasma_hammer: 'netherite_axe',
  data_drill: 'diamond_pickaxe',

  // Legacy / Type Fallbacks
  pick: 'wooden_pickaxe',
  sword: 'wooden_sword',
  axe: 'wooden_axe',
  shovel: 'wooden_shovel',
  hoe: 'wooden_hoe',

  // Items & Food
  tomato: 'sweet_berries',
  blueberry: 'sweet_berries',
  strawberry: 'sweet_berries',
  carrot: 'carrot',
  potato: 'potato',
  iron_ingot: 'iron_ingot',
  gold_ingot: 'gold_ingot',
  diamond: 'diamond',
  stick: 'stick',
  musket: 'musket',
  pistol: 'pistol',
  blunderbuss: 'blunderbuss',
  hoe_stone: 'stone_hoe',
  hoe_iron: 'iron_hoe',
  bone_meal: 'bone_meal',
};
const GRASS_PREVIEW_TINT = 0x79c05a;

// --- Viewmodel animation tuning ---
const REST_POS = Object.freeze({ x: 0.65, y: -0.55, z: -0.75 });
const REST_ROT = Object.freeze({ x: 0.1, y: -0.4, z: 0 });
const WALK_SPEED = 6.2; // Physics.walkSpeed; bob reaches full strength here
const SWAY_GAIN = 0.045; // offset per rad/s of look velocity
const SWAY_LIMIT = 0.28;
const SWAY_STIFFNESS = 140;
const SWAY_DAMPING = 15;
const EQUIP_DURATION = 0.3;
const SWING_DURATIONS = Object.freeze({
  SLASH: 0.34,
  CHOP: 0.36,
  RECOIL: 0.32,
  SHAKE: 0.28,
  PUNCH: 0.28,
  PLACE: 0.22,
});

/** Frame-rate independent exponential smoothing. */
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function easeOutCubic(t) {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function disposeMaterialResources(material) {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    if (!entry) continue;
    if (typeof entry.dispose === 'function') entry.dispose();
  }
}

/**
 * Animated First-Person Viewmodel (Player Hand).
 * Handles arm mesh, held items, and procedural animations for walking/swinging.
 */
export class PlayerHand {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(REST_POS.x, REST_POS.y, REST_POS.z); // Natural FPS position
    this.group.rotation.set(REST_ROT.x, REST_ROT.y, REST_ROT.z);

    // Arm Mesh (Textured with Player Skin) - Proportions: 4x12x4 (Minecraft ratio)
    this.armGeometry = new THREE.BoxGeometry(0.21, 0.63, 0.21);
    this.armGeometry.rotateX(Math.PI / 2); // Map Top (Shoulder) to Z+ and Bottom (Hand) to Z-

    this.armMaterial = new THREE.MeshLambertMaterial({ color: 0x4a9eff }); // Initial Arlo Blue
    this.arm = new THREE.Mesh(this.armGeometry, this.armMaterial);
    this.arm.rotation.y = 0; // Point away from player
    this.arm.position.set(0, 0, 0.3); // Push forward
    this.group.add(this.arm);

    // Item Slot (Where blocks/tools are held)
    this.itemSlot = new THREE.Group();
    this.itemSlot.position.set(0, 0.15, -0.6); // Slightly further forward
    this.itemSlot.rotation.set(0.4, -0.2, 0); // Point forward naturally
    this.group.add(this.itemSlot);

    this.heldItemMesh = null;
    this.swingTime = 0;
    this.swingDuration = SWING_DURATIONS.PUNCH;
    this.swingType = 'PUNCH'; // Style for the held item
    this.swingStyle = 'PUNCH'; // Style of the swing currently playing
    this.bobCycle = 0;
    this.bobAmount = 0;
    this.elapsed = 0;
    this.equipTime = 0;
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.hasLookSample = false;
    this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
    this.canvas = document.createElement('canvas'); // For pixel reading
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.textureLoader = new THREE.TextureLoader();
    this.textureCache = new Map();
    this.pendingTextureLoads = new Map();
    this.geometryCache = new Map(); // Cache for merged voxel geometries
    this.swayOffset = new THREE.Vector2(); // x: yaw lag, y: pitch lag
    this.swayVelocity = new THREE.Vector2();
    this.disposed = false;
  }

  disposeHeldObject(object) {
    if (!object) return;
    object.userData.disposed = true;

    while (object.children?.length > 0) {
      const child = object.children[0];
      object.remove(child);
      this.disposeHeldObject(child);
    }

    if (
      object.userData?.ownedGeometry &&
      typeof object.geometry?.dispose === 'function'
    ) {
      object.geometry.dispose();
    }

    if (object.userData?.ownedMaterial) {
      disposeMaterialResources(object.material);
    }
  }

  loadTexture(url) {
    if (!url) return Promise.resolve(null);
    if (this.textureCache.has(url)) {
      return Promise.resolve(this.textureCache.get(url));
    }
    if (this.pendingTextureLoads.has(url)) {
      return this.pendingTextureLoads.get(url);
    }

    const pending = new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.colorSpace = THREE.SRGBColorSpace;
          this.textureCache.set(url, texture);
          this.pendingTextureLoads.delete(url);
          resolve(texture);
        },
        undefined,
        (error) => {
          this.pendingTextureLoads.delete(url);
          reject(error);
        }
      );
    });

    this.pendingTextureLoads.set(url, pending);
    return pending;
  }

  resolveTextureUrl(texture) {
    if (!texture) return null;
    return (
      texture.image?.currentSrc ||
      texture.image?.src ||
      texture.source?.data?.currentSrc ||
      texture.source?.data?.src ||
      null
    );
  }

  populateVoxelMesh(group, texture, url) {
    if (
      !group ||
      group.userData?.disposed ||
      this.disposed ||
      !texture?.image
    ) {
      return;
    }

    const img = texture.image;
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.ctx.clearRect(0, 0, img.width, img.height);
    this.ctx.drawImage(img, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const w = img.width;
    const h = img.height;

    const frontMat = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5,
    });
    const backMat = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5,
    });

    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), frontMat);
    front.position.z = 0.025;
    front.userData.ownedGeometry = true;
    front.userData.ownedMaterial = true;
    group.add(front);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), backMat);
    back.rotation.y = Math.PI;
    back.position.z = -0.025;
    back.userData.ownedGeometry = true;
    back.userData.ownedMaterial = true;
    group.add(back);

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= 128) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        count++;
      }
    }
    const edgeColor =
      count > 0
        ? new THREE.Color(
            rSum / count / 255,
            gSum / count / 255,
            bSum / count / 255
          ).multiplyScalar(0.6)
        : new THREE.Color(0x555555);
    const sideMat = new THREE.MeshLambertMaterial({ color: edgeColor });

    if (this.geometryCache.has(url)) {
      const cachedGeo = this.geometryCache.get(url);
      const sideMesh = new THREE.Mesh(cachedGeo, sideMat);
      sideMesh.userData.ownedMaterial = true;
      group.add(sideMesh);
      return;
    }

    const pixelW = 0.7 / w;
    const pixelH = 0.7 / h;
    const edgeGeometries = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const alpha = data[idx + 3];
        if (alpha < 128) continue;

        const up = y > 0 ? data[((y - 1) * w + x) * 4 + 3] : 0;
        const down = y < h - 1 ? data[((y + 1) * w + x) * 4 + 3] : 0;
        const left = x > 0 ? data[(y * w + (x - 1)) * 4 + 3] : 0;
        const right = x < w - 1 ? data[(y * w + (x + 1)) * 4 + 3] : 0;

        if (up < 128 || down < 128 || left < 128 || right < 128) {
          const posX = (x / w - 0.5) * 0.7 + pixelW * 0.5;
          const posY = (0.5 - y / h) * 0.7 - pixelH * 0.5;
          const geo = new THREE.BoxGeometry(pixelW, pixelH, 0.04);
          geo.translate(posX, posY, 0);
          edgeGeometries.push(geo);
        }
      }
    }

    if (edgeGeometries.length > 0) {
      const mergedGeo = BufferGeometryUtils.mergeGeometries(edgeGeometries);
      const sideMesh = new THREE.Mesh(mergedGeo, sideMat);
      sideMesh.userData.ownedMaterial = true;
      group.add(sideMesh);

      this.geometryCache.set(url, mergedGeo);
      edgeGeometries.forEach((geo) => geo.dispose());
    } else {
      sideMat.dispose();
    }
  }

  buildGunMesh(tool) {
    const model = new THREE.Group();
    const baseColor =
      tool.id === 'rail_rifle'
        ? 0x9cb8ff
        : tool.id === 'scatter_blaster'
          ? 0xffb35a
          : 0x7ee8ff;
    const bodyMat = new THREE.MeshLambertMaterial({
      color: baseColor,
      emissive: 0x121212,
    });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1f2430 });
    const glowMat = new THREE.MeshLambertMaterial({
      color: 0x9ff8ff,
      emissive: 0x246a74,
    });

    const makePart = (w, h, d, mat, x, y, z) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
      part.position.set(x, y, z);
      part.userData.ownedGeometry = true;
      part.userData.ownedMaterial = true;
      model.add(part);
    };

    // Grip
    makePart(0.12, 0.24, 0.12, darkMat, -0.14, -0.1, 0.02);
    // Main body
    makePart(0.42, 0.14, 0.17, bodyMat, 0.02, 0.02, -0.02);
    // Barrel
    makePart(0.28, 0.08, 0.08, darkMat, 0.34, 0.02, -0.02);
    // Sight
    makePart(0.08, 0.05, 0.05, glowMat, 0.1, 0.11, -0.02);

    if (tool.id === 'rail_rifle') {
      makePart(0.24, 0.07, 0.07, glowMat, 0.54, 0.02, -0.02);
      makePart(0.28, 0.1, 0.1, darkMat, -0.18, 0.02, -0.02);
      model.scale.set(1.1, 1.0, 0.92);
    } else if (tool.id === 'scatter_blaster') {
      makePart(0.18, 0.16, 0.2, bodyMat, 0.24, 0.02, -0.02);
      makePart(0.12, 0.1, 0.1, darkMat, 0.43, 0.02, 0.05);
      makePart(0.12, 0.1, 0.1, darkMat, 0.43, 0.02, -0.09);
      model.scale.set(0.98, 1.05, 1.06);
    }

    model.rotation.set(0.1, -0.2, 0.1);
    model.position.set(0.05, -0.03, -0.01);
    bodyMat.dispose();
    darkMat.dispose();
    glowMat.dispose();
    return model;
  }

  buildToolMesh(tool) {
    let texName = tool?.id || 'stick';
    if (tool?.type && TOOL_MAP[tool.type]) texName = TOOL_MAP[tool.type];
    else if (tool?.id && TOOL_MAP[tool.id]) texName = TOOL_MAP[tool.id];

    const url = ITEM_TEXTURES.get(texName) || ITEM_TEXTURES.get('stick');

    if (url) {
      const mesh = this.createVoxelMesh(url);
      mesh.position.set(0, 0.25, -0.1);
      return mesh;
    }

    // Deep fallback
    const model = new THREE.Group();
    const handleMat = new THREE.MeshLambertMaterial({ color: 0x6f4b2b });
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.34, 0.08),
      handleMat
    );
    handle.userData.ownedGeometry = true;
    handle.userData.ownedMaterial = true;
    model.add(handle);
    return model;
  }

  createVoxelMesh(url) {
    const group = new THREE.Group();
    if (!url) return group;
    this.loadTexture(url)
      .then((texture) => {
        if (!texture || group.userData?.disposed || this.disposed) return;
        this.populateVoxelMesh(group, texture, url);
      })
      .catch((error) => {
        console.warn(
          '[ArloCraft] Failed to load held-item texture:',
          url,
          error
        );
      });

    // Apply pending tint if set
    if (group.userData.pendingTint) {
      const tint = group.userData.pendingTint;
      group.traverse((c) => {
        if (c.material) {
          if (Array.isArray(c.material))
            c.material.forEach((m) => m.color?.set(tint));
          else c.material.color?.set(tint);
        }
      });
    }

    return group;
  }

  setHeldItem(itemId, registry, selectedItem = null) {
    // Clear previous item
    while (this.itemSlot.children.length > 0) {
      const child = this.itemSlot.children[0];
      this.itemSlot.remove(child);
      try {
        this.disposeHeldObject(child);
      } catch (error) {
        console.warn(
          '[ArloCraft] Held-item cleanup skipped due to disposal error:',
          error
        );
      }
    }
    this.heldItemMesh = null;

    // Re-equip dip: the new item rises into view from below.
    this.equipTime = EQUIP_DURATION;

    if (!itemId) {
      this.swingType = 'PUNCH';
      return;
    }

    const normalizedId = normalizeBlockVariantId(itemId);
    const tool = this.toolById.get(normalizedId);
    const blockConfig = registry.blocks.get(normalizedId);
    const isTool = selectedItem?.kind === 'tool' || Boolean(tool);

    // Determine Swing Type
    if (isTool) {
      if (
        itemId.includes('sword') ||
        itemId.includes('blade') ||
        itemId.includes('dagger')
      )
        this.swingType = 'SLASH';
      else if (
        itemId.includes('pick') ||
        itemId.includes('axe') ||
        itemId.includes('hammer') ||
        itemId.includes('drill')
      )
        this.swingType = 'CHOP';
      else if (
        itemId.includes('musket') ||
        itemId.includes('pistol') ||
        itemId.includes('blunderbuss')
      )
        this.swingType = 'RECOIL';
      else this.swingType = 'CHOP';
    } else {
      this.swingType = 'SHAKE';
    }
    const isDeco = blockConfig?.deco;
    const isFood = Boolean(FOOD_VALUES[itemId] || itemId === 'milk_bucket');
    const isItem = isTool || isDeco || isFood || itemId.includes('bucket');

    let textureKey = blockConfig?.textureId || normalizedId;
    if (
      blockConfig?.pairId &&
      typeof textureKey === 'string' &&
      textureKey.endsWith('_bottom')
    ) {
      const pairTextureKey = registry.blocks.get(blockConfig.pairId)?.textureId;
      if (pairTextureKey) textureKey = pairTextureKey;
    }

    if (isItem) {
      let texName = textureKey;

      if (isTool) {
        if (tool?.type && TOOL_MAP[tool.type]) texName = TOOL_MAP[tool.type];
        else if (tool?.id && TOOL_MAP[tool.id]) texName = TOOL_MAP[tool.id];
      } else if (isFood) {
        if (TOOL_MAP[itemId]) texName = TOOL_MAP[itemId];
      } else if (itemId.includes('bucket')) {
        texName = itemId;
      }

      const url =
        ITEM_TEXTURES.get(texName) ||
        ITEM_TEXTURES.get(normalizedId) ||
        BLOCK_TEXTURES.get(texName);

      if (url || isDeco) {
        let previewUrl = url;
        if (!previewUrl) {
          // Fallback to block texture if no item texture found
          const mat = registry.getMaterial(normalizedId);
          // Handle multi-texture materials (pick a side face usually)
          const texture = Array.isArray(mat)
            ? mat[4].map || mat[0].map
            : mat.map;
          if (!texture && Array.isArray(mat)) {
            // Find any texture in the array
            previewUrl = this.resolveTextureUrl(mat.find((m) => m.map)?.map);
          } else {
            previewUrl = this.resolveTextureUrl(texture);
          }
        }

        if (previewUrl) {
          const mesh = this.createVoxelMesh(previewUrl);
          mesh.position.set(0, 0.25, -0.1);

          const tid = textureKey.toLowerCase();
          const nid = normalizedId.toLowerCase();
          const needsTint =
            tid.includes('grass') ||
            tid.includes('fern') ||
            tid.includes('leaves') ||
            nid.includes('grass') ||
            nid.includes('fern') ||
            nid.includes('leaves') ||
            nid === 'sugar_cane' ||
            nid === 'vine';

          if (needsTint) {
            mesh.userData.pendingTint = GRASS_PREVIEW_TINT;
            mesh.traverse((child) => {
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach((m) =>
                    m.color?.set(GRASS_PREVIEW_TINT)
                  );
                } else {
                  child.material.color?.set(GRASS_PREVIEW_TINT);
                }
              }
            });
          }

          this.itemSlot.add(mesh);
          this.heldItemMesh = mesh;
          return;
        }
      }

      if (isTool) {
        const mesh =
          tool?.type === 'gun'
            ? this.buildGunMesh(tool)
            : this.buildToolMesh(tool ?? { id: normalizedId });
        this.itemSlot.add(mesh);
        this.heldItemMesh = mesh;
        return;
      }
    }

    // Try to get a block mesh from the registry
    const sourceMaterial = registry.getMaterial(normalizedId);
    const material = Array.isArray(sourceMaterial)
      ? sourceMaterial.map((mat) => (mat?.clone ? mat.clone() : mat))
      : sourceMaterial?.clone
        ? sourceMaterial.clone()
        : sourceMaterial;
    const tintColor = new THREE.Color(GRASS_PREVIEW_TINT);
    const applyTint = (m) => {
      if (m?.userData?.tintable) m.color.copy(tintColor);
    };
    if (Array.isArray(material)) material.forEach(applyTint);
    else applyTint(material);
    const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.ownedGeometry = true;
    mesh.userData.ownedMaterial = true;
    this.itemSlot.add(mesh);
    this.heldItemMesh = mesh;
  }

  /**
   * Trigger an action swing.
   * @param {'attack'|'place'} [kind='attack'] - 'attack' (mine/hit) uses the
   *   held item's swing style; 'place' is a short forward "use" jab.
   */
  swing(kind = 'attack') {
    if (kind === 'place') {
      // Discrete click: always restart so rapid placing reads clearly.
      this.swingStyle = 'PLACE';
      this.swingDuration = SWING_DURATIONS.PLACE;
      this.swingTime = this.swingDuration;
      return;
    }
    // Held mining calls this every frame; let the current arc finish so the
    // animation loops cleanly instead of restarting mid-stroke.
    if (this.swingTime > 0) return;
    this.swingStyle = this.swingType;
    this.swingDuration =
      SWING_DURATIONS[this.swingType] ?? SWING_DURATIONS.SHAKE;
    this.swingTime = this.swingDuration;
  }

  /** Find the camera driving the viewmodel (group -> viewmodelGroup -> camera). */
  resolveLookSource() {
    let node = this.group.parent;
    while (node) {
      if (node.isCamera) return node;
      node = node.parent;
    }
    return null;
  }

  /**
   * Per-frame viewmodel animation. All motion is composed as offsets from a
   * fixed rest pose each frame, so effects layer without fighting each other.
   * Allocation-free and frame-rate independent.
   * @param {number} delta - seconds since last frame
   * @param {number} bobCycle - shared walk phase (Player.bobCycle)
   * @param {boolean} isMoving - legacy flag; used when moveSpeed is omitted
   * @param {number} [moveSpeed] - horizontal speed in blocks/s
   * @param {boolean} [grounded=true] - whether the player is on the ground
   */
  update(delta, bobCycle, isMoving, moveSpeed, grounded = true) {
    // Clamp so a hitch (tab switch, GC) can't explode the springs.
    const dt = Math.min(Math.max(delta || 0, 0), 0.05);
    if (dt <= 0) return;
    this.elapsed += dt;
    this.bobCycle = bobCycle;

    // --- Walk bob amount, smoothed and tied to horizontal speed ---
    const speed = Number.isFinite(moveSpeed)
      ? moveSpeed
      : isMoving
        ? WALK_SPEED
        : 0;
    const targetBob = grounded ? Math.min(speed / WALK_SPEED, 1.35) : 0;
    this.bobAmount = damp(this.bobAmount, targetBob, 8, dt);

    // --- Look sway: spring toward a lag offset driven by look angular velocity ---
    const cam = this.resolveLookSource();
    let targetYaw = 0;
    let targetPitch = 0;
    if (cam) {
      const yaw = cam.rotation.y;
      const pitch = cam.rotation.x;
      if (this.hasLookSample) {
        const dYaw = wrapAngle(yaw - this.lastYaw);
        const dPitch = pitch - this.lastPitch;
        // Ignore teleports / respawn snaps.
        if (Math.abs(dYaw) < 0.6 && Math.abs(dPitch) < 0.6) {
          targetYaw = THREE.MathUtils.clamp(
            (dYaw / dt) * SWAY_GAIN,
            -SWAY_LIMIT,
            SWAY_LIMIT
          );
          targetPitch = THREE.MathUtils.clamp(
            (dPitch / dt) * SWAY_GAIN,
            -SWAY_LIMIT,
            SWAY_LIMIT
          );
        }
      }
      this.lastYaw = yaw;
      this.lastPitch = pitch;
      this.hasLookSample = true;
    }
    // Semi-implicit damped spring (slight overshoot = sense of weight).
    const sv = this.swayVelocity;
    const so = this.swayOffset;
    sv.x += (targetYaw - so.x) * SWAY_STIFFNESS * dt;
    sv.y += (targetPitch - so.y) * SWAY_STIFFNESS * dt;
    const swayDamp = Math.exp(-SWAY_DAMPING * dt);
    sv.x *= swayDamp;
    sv.y *= swayDamp;
    so.x += sv.x * dt;
    so.y += sv.y * dt;

    // --- Equip dip: snap down on slot change, ease-out back up ---
    let equipDip = 0;
    if (this.equipTime > 0) {
      this.equipTime = Math.max(0, this.equipTime - dt);
      equipDip = 1 - easeOutCubic(1 - this.equipTime / EQUIP_DURATION);
    }

    // --- Rest pose ---
    let px = REST_POS.x;
    let py = REST_POS.y;
    let pz = REST_POS.z;
    let rx = REST_ROT.x;
    let ry = REST_ROT.y;
    let rz = REST_ROT.z;

    // Walk bob: one lateral sway per stride, a dip on each footfall, a touch of roll.
    const b = this.bobAmount;
    const stride = Math.sin(bobCycle);
    const step = Math.abs(Math.cos(bobCycle));
    px += stride * 0.022 * b;
    py += (step - 0.5) * 0.026 * b;
    rz += stride * 0.035 * b;
    rx += (step - 0.5) * 0.03 * b;

    // Idle breathe: fades out as walk bob takes over.
    const idle = Math.max(0, 1 - b);
    const breathe = Math.sin(this.elapsed * 1.7);
    py += breathe * 0.007 * idle;
    rx += breathe * 0.012 * idle;
    px += Math.sin(this.elapsed * 0.9) * 0.003 * idle;

    // Look sway: hand trails behind the view (yaw+ = turning left,
    // pitch+ = looking up), so offsets oppose the look direction.
    px -= so.x * 0.35;
    py -= so.y * 0.35;
    ry -= so.x * 0.5;
    rx -= so.y * 0.4;
    rz += so.x * 0.3;

    // Equip dip.
    py -= equipDip * 0.5;
    rx -= equipDip * 0.6;

    // --- Action swing: fast strike, eased recovery ---
    if (this.swingTime > 0) {
      this.swingTime = Math.max(0, this.swingTime - dt);
      const p = 1 - this.swingTime / this.swingDuration; // 0 -> 1
      // sin(sqrt(p)*PI) snaps to its peak in the first quarter, then eases out.
      const arc = Math.sin(Math.sqrt(p) * Math.PI);
      const arc2 = Math.sin(Math.sqrt(p) * Math.PI * 2);
      const out = Math.sin(p * Math.PI);

      switch (this.swingStyle) {
        case 'SLASH':
          // Diagonal sweep from upper-right across the screen.
          px -= arc * 0.42;
          py += arc2 * 0.12;
          pz -= out * 0.18;
          ry += arc * 1.05;
          rz += arc * 0.7;
          rx -= arc * 0.35;
          break;
        case 'CHOP':
          // Overhead strike that bites forward and down.
          rx -= arc * 1.25;
          py += arc2 * 0.1;
          pz -= arc * 0.32;
          px -= arc * 0.12;
          ry += arc * 0.25;
          break;
        case 'RECOIL': {
          // Instant kick back, slow settle.
          const inv = 1 - p;
          const kick = inv * inv * inv;
          pz += kick * 0.22;
          py += kick * 0.04;
          rx += kick * 0.55;
          break;
        }
        case 'PLACE':
          // Short forward "use" jab with a slight inward tuck.
          pz -= arc * 0.22;
          py += arc * 0.05;
          px -= arc * 0.08;
          rx -= arc * 0.35;
          ry += arc * 0.15;
          break;
        default:
          // PUNCH / SHAKE: Minecraft-style hook toward the crosshair.
          px -= arc * 0.3;
          py += arc2 * 0.16;
          pz -= out * 0.24;
          ry += arc * 0.6;
          rz += arc2 * 0.25;
          rx -= arc * 0.55;
          break;
      }
    }

    this.group.position.set(px, py, pz);
    this.group.rotation.set(rx, ry, rz);
  }

  updateArmSkin(armMaterials) {
    if (!armMaterials) return;
    this.arm.material = armMaterials;
    armMaterials.forEach((m) => {
      m.needsUpdate = true;
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    while (this.itemSlot.children.length > 0) {
      const child = this.itemSlot.children[0];
      this.itemSlot.remove(child);
      this.disposeHeldObject(child);
    }

    for (const geometry of this.geometryCache.values()) {
      geometry?.dispose?.();
    }
    this.geometryCache.clear();

    for (const texture of this.textureCache.values()) {
      texture?.dispose?.();
    }
    this.textureCache.clear();
    this.pendingTextureLoads.clear();

    if (this.arm.material === this.armMaterial) {
      this.armMaterial?.dispose?.();
    }
    this.armGeometry?.dispose?.();

    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
