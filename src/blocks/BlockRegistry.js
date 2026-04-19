import * as THREE from 'three';
import { BLOCKS } from '../data/blocks.js';
import { normalizeBlockVariantId } from '../data/blockIds.js';

const textureModules = import.meta.glob([
    '../content/blocks/*/*.png', 
    '../Igneous*/**/*.png'
], { eager: true, query: '?url' });

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
            'wood': 'oak_log',
            'leaves': 'oak_leaves',
            'wood_birch': 'birch_log',
            'leaves_birch': 'birch_leaves',
            'wood_pine': 'spruce_log',
            'leaves_pine': 'spruce_leaves',
            'wood_cherry': 'cherry_log',
            'leaves_cherry': 'cherry_leaves',
            'wood_crystal': 'crystal_log',
            'leaves_crystal': 'crystal_leaves',
            'wood_palm': 'jungle_log',
            'leaves_palm': 'jungle_leaves',
            'wood_willow': 'mangrove_log',
            'leaves_willow': 'mangrove_leaves',
            'tall_grass': 'tall_grass_bottom',
            'mushroom_red': 'red_mushroom',
            'berry_bush': 'sweet_berry_bush',
            'nuke': 'nuke',
            'fire': 'fire_0'
        };
        this.missingTexture = this.createMissingTexture();
        this.init();
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
        ctx.fillRect(0, 0, size/2, size/2);
        ctx.fillRect(size/2, size/2, size/2, size/2);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    }

    init() {
        this.blockTextures = new Map();
        const igneousOwnedBlocks = new Set();
        
        const entries = Object.entries(textureModules).sort((a, b) => {
            const aIsIgneous = a[0].includes('Igneous');
            const bIsIgneous = b[0].includes('Igneous');
            if (aIsIgneous && !bIsIgneous) return -1;
            if (!aIsIgneous && bIsIgneous) return 1;
            return 0;
        });

        for (const [path, module] of entries) {
            const segments = path.split('/');
            let blockId = segments[segments.length - 2];
            let fileName = segments[segments.length - 1];
            const isIgneous = path.includes('Igneous');
            const baseName = fileName.replace('.png', '');
            
            if (baseName.startsWith('destroy_stage_')) {
                const stage = parseInt(baseName.replace('destroy_stage_', ''));
                const url = module.default || module;
                this.breakingTextures[stage] = url;
                
                const tex = this.textureLoader.load(url);
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                
                this.breakingMaterialCache[stage] = new THREE.MeshBasicMaterial({
                    map: tex,
                    transparent: true,
                    blending: THREE.MultiplyBlending,
                    premultipliedAlpha: true,
                    side: THREE.FrontSide,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -1.5,
                    polygonOffsetUnits: -1.5
                });
                continue;
            }

            const isTallFoliage = /tall_grass|sunflower|rose_bush|lilac|peony/.test(baseName);
            
            if (baseName.endsWith('_top') && !isTallFoliage) {
                blockId = baseName.substring(0, baseName.length - 4);
                fileName = 'top.png';
            } else if (baseName.endsWith('_side') && !isTallFoliage) {
                blockId = baseName.substring(0, baseName.length - 5);
                fileName = 'side.png';
            } else if (baseName.endsWith('_bottom') && !isTallFoliage) {
                blockId = baseName.substring(0, baseName.length - 7);
                fileName = 'bottom.png';
            } else if (baseName.endsWith('_front') && !isTallFoliage) {
                blockId = baseName.substring(0, baseName.length - 6);
                fileName = 'front.png';
            } else if (fileName === 'top.png' || fileName === 'side.png' || fileName === 'bottom.png' || fileName === 'front.png' || fileName === 'all.png') {
                // Folder-named block with generic face file (e.g. copper/all.png, path_block/top.png)
                // blockId is already set from folder name; just normalize fileName
                // keep blockId as folder name, set fileName as-is
            } else {
                blockId = baseName;
                fileName = 'all.png';
            }

            if (isIgneous) {
                igneousOwnedBlocks.add(blockId);
            } else if (igneousOwnedBlocks.has(blockId)) {
                continue;
            }

            if (!this.blockTextures.has(blockId)) this.blockTextures.set(blockId, {});
            this.blockTextures.get(blockId)[fileName] = module.default || module;
        }

        BLOCKS.forEach((config) => {
            this.blocks.set(config.id, config);
        });
        this.loadStunningExpansion();
    }

    async loadStunningExpansion() {
        const paths = {
            anton: 'anton_real.png'
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
            'furnace': 'furnace',
            'starter_chest': 'starter_chest',
            'fern': 'fern',
            'banana': 'banana'
        };

        for (const [id, texKey] of Object.entries(idToTexKey)) {
            const tex = this.pixelTextures.get(texKey);
            if (!tex) continue;

            if (id === 'furnace' || id === 'starter_chest') {
                 const sideMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 }); 
                 this.materialCache.set(id, [
                     sideMaterial, sideMaterial, sideMaterial, sideMaterial,
                     new THREE.MeshLambertMaterial({ map: tex }),
                     sideMaterial
                 ]);
            } else {
                this.materialCache.set(id, new THREE.MeshLambertMaterial({
                    map: tex,
                    transparent: false,
                    alphaTest: 0.08,
                    depthWrite: true
                }));
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
            shader.uniforms.uWindParams = { value: new THREE.Vector3(speed, scale, frequency) };

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    uniform float uTime;
                    uniform vec3 uWindParams;`
                )
                .replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    // Wind swaying logic
                    float t = uTime * uWindParams.x;
                    // Factor top-heaviness: displace more as Y increases
                    float factor = max(0.0, transformed.y + 0.5); 
                    float swayX = sin(t + (position.x + position.z) * uWindParams.z) * uWindParams.y * factor;
                    float swayZ = cos(t * 0.8 + (position.x - position.z) * uWindParams.z) * uWindParams.y * factor;
                    transformed.x += swayX;
                    transformed.z += swayZ;
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

        const strength = Number.isFinite(options.strength) ? options.strength : 0.12;
        const edgeWidth = Number.isFinite(options.edgeWidth) ? options.edgeWidth : 0.22;

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
        material.customProgramCacheKey = () => `face-ao:${strength.toFixed(3)}:${edgeWidth.toFixed(3)}`;
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
        const alphaCutout = Number(material.alphaTest) > 0.001 || Boolean(material.userData?.alphaCutout);
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
        if (this.textureCache.has(src)) return this.textureCache.get(src);
        const texture = this.textureLoader.load(src);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        

        this.textureCache.set(src, texture);
        return texture;
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
        const makeFace = (face) => this.createCanvasTexture(16, (ctx, size) => {
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
            new THREE.MeshLambertMaterial({ map: side })
        ];
    }

    getAtlasTileTexture(tileX, tileY) {
        const columns = 16;
        const rows = 16;
        const safeX = Math.max(0, Math.min(columns - 1, Number(tileX) || 0));
        const safeY = Math.max(0, Math.min(rows - 1, Number(tileY) || 0));
        const key = `${safeX}|${safeY}`;
        if (this.atlasTileCache.has(key)) return this.atlasTileCache.get(key);

        const tile = this.textureLoader.load('atlas.png');
        tile.magFilter = THREE.NearestFilter;
        tile.minFilter = THREE.NearestFilter;
        tile.colorSpace = THREE.SRGBColorSpace;
        tile.wrapS = THREE.RepeatWrapping;
        tile.wrapT = THREE.RepeatWrapping;
        tile.repeat.set(1 / columns, 1 / rows);
        tile.offset.set(safeX / columns, 1 - ((safeY + 1) / rows));

        this.atlasTileCache.set(key, tile);
        return tile;
    }

    createMappedFaceMaterial(config, tileCoord) {
        if (!tileCoord || !Array.isArray(tileCoord) || tileCoord.length < 2) return null;
        const tex = this.getAtlasTileTexture(tileCoord[0], tileCoord[1]);
        return new THREE.MeshLambertMaterial({
            map: tex,
            transparent: Boolean(config?.transparent),
            opacity: config?.transparent ? 0.65 : 1,
            depthWrite: !config?.transparent
        });
    }

    createAtlasMaterial(id, config) {
        return null;
    }

    updateShaderMaterials(timeSeconds) {
        // Update all materials in cache that have shaders needing time
        for (const material of this.materialCache.values()) {
            if (Array.isArray(material)) {
                for (const m of material) this._updateSingleMaterialTime(m, timeSeconds);
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
            const flicker = 0.82 + 0.18 * Math.sin(time * 7.3) * Math.sin(time * 11.1 + 1.3);
            material.emissive.setRGB(base.r * flicker, base.g * flicker, base.b * flicker);
        }
    }

    getBreakingMaterial(stage = 0) {
        const safeStage = Math.max(0, Math.min(9, Math.floor(Number(stage) || 0)));
        if (this.breakingMaterialCache[safeStage]) return this.breakingMaterialCache[safeStage];

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
            polygonOffsetUnits: -1.5
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
            id.includes('sprouts')
        );
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
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uWaterColor: { value: new THREE.Color(fluidColor) }
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
                        
                        // Subtle height bobbing (sin waves)
                        float h = sin(vWorldPos.x * 2.0 + uTime * 1.5) * 0.015 + cos(vWorldPos.z * 1.8 - uTime * 1.2) * 0.015;
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
                    varying vec2 vUv;
                    varying vec3 vWorldPos;

                    void main() {
                        // Layered scrolling patterns for a 'shimmer' ripple effect
                        float rippleA = sin((vWorldPos.x * 3.5) + (uTime * 1.8)) * 0.5 + 0.5;
                        float rippleB = cos((vWorldPos.z * 4.2) - (uTime * 2.2)) * 0.5 + 0.5;
                        float noise = (rippleA + rippleB) * 0.25;
                        
                        float highlight = smoothstep(0.65, 0.95, noise);
                        vec3 color = mix(uWaterColor * 0.85, uWaterColor * 1.3, noise);
                        color = mix(color, vec3(1.0), highlight * 0.35);

                        gl_FragColor = vec4(color, ${isLava ? '1.0' : '0.8'});
                    }
                `,
                transparent: !isLava,
                side: THREE.DoubleSide,
                depthWrite: isLava
            });
            material.userData.isWaterShader = true;
            this.materialCache.set(id, material);
            return material;
        }

        const stairMatch = id.match(/(.*_stairs)(_[nswe])$/);
        const slabMatch = id.match(/(.*_slab)(_[nswe])$/);
        let strippedId = normalizedId || id;
        if (stairMatch) strippedId = stairMatch[1];
        else if (slabMatch) strippedId = slabMatch[1];

        if (strippedId.endsWith('_stairs')) {
            targetId = strippedId.replace('_stairs', '_planks');
            if (!this.blockTextures.has(targetId)) targetId = strippedId.replace('_stairs', '');
        } else if (strippedId.endsWith('_slab')) {
            targetId = strippedId.replace('_slab', '_planks');
            if (!this.blockTextures.has(targetId)) targetId = strippedId.replace('_slab', '');
        }

        if (id === 'grass_block_top' || id === 'grass_block_sides') {
            const baseMat = this.getMaterial('grass_block');
            if (id === 'grass_block_top') return baseMat[2];
            const sideMats = baseMat.map(m => {
                if (m.userData?.tintable) {
                    const clone = m.clone();
                    clone.userData = { ...m.userData, tintable: false };
                    return clone;
                }
                return m;
            });
            return sideMats;
        }

        const config = this.blocks.get(id) || this.blocks.get(strippedId) || this.blocks.get(targetId) || { id, name: id, textureId: targetId };
        const textureId = config.textureId || targetId;
        const textures = this.blockTextures.get(textureId) || this.blockTextures.get(targetId) || this.blockTextures.get(id) || {};

        if (!config && Object.keys(textures).length === 0) return new THREE.MeshLambertMaterial({ color: 0xff00ff });
        
        const load = (name) => {
            const url = textures[name];
            if (url) return this.loadTexture(url);
            const baseFallback = `${textureId}.png`;
            const suffixFallback = name !== 'all.png' ? `${textureId}_${name.replace('.png','')}.png` : baseFallback;
            const fallbackUrl = textures[baseFallback] || textures[suffixFallback] || textures[name];
            if (fallbackUrl) return this.loadTexture(fallbackUrl);
            return null;
        };

        const allTex = load('all.png');
        const sideTex = load('side.png') || allTex;
        const topTex = load('top.png') || allTex;
        const bottomTex = load('bottom.png') || allTex;
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

        if (!material && (topTex || bottomTex || sideTex || frontTex || backTex || leftTex || rightTex)) {
            const isDeco = Boolean(config.deco);
            const cutoutBlock = this.isCutoutBlockId(id, isDeco);
            const isCutout = cutoutBlock;
            const isTransparent = Boolean(config.transparent) && !isCutout;
            const matConfig = {
                transparent: isTransparent,
                opacity: 1,
                alphaTest: isCutout ? 0.08 : 0,
                depthWrite: true,
                side: isDeco ? THREE.DoubleSide : THREE.FrontSide
            };

            const mats = [
                new THREE.MeshLambertMaterial({ ...matConfig, map: rightTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: leftTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: finalTopTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: finalBottomTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: frontTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: backTex })
            ];

            if (isCutout) {
                for (const mat of mats) mat.userData.alphaCutout = true;
            }
            
            const isFoliage = (
                (isDeco && (textureId === 'grass' || textureId.includes('grass') || textureId.includes('fern') || textureId === 'vine' || textureId === 'sugar_cane' || textureId.includes('roots') || textureId.includes('sprouts') || textureId.includes('sapling')))
                || textureId.includes('leaves')
            );
            const isGrassTopOnly = id === 'grass_block' || id === 'grass';
            
            for (let i = 0; i < mats.length; i++) {
                const m = mats[i];
                if ((isGrassTopOnly && i === 2) || (isFoliage && id !== 'sea_lantern')) {
                    m.userData.tintable = true;
                } else {
                    m.userData.tintable = false;
                }
            }

            if (!textures['top.png'] && !textures['bottom.png'] && !textures['side.png'] && 
                !textures['front.png'] && !textures['back.png'] && !textures['left.png'] && !textures['right.png'] && allTex) {
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
                side: isDeco ? THREE.DoubleSide : THREE.FrontSide
            });
            if (isCutout) material.userData.alphaCutout = true;
            console.warn(`[AntonCraft] Missing texture for block: ${id}. Using Magenta Fallback.`);
        }

        // Post-creation enhancements
        if (material) {
            const mats = Array.isArray(material) ? material : [material];
            for (const m of mats) {
                if (id.startsWith('wool_')) {
                    m.emissive = new THREE.Color(config.color ? parseInt(config.color) : 0x000000).multiplyScalar(0.08);
                }
                if (config.emissive) {
                    const emissiveHex = config.emissiveColor ? parseInt(config.emissiveColor) : 0x333333;
                    m.emissive = new THREE.Color(emissiveHex);
                    if (config.flicker) {
                        m.userData.flicker = true;
                        m.userData.flickerBaseColor = new THREE.Color(emissiveHex);
                    }
                }
            }

        }

        const shouldEnhanceFaceShading = !config?.deco && id !== 'water' && id !== 'path_block' && id !== 'grass_block';
        if (shouldEnhanceFaceShading) {
            this.enhanceFaceShading(material);
        }

        if (id.includes('leaves') || config?.deco) {
            this.injectWindShader(material);
        }

        this.configureTransparentMaterial(material);
        this.materialCache.set(id, material);
        return material;
    }
}
