import * as THREE from 'three';
import { BLOCKS } from '../data/blocks.js';
import { normalizeBlockVariantId } from '../data/blockIds.js';

import { ResourcePackManager } from '../world/ResourcePackManager.js';

export class BlockRegistry {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.blocks = new Map();
    this.materialCache = new Map();
    this.textureCache = new Map();
    this.atlasTileCache = new Map();
    this.pixelTextures = new Map();
    this.breakingTextures = [];
    this.breakingMaterialCache = [];
    this.animatedGif = null;
    this.idAliases = {
      wood: 'oak_log',
      leaves: 'oak_leaves',
      wood_birch: 'birch_log',
      leaves_birch: 'birch_leaves',
      wood_pine: 'spruce_log',
      leaves_pine: 'spruce_leaves',
      wood_cherry: 'cherry_log',
      leaves_cherry: 'cherry_leaves',
      wood_crystal: 'crystal_log',
      leaves_crystal: 'crystal_leaves',
      wood_palm: 'jungle_log',
      leaves_palm: 'jungle_leaves',
      wood_willow: 'mangrove_log',
      leaves_willow: 'mangrove_leaves',
      tall_grass: 'tall_grass_bottom',
      mushroom_red: 'red_mushroom',
      mushroom_brown: 'brown_mushroom',
      berry_bush: 'sweet_berry_bush',
      nuke: 'nuke',
      fire: 'fire_0',
      wool_white: 'white_wool',
      wool_orange: 'orange_wool',
      wool_magenta: 'magenta_wool',
      wool_light_blue: 'light_blue_wool',
      wool_yellow: 'yellow_wool',
      wool_lime: 'lime_wool',
      wool_pink: 'pink_wool',
      wool_gray: 'gray_wool',
      wool_light_gray: 'light_gray_wool',
      wool_cyan: 'cyan_wool',
      wool_purple: 'purple_wool',
      wool_blue: 'blue_wool',
      wool_brown: 'brown_wool',
      wool_green: 'green_wool',
      wool_red: 'red_wool',
      wool_black: 'black_wool',
      stained_glass_white: 'white_stained_glass',
      stained_glass_orange: 'orange_stained_glass',
      stained_glass_magenta: 'magenta_stained_glass',
      stained_glass_light_blue: 'light_blue_stained_glass',
      stained_glass_yellow: 'yellow_stained_glass',
      stained_glass_lime: 'lime_stained_glass',
      stained_glass_pink: 'pink_stained_glass',
      stained_glass_gray: 'gray_stained_glass',
      stained_glass_light_gray: 'light_gray_stained_glass',
      stained_glass_cyan: 'cyan_stained_glass',
      stained_glass_purple: 'purple_stained_glass',
      stained_glass_blue: 'blue_stained_glass',
      stained_glass_brown: 'brown_stained_glass',
      stained_glass_green: 'green_stained_glass',
      stained_glass_red: 'red_stained_glass',
      stained_glass_black: 'black_stained_glass',
      tomato: 'sweet_berry_bush_stage3',
      tomato_stage3: 'sweet_berry_bush_stage3',
    };
    this.VIRTUAL_IDS = new Set([
      'cave_lush',
      'cave_default',
      'cave_dripstone',
      'common_village',
      'structure_center',
      'teleport_marker',
    ]);
    this.stainedGlassColors = {
      white: 0xffffff,
      orange: 0xd87f33,
      magenta: 0xb24cd8,
      light_blue: 0x6699d8,
      yellow: 0xe5e533,
      lime: 0x7fcc19,
      pink: 0xf27fa5,
      gray: 0x4c4c4c,
      light_gray: 0x999999,
      cyan: 0x4c7f99,
      purple: 0x7f3fb2,
      blue: 0x334cb2,
      brown: 0x664c33,
      green: 0x667f33,
      red: 0x993333,
      black: 0x191919,
    };
    this.missingTexture = this.createMissingTexture();
    this.resourceManager = ResourcePackManager.getInstance();
  }

  createMissingTexture() {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    // Magenta/Black Checkerboard (The standard "Missing Texture" tell)
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  async init() {
    this.blockTextures = new Map();
    await this.resourceManager.ready();

    const igneousFaceSuffixes = [
      '_side_overlay',
      '_top',
      '_bottom',
      '_side',
      '_front',
      '_back',
      '_end',
    ];

    const compoundIds = new Set([
      'tall_grass_bottom',
      'tall_grass_top',
      'grass_block_snow',
      'large_fern_bottom',
      'large_fern_top',
      'rose_bush_bottom',
      'rose_bush_top',
      'peony_bottom',
      'peony_top',
      'lilac_bottom',
      'lilac_top',
      'sunflower_bottom',
      'sunflower_top',
    ]);

    const globalAliases = {
      iron: 'iron_block',
      coal: 'coal_block',
      copper: 'copper_block',
      gold: 'gold_block',
      lapis: 'lapis_block',
      diamond: 'diamond_block',
      emerald: 'emerald_block',
      redstone: 'redstone_block',
      path_block: 'dirt_path',
      short_grass: 'grass',
      dripstone: 'dripstone_block',
      tall_grass_bottom: 'grass',
      tall_grass_top: 'grass',
      large_fern_bottom: 'fern',
      large_fern_top: 'fern',
      nuke: 'tnt',
      chest: 'barrel',
    };

    for (const fileName of this.resourceManager.manifest) {
      let baseName = fileName.replace('.png', '');
      const url = this.resourceManager.getTextureUrl(fileName);

      // Handling breaking stages
      if (baseName.startsWith('destroy_stage_')) {
        const stage = parseInt(baseName.replace('destroy_stage_', ''));
        this.breakingTextures[stage] = url;
        const tex = this.loadTexture(url);
        this.breakingMaterialCache[stage] = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          blending: THREE.MultiplyBlending,
          premultipliedAlpha: true,
          side: THREE.FrontSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1.5,
        });
        continue;
      }

      let blockId = baseName;
      let faceKey = 'all.png';

      for (const suffix of igneousFaceSuffixes) {
        if (baseName.endsWith(suffix) && !compoundIds.has(baseName)) {
          // Special case: grass_block needs its full name to match correctly
          if (baseName.startsWith('grass_block_')) {
             blockId = 'grass_block';
          } else {
             blockId = baseName.substring(0, baseName.length - suffix.length);
          }
          faceKey = suffix.substring(1) + '.png'; // e.g. "top.png"
          break;
        }
      }

      const addTexture = (id, face, assetUrl) => {
        if (!this.blockTextures.has(id)) this.blockTextures.set(id, {});
        this.blockTextures.get(id)[face] = assetUrl;
      };

      addTexture(blockId, faceKey, url);

      // Apply aliases
      for (const [alias, target] of Object.entries(globalAliases)) {
        if (blockId === target) {
          addTexture(alias, faceKey, url);
        }
      }
    }

    BLOCKS.forEach((config) => {
      this.blocks.set(config.id, config);
    });
    this.loadStunningExpansion();
  }

  async loadStunningExpansion() {
    const base = import.meta.env.BASE_URL || '/';
    const assetPath = base.endsWith('/') ? base : base + '/';
    
    const paths = {
      anton: assetPath + 'arlo_real.png',
    };

    const loadOne = (id, path) => {
      const tex = this.textureLoader.load(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      this.pixelTextures.set(id, tex);
    };

    for (const [id, path] of Object.entries(paths)) {
      loadOne(id, path);
    }

    this.updateMaterialsWithStunningAssets();
  }

  updateMaterialsWithStunningAssets() {
    const idToTexKey = {
      fern: 'fern',
      banana: 'banana',
    };

    for (const [id, texKey] of Object.entries(idToTexKey)) {
      const tex = this.pixelTextures.get(texKey);
      if (!tex) continue;

      if (id === 'furnace' || id === 'starter_chest') {
        const sideMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
        this.materialCache.set(id, [
          sideMaterial,
          sideMaterial,
          sideMaterial,
          sideMaterial,
          new THREE.MeshLambertMaterial({ map: tex }),
          sideMaterial,
        ]);
      } else {
        this.materialCache.set(
          id,
          new THREE.MeshLambertMaterial({
            map: tex,
            transparent: false,
            alphaTest: 0.5,
            depthWrite: true,
          })
        );
      }
    }
  }

  injectWindShader(material, options = {}) {
    if (!material) return;
    if (Array.isArray(material)) {
      for (const entry of material) this.injectWindShader(entry, options);
      return;
    }
    if (material.userData?.windInjected) return;
    material.userData.windInjected = true;

    const speed = options.speed || 1.15;
    const scale = options.scale || 0.12;
    const frequency = options.frequency || 2.5;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWindParams = {
        value: new THREE.Vector3(speed, scale, frequency),
      };
      shader.uniforms.uSwayFactor = { value: 1.0 }; // Default to enabled

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
                    uniform float uTime;
                    uniform vec3 uWindParams;
                    uniform float uSwayFactor;`
        )
        .replace(
          '#include <begin_vertex>',
          `
                    #include <begin_vertex>
                    // Wind swaying logic: Multi-frequency for organic 'fluffy' motion
                    float t = uTime * uWindParams.x;
                    float factor = clamp(transformed.y + 0.5, 0.0, 1.2) * uSwayFactor; 
                    float phase = (position.x + position.y + position.z) * uWindParams.z;
                    
                    // Large-scale Sway
                    float swayX = sin(t + phase) * uWindParams.y * 0.45 * factor;
                    float swayZ = cos(t * 0.8 + phase) * uWindParams.y * 0.45 * factor;
                    
                    // High-frequency Flutter (The 'Stunning' leaf shimmer)
                    float flutter = sin(t * 12.0 + phase * 20.0) * 0.012 * factor;
                    
                    // Low-frequency Billowing (Breathing effect to break rigid lines)
                    float billow = sin(t * 0.65 + phase * 0.5) * 0.022 * factor;
                    
                    transformed.x += swayX + flutter;
                    transformed.z += swayZ + flutter;
                    transformed.y += billow + (flutter * 0.5);
                    `
        );
      material.userData.shader = shader;
    };
    material.needsUpdate = true;
  }

  enhanceFaceShading(material, options = {}) {
    if (!material) return;
    if (Array.isArray(material)) {
      for (const entry of material) this.enhanceFaceShading(entry, options);
      return;
    }
    if (!material.isMeshLambertMaterial) return;
    if (material.userData?.alphaCutout) return;
    if (material.transparent) return;
    if (material.userData?.faceAoEnhanced) return;

    const strength = Number.isFinite(options.strength)
      ? options.strength
      : 0.12;
    const edgeWidth = Number.isFinite(options.edgeWidth)
      ? options.edgeWidth
      : 0.22;

    material.userData.faceAoEnhanced = true;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFaceAoStrength = { value: strength };
      shader.uniforms.uFaceAoEdgeWidth = { value: edgeWidth };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vFaceAoUv;`
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
vFaceAoUv = uv;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vFaceAoUv;
uniform float uFaceAoStrength;
uniform float uFaceAoEdgeWidth;`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
float faceAoEdgeDist = min(min(vFaceAoUv.x, 1.0 - vFaceAoUv.x), min(vFaceAoUv.y, 1.0 - vFaceAoUv.y));
float faceAoMask = 1.0 - smoothstep(0.0, uFaceAoEdgeWidth, faceAoEdgeDist);
// Refined curve: sharper corners, smoother falloff for a more 'baked' look
float faceAoCorner = pow(faceAoMask, 1.6);
diffuseColor.rgb *= (1.0 - (faceAoCorner * uFaceAoStrength));`
        );
    };
    material.customProgramCacheKey = () =>
      `face-ao:${strength.toFixed(3)}:${edgeWidth.toFixed(3)}`;
    material.needsUpdate = true;
  }

  configureTransparentMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      for (let i = 0; i < material.length; i++) {
        this.configureTransparentMaterial(material[i]);
      }
      return;
    }
    const alphaCutout =
      Number(material.alphaTest) > 0.001 ||
      Boolean(material.userData?.alphaCutout);
    if (alphaCutout) {
      material.transparent = false;
      material.opacity = 1;
      material.alphaToCoverage = false;
      material.depthWrite = true;
      return;
    }
    if (material.transparent) {
      material.alphaToCoverage = false;
      material.depthWrite = false;
    }
  }

  loadTexture(src) {
    const cropAnimatedStrip =
      arguments[1]?.cropAnimatedStrip === true;
    const cacheKey = cropAnimatedStrip ? `${src}#static-frame` : src;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey);

    const texture = this.textureLoader.load(src, (loaded) => {
      if (!cropAnimatedStrip) return;

      const image = loaded.image;
      const width = Number(image?.width) || 0;
      const height = Number(image?.height) || 0;
      if (!width || !height) return;

      let frameSize = 0;
      let sx = 0;
      let sy = 0;

      if (height > width && height % width === 0) {
        frameSize = width;
      } else if (width > height && width % height === 0) {
        frameSize = height;
      }

      if (!frameSize) return;

      const canvas = document.createElement('canvas');
      canvas.width = frameSize;
      canvas.height = frameSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, sx, sy, frameSize, frameSize, 0, 0, frameSize, frameSize);

      loaded.image = canvas;
      loaded.needsUpdate = true;
    });
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    
    // Support Anisotropic Filtering for crisp distance rendering
    const maxAnisotropy = this.game?.renderer?.instance?.capabilities?.getMaxAnisotropy?.() || 1;
    texture.anisotropy = Math.min(16, maxAnisotropy);
    
    // Support tiled textures for Greedy Meshed quads
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  getTextureLoadOptionsForBlock(id) {
    const lowId = String(id || '').toLowerCase();
    return {
      cropAnimatedStrip:
        lowId === 'lantern' ||
        lowId === 'soul_lantern' ||
        lowId === 'command_block' ||
        lowId === 'chain_command_block' ||
        lowId === 'repeating_command_block' ||
        lowId === 'redstone_lamp_on' ||
        lowId === 'furnace_active',
    };
  }

  createCanvasTexture(size, painter) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    painter(ctx, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createStarterChestMaterial() {
    const makeFace = (face) =>
      this.createCanvasTexture(16, (ctx, size) => {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#6e431d';
        for (let y = 0; y < size; y += 4) {
          ctx.fillRect(0, y, size, 1);
        }
        ctx.fillStyle = '#a66d34';
        ctx.fillRect(0, 2, size, 2);
        ctx.fillRect(0, size - 4, size, 2);

        if (face === 'top') {
          ctx.fillStyle = '#b37a3d';
          ctx.fillRect(1, 1, size - 2, size - 2);
          ctx.fillStyle = '#6e431d';
          ctx.fillRect(0, 7, size, 2);
          return;
        }

        ctx.fillStyle = '#3d2614';
        ctx.fillRect(0, 7, size, 2);
        ctx.fillStyle = '#caa25b';
        ctx.fillRect(6, 6, 4, 4);
        if (face === 'front') {
          ctx.fillStyle = '#e0bb70';
          ctx.fillRect(6, 8, 4, 4);
          ctx.fillStyle = '#4a2f18';
          ctx.fillRect(7, 9, 2, 2);
        }
      });

    const side = makeFace('side');
    const top = makeFace('top');
    const front = makeFace('front');
    return [
      new THREE.MeshLambertMaterial({ map: side }),
      new THREE.MeshLambertMaterial({ map: side }),
      new THREE.MeshLambertMaterial({ map: top }),
      new THREE.MeshLambertMaterial({ map: top }),
      new THREE.MeshLambertMaterial({ map: front }),
      new THREE.MeshLambertMaterial({ map: side }),
    ];
  }

  getAtlasTileTexture(tileX, tileY) {
    const columns = 16;
    const rows = 16;
    const safeX = Math.max(0, Math.min(columns - 1, Number(tileX) || 0));
    const safeY = Math.max(0, Math.min(rows - 1, Number(tileY) || 0));
    const key = `${safeX}|${safeY}`;
    if (this.atlasTileCache.has(key)) return this.atlasTileCache.get(key);

    const base = import.meta.env.BASE_URL || '/';
    const assetPath = base.endsWith('/') ? base : base + '/';
    const tile = this.textureLoader.load(assetPath + 'atlas.png');
    tile.magFilter = THREE.NearestFilter;
    tile.minFilter = THREE.NearestFilter;
    tile.colorSpace = THREE.SRGBColorSpace;
    tile.wrapS = THREE.RepeatWrapping;
    tile.wrapT = THREE.RepeatWrapping;
    tile.repeat.set(1 / columns, 1 / rows);
    tile.offset.set(safeX / columns, 1 - (safeY + 1) / rows);

    this.atlasTileCache.set(key, tile);
    return tile;
  }

  createMappedFaceMaterial(config, tileCoord) {
    if (!tileCoord || !Array.isArray(tileCoord) || tileCoord.length < 2)
      return null;
    const tex = this.getAtlasTileTexture(tileCoord[0], tileCoord[1]);
    return new THREE.MeshLambertMaterial({
      map: tex,
      transparent: Boolean(config?.transparent),
      opacity: config?.transparent ? 0.65 : 1,
      depthWrite: !config?.transparent,
    });
  }

  createAtlasMaterial(id, config) {
    return null;
  }

  updateShaderMaterials(timeSeconds) {
    // Update all materials in cache that have shaders needing time
    for (const material of this.materialCache.values()) {
      if (Array.isArray(material)) {
        for (const m of material)
          this._updateSingleMaterialTime(m, timeSeconds);
      } else {
        this._updateSingleMaterialTime(material, timeSeconds);
      }
    }
  }

  _updateSingleMaterialTime(material, time) {
    if (!material) return;

    if (material.uniforms?.uTime) {
      material.uniforms.uTime.value = time;
    }
    if (material.userData?.shader?.uniforms?.uTime) {
      material.userData.shader.uniforms.uTime.value = time;
    }
    // Lantern flicker: modulate emissive intensity with noise-like sin combo
    if (material.userData?.flicker && material.userData.flickerBaseColor) {
      const base = material.userData.flickerBaseColor;
      const flicker =
        0.82 + 0.18 * Math.sin(time * 7.3) * Math.sin(time * 11.1 + 1.3);
      material.emissive.setRGB(
        base.r * flicker,
        base.g * flicker,
        base.b * flicker
      );
    }
  }

  getBreakingMaterial(stage = 0) {
    const safeStage = Math.max(0, Math.min(9, Math.floor(Number(stage) || 0)));
    if (this.breakingMaterialCache[safeStage])
      return this.breakingMaterialCache[safeStage];

    const url = this.breakingTextures[safeStage];
    if (!url) return null;

    const tex = this.loadTexture(url);
    const material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
    });

    this.breakingMaterialCache[safeStage] = material;
    return material;
  }

  isCutoutBlockId(id, isDeco = false) {
    return (
      isDeco ||
      id === 'mushroom_brown' ||
      id === 'brown_mushroom' ||
      id === 'red_mushroom' ||
      id.endsWith('_mushroom') ||
      id.includes('leaves') ||
      id.startsWith('mushroom_') ||
      id === 'fern' ||
      id === 'dead_bush' ||
      id.includes('sapling') ||
      id.includes('vine') ||
      id.includes('roots') ||
      id.includes('fungus') ||
      id.includes('sprouts') ||
      id.includes('tomato')
    );
  }

  updateSwaying(enabled) {
    const factor = enabled ? 1.0 : 0.0;
    this.materialCache.forEach((mat) => {
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          if (m?.userData?.shader?.uniforms?.uSwayFactor) {
            m.userData.shader.uniforms.uSwayFactor.value = factor;
          }
        });
      } else if (mat?.userData?.shader?.uniforms?.uSwayFactor) {
        mat.userData.shader.uniforms.uSwayFactor.value = factor;
      }
    });
  }

  getMaterial(id) {
    if (this.materialCache.has(id)) return this.materialCache.get(id);

    const alias = this.idAliases[id];
    if (alias && alias !== id) {
      const material = this.getMaterial(alias);
      this.materialCache.set(id, material);
      return material;
    }
    const normalizedId = normalizeBlockVariantId(id);
    let targetId = normalizedId || id;

    // --- AURA ENGINE: FLUID OVERRIDES ---
    if (targetId === 'water' || targetId === 'lava') {
      const isLava = targetId === 'lava';
      const fluidColor = isLava ? 0xff4500 : 0x3ea1ff;
      const stillUrl = this.resourceManager.getTextureUrl('water_still');
      const flowUrl = this.resourceManager.getTextureUrl('water_flow');
      const texStill = stillUrl ? this.loadTexture(stillUrl) : null;
      const texFlow = flowUrl ? this.loadTexture(flowUrl) : null;

      if (texStill) {
        texStill.wrapS = texStill.wrapT = THREE.RepeatWrapping;
        texStill.magFilter = texStill.minFilter = THREE.NearestFilter;
      }
      if (texFlow) {
        texFlow.wrapS = texFlow.wrapT = THREE.RepeatWrapping;
        texFlow.magFilter = texFlow.minFilter = THREE.NearestFilter;
      }

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uWaterColor: { value: new THREE.Color(fluidColor) },
          uOpacity: { value: isLava ? 1.0 : 0.72 },
          uStillTex: { value: texStill },
          uFlowTex: { value: texFlow },
        },
        vertexShader: `
                    varying vec2 vUv;
                    varying vec3 vWorldPos;
                    uniform float uTime;
                    void main() {
                        vUv = uv;
                        vec4 local = vec4(position, 1.0);
                        #ifdef USE_INSTANCING
                            local = instanceMatrix * local;
                        #endif
                        vec4 worldPos = modelMatrix * local;
                        vWorldPos = worldPos.xyz;
                        
                        // Premium Bobbing: Combined multi-frequency sin waves for organic motion
                        float h = sin(vWorldPos.x * 1.5 + uTime * 1.3) * 0.02 
                                + cos(vWorldPos.z * 1.2 - uTime * 1.1) * 0.02
                                + sin((vWorldPos.x + vWorldPos.z) * 0.8 + uTime * 0.9) * 0.01;
                        local.y += h;
                        #ifdef USE_INSTANCING
                            worldPos.y += h;
                        #endif

                        gl_Position = projectionMatrix * viewMatrix * worldPos;
                    }
                `,
        fragmentShader: `
                    uniform float uTime;
                    uniform vec3 uWaterColor;
                    uniform float uOpacity;
                    uniform sampler2D uStillTex;
                    uniform sampler2D uFlowTex;
                    varying vec2 vUv;
                    varying vec3 vWorldPos;

                    void main() {
                        // Scrolling UVs for the base texture
                        vec2 scrollUv = vUv + vec2(uTime * 0.05, uTime * 0.02);
                        vec4 texColor = texture2D(uStillTex, scrollUv * 2.0);
                        
                        // Advanced Ripple Engine: Layered scrolling noise
                        float t = uTime * 0.65;
                        float rippleA = sin((vWorldPos.x * 2.8) + (t * 1.5)) * 0.5 + 0.5;
                        float rippleB = cos((vWorldPos.z * 3.1) - (t * 1.8)) * 0.5 + 0.5;
                        float rippleC = sin((vWorldPos.x - vWorldPos.z) * 1.5 + t * 0.8) * 0.5 + 0.5;
                        
                        float noise = (rippleA * 0.4 + rippleB * 0.4 + rippleC * 0.2);
                        
                        // Specular highlight for surface shimmer
                        float highlight = smoothstep(0.72, 0.98, noise);
                        
                        // Blend texture with the fluid color and noise
                        vec3 baseColor = mix(uWaterColor * 0.85, texColor.rgb * uWaterColor * 1.5, 0.6);
                        vec3 finalColor = mix(baseColor, baseColor * 1.25, noise);
                        finalColor += vec3(highlight) * 0.42;

                        gl_FragColor = vec4(finalColor, uOpacity * texColor.a);
                    }
                `,
        transparent: !isLava,
        side: THREE.DoubleSide,
        depthWrite: isLava,
      });
      material.userData.isWaterShader = true;
      this.materialCache.set(id, material);
      return material;
    }

    let strippedId = normalizedId || id;

    if (strippedId.endsWith('_door')) {
      targetId = strippedId;
    } else if (strippedId.endsWith('_trapdoor')) {
      targetId = strippedId;
    } else if (strippedId.endsWith('_stairs')) {
      targetId = strippedId.replace('_stairs', '_planks');
      if (!this.blockTextures.has(targetId))
        targetId = strippedId.replace('_stairs', '');
    } else if (strippedId.endsWith('_slab')) {
      targetId = strippedId.replace('_slab', '_planks');
      if (!this.blockTextures.has(targetId))
        targetId = strippedId.replace('_slab', '');
    }

    if (id === 'grass_block_top' || id === 'grass_block_sides') {
      const baseMat = this.getMaterial('grass_block');
      if (id === 'grass_block_top') return baseMat[2];
      const sideMats = baseMat.map((m) => {
        if (m.userData?.tintable) {
          const clone = m.clone();
          clone.userData = { ...m.userData, tintable: false };
          return clone;
        }
        return m;
      });
      return sideMats;
    }

    const config = this.blocks.get(id) ||
      this.blocks.get(strippedId) ||
      this.blocks.get(targetId) || { id, name: id, textureId: targetId };
    const textureId = config.textureId || targetId;
    const textureLoadOptions = this.getTextureLoadOptionsForBlock(id);
    const textures =
      this.blockTextures.get(textureId) ||
      this.blockTextures.get(targetId) ||
      this.blockTextures.get(id) ||
      {};

    if (!config && Object.keys(textures).length === 0)
      return new THREE.MeshLambertMaterial({ color: 0xff00ff });

    const load = (name) => {
      const url = textures[name];
      if (url) return this.loadTexture(url, textureLoadOptions);
      const baseFallback = `${textureId}.png`;
      const suffixFallback =
        name !== 'all.png'
          ? `${textureId}_${name.replace('.png', '')}.png`
          : baseFallback;
      const fallbackUrl =
        textures[baseFallback] || textures[suffixFallback] || textures[name];
      if (fallbackUrl) return this.loadTexture(fallbackUrl, textureLoadOptions);
      return null;
    };

    const loadPackTexture = (fileName) => {
      const url = this.resourceManager.getTextureUrl(fileName);
      return url ? this.loadTexture(url, textureLoadOptions) : null;
    };

    const allTex = load('all.png');
    const isFarmlandBlock = targetId === 'farmland' || id === 'farmland';
    const isPathBlock =
      targetId === 'dirt_path' || id === 'path_block' || id === 'dirt_path';
    const isGrassBlock = targetId === 'grass_block' || id === 'grass_block';
    const dirtTex = loadPackTexture('dirt.png');
    const grassSideTex =
      load('side.png') || loadPackTexture('grass_block_side.png') || allTex;
    const grassTopTex =
      load('top.png') || loadPackTexture('grass_block_top.png') || allTex;
    const sideTex = isFarmlandBlock
      ? load('side.png') || dirtTex || allTex
      : isPathBlock
        ? load('side.png') || dirtTex || allTex
        : isGrassBlock
          ? grassSideTex
          : load('side.png') || allTex;
    const topTex = isFarmlandBlock
      ? load('top.png') || loadPackTexture('farmland.png') || allTex
      : isPathBlock
        ? load('top.png') || loadPackTexture('dirt_path_top.png') || allTex
        : isGrassBlock
          ? grassTopTex
          : load('top.png') || allTex;
    const bottomTex = isFarmlandBlock
      ? load('bottom.png') || dirtTex || allTex
      : isPathBlock
        ? load('bottom.png') || dirtTex || allTex
        : isGrassBlock
          ? load('bottom.png') || dirtTex || allTex
          : load('bottom.png') || allTex;
    const decoTex = allTex || sideTex || bottomTex || topTex;
    const frontTex = load('front.png') || sideTex || decoTex;
    const backTex = load('back.png') || sideTex || decoTex;
    const leftTex = load('left.png') || sideTex || decoTex;
    const rightTex = load('right.png') || sideTex || decoTex;
    const finalTopTex = topTex || decoTex;
    const finalBottomTex = bottomTex || decoTex;

    let material = null;

    if (id === 'starter_chest' && Object.keys(textures).length === 0) {
      material = this.createStarterChestMaterial();
    }

    if (
      !material &&
      (topTex ||
        bottomTex ||
        sideTex ||
        frontTex ||
        backTex ||
        leftTex ||
        rightTex)
    ) {
      const isDeco = Boolean(config.deco);
      const cutoutBlock = this.isCutoutBlockId(id, isDeco);
      const isCutout = cutoutBlock;
      const isTransparent = Boolean(config.transparent) && !isCutout;
      const matConfig = {
        transparent: isTransparent,
        opacity: 1,
        alphaTest: isCutout ? 0.5 : 0,
        depthWrite: true,
        side: (isDeco || id.includes('leaves')) ? THREE.DoubleSide : THREE.FrontSide,
      };

      const mats = [
        new THREE.MeshLambertMaterial({ ...matConfig, map: rightTex }),
        new THREE.MeshLambertMaterial({ ...matConfig, map: leftTex }),
        new THREE.MeshLambertMaterial({ ...matConfig, map: finalTopTex }),
        new THREE.MeshLambertMaterial({ ...matConfig, map: finalBottomTex }),
        new THREE.MeshLambertMaterial({ ...matConfig, map: frontTex }),
        new THREE.MeshLambertMaterial({ ...matConfig, map: backTex }),
      ];

      if (isCutout) {
        for (const mat of mats) mat.userData.alphaCutout = true;
      }

      const hasFixedLeafColor =
        textureId === 'cherry_leaves' ||
        textureId === 'flowering_azalea_leaves' ||
        id === 'cherry_leaves' ||
        id === 'leaves_cherry';
      const isFoliage =
        (isDeco &&
          (textureId === 'grass' ||
            textureId.includes('grass') ||
            textureId.includes('fern') ||
            textureId === 'vine' ||
            textureId === 'sugar_cane' ||
            textureId.includes('roots') ||
            textureId.includes('sprouts') ||
            textureId.includes('sapling'))) ||
        (textureId.includes('leaves') && !hasFixedLeafColor);
      const isGrassTopOnly = id === 'grass_block' || id === 'grass';

      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        if (
          (isGrassTopOnly && i === 2) ||
          (isFoliage && id !== 'sea_lantern')
        ) {
          m.userData.tintable = true;
        } else {
          m.userData.tintable = false;
        }
      }

      if (
        !textures['top.png'] &&
        !textures['bottom.png'] &&
        !textures['side.png'] &&
        !textures['front.png'] &&
        !textures['back.png'] &&
        !textures['left.png'] &&
        !textures['right.png'] &&
        allTex
      ) {
        material = mats[0];
      } else {
        material = mats;
      }
    } else if (!material) {
      const isDeco = Boolean(config.deco);
      const cutoutBlock = this.isCutoutBlockId(id, isDeco);
      const isCutout = cutoutBlock;
      const isTransparent = Boolean(config.transparent) && !isCutout;
      material = new THREE.MeshLambertMaterial({
        map: this.missingTexture,
        color: config.color ? parseInt(config.color) : 0xffffff,
        transparent: isTransparent,
        opacity: isTransparent ? 0.82 : 1,
        alphaTest: isCutout ? 0.08 : 0,
        depthWrite: isCutout ? true : !isTransparent,
        side: isDeco ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (isCutout) material.userData.alphaCutout = true;
      if (!this.VIRTUAL_IDS.has(id)) {
        console.warn(
          `[ArloCraft] Missing texture for block: ${id}. Using Magenta Fallback.`
        );
      }
    }

    // Post-creation enhancements
    if (material) {
      const mats = Array.isArray(material) ? material : [material];
      for (const m of mats) {
        if (id.startsWith('wool_')) {
          m.emissive = new THREE.Color(
            config.color ? parseInt(config.color) : 0x000000
          ).multiplyScalar(0.08);
        }
        if (config.emissive) {
          const emissiveHex = config.emissiveColor
            ? parseInt(config.emissiveColor)
            : 0x333333;
          m.emissive = new THREE.Color(emissiveHex);
          if (config.flicker) {
            m.userData.flicker = true;
            m.userData.flickerBaseColor = new THREE.Color(emissiveHex);
          }
        }
        if (id.startsWith('prismarine') || id.includes('prismarine')) {
          // Subtle teal glow matching the sea lantern style
          m.emissive = new THREE.Color(0x2389a3).multiplyScalar(0.24);
        }
      }
    }

    const shouldEnhanceFaceShading =
      !config?.deco &&
      id !== 'water' &&
      id !== 'path_block' &&
      id !== 'grass_block';
    if (shouldEnhanceFaceShading) {
      this.enhanceFaceShading(material);
    }

    if (id.includes('leaves') || config?.deco) {
      this.injectWindShader(material);
    }

    if (id === 'sea_lantern') {
      this.injectAnimationShader(material, 5, 4.0);
    } else if (id === 'magma') {
      this.injectAnimationShader(material, 3, 2.0);
    } else if (id === 'prismarine') {
      this.injectAnimationShader(material, 4, 4.0);
    }

    this.configureTransparentMaterial(material);
    this.materialCache.set(id, material);
    return material;
  }

  injectAnimationShader(material, frameCount, frameSpeed = 4.0) {
    if (!material) return;
    if (Array.isArray(material)) {
      for (const m of material) this.injectAnimationShader(m, frameCount, frameSpeed);
      return;
    }
    if (material.userData.animationInjected) return;
    material.userData.animationInjected = true;
    material.userData.isAnimated = true;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTimeAnimation = { value: 0 };
      shader.uniforms.uFrameCount = { value: frameCount };
      shader.uniforms.uFrameSpeed = { value: frameSpeed };

      shader.vertexShader = `
                uniform float uTimeAnimation;
                uniform float uFrameCount;
                uniform float uFrameSpeed;
                ${shader.vertexShader}
            `.replace(
        '#include <uv_vertex>',
        `
                #include <uv_vertex>
                float frame = floor(mod(uTimeAnimation * uFrameSpeed, uFrameCount));
                // Horizontal (X-axis) spritesheet animation
                vUv.x = (vUv.x / uFrameCount) + (frame / uFrameCount);
                `
      );

      // Store a reference to the uniforms for polling updates
      material.userData.shader = shader;
    };
  }

  isStep(id) {
    if (!id) return false;
    const reg = id.toLowerCase();
    return reg.includes('slab') || reg.includes('stairs') || reg.includes('path');
  }

  updateShaderMaterials(time) {
    for (const mat of this.materialCache.values()) {
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        if (m.userData.isWaterShader && m.uniforms) {
          m.uniforms.uTime.value = time;
        }
        if (m.userData.animationInjected && m.userData.shader) {
          m.userData.shader.uniforms.uTimeAnimation.value = time;
        }
        if (m.userData.flicker && m.userData.flickerBaseColor) {
           const flicker = 0.88 + Math.sin(time * 12.0) * 0.12;
           m.emissive.copy(m.userData.flickerBaseColor).multiplyScalar(flicker);
        }
      }
    }
  }
}
