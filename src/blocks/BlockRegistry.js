import * as THREE from 'three';
import { BLOCKS } from '../data/blocks.js';

const textureModules = import.meta.glob([
    '../content/blocks/*/*.png', 
    '../Igneous 1.19.4/assets/minecraft/textures/block/*.png'
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
            'tall_grass_top': 'tall_grass_top',
            'mushroom_red': 'red_mushroom',
            'mushroom_brown': 'brown_mushroom'
        };
        this.init();
    }

    init() {
        this.blockTextures = new Map();
        const igneousOwnedBlocks = new Set();
        
        // Sort: Igneous loads first (base), content folder loads last (wins over Igneous).
        // This ensures custom per-block textures in content/blocks/ override animated
        // Igneous sprite sheets that would otherwise display squished/tiled.
        const entries = Object.entries(textureModules).sort((a, b) => {
            const aIsIgneous = a[0].includes('Igneous');
            const bIsIgneous = b[0].includes('Igneous');
            // Igneous assets (the pack) should come FIRST so that custom blocks in /content/ override them
            if (aIsIgneous && !bIsIgneous) return -1;
            if (!aIsIgneous && bIsIgneous) return 1;
            return 0;
        });

        for (const [path, module] of entries) {
            const segments = path.split('/');
            let blockId = segments[segments.length - 2];
            let fileName = segments[segments.length - 1];
            const isIgneous = path.includes('Igneous');

            if (blockId === 'block') { // Igneous texture pack handling
                const baseName = fileName.replace('.png', '');
                
                // Breaking stage textures
                if (baseName.startsWith('destroy_stage_')) {
                    const stage = parseInt(baseName.replace('destroy_stage_', ''));
                    this.breakingTextures[stage] = module.default || module;
                    continue;
                }

                // Igneous tall foliage handling: keep _top and _bottom suffixes for distinct IDs
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
                } else {
                    blockId = baseName;
                    fileName = 'all.png';
                }
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
            arlo: 'arlo_real.png'
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
float faceAoCorner = pow(faceAoMask, 1.35);
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
            // Cutout foliage should render in the opaque queue with alpha testing.
            // That keeps thin sprites stable and avoids transparent-object sorting bugs.
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
        
        // SURGICAL FIX: Handle Igneous animated strips (like sea_lantern.png)
        // If the texture is a vertical strip, we only show the first frame to prevent 'squishing'.
        if (src.includes('sea_lantern')) {
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.RepeatWrapping; // Use repeat for the strip but set repeat.y to a slice
            
            // Note: Since load is async, we set up a callback or just set immediate safe repeats
            // For Sea Lantern in Igneous, it's usually 5 or more frames. 
            // Setting repeat.y to 0.2 (1/5) is a safe bet for most animated Minecraft textures 
            // to show at least one frame normally instead of squishing all of them.
            // Better: We check if it's from Igneous and an animated block.
            if (src.includes('Igneous')) {
                texture.repeat.set(1, 0.2); 
            }
        }

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
        const columns = Math.max(1, BLOCK_TEXTURE_ATLAS.columns);
        const rows = Math.max(1, BLOCK_TEXTURE_ATLAS.rows);
        const safeX = Math.max(0, Math.min(columns - 1, Number(tileX) || 0));
        const safeY = Math.max(0, Math.min(rows - 1, Number(tileY) || 0));
        const key = `${safeX}|${safeY}`;
        if (this.atlasTileCache.has(key)) return this.atlasTileCache.get(key);

        // Load a fresh texture per tile (TextureLoader caches the underlying Image,
        // so no duplicate network requests) - this guarantees each tile gets its own
        // needsUpdate event when the image finishes loading, preventing black tiles.
        const tile = this.textureLoader.load(BLOCK_TEXTURE_ATLAS.src);
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
        return null; // Atlas logic deprecated in favor of folder-based textures
    }

    updateShaderMaterials(timeSeconds) {
        const mat = this.materialCache.get('water');
        if (!mat || !mat.uniforms?.uTime) return;
        mat.uniforms.uTime.value = timeSeconds;
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
        if (alias) {
            const material = this.getMaterial(alias);
            this.materialCache.set(id, material);
            return material;
        }
        let targetId = id;
        const stairMatch = id.match(/(.*_stairs)(_[nswe])$/);
        const slabMatch = id.match(/(.*_slab)(_[nswe])$/); // Slabs might have half-height positioning later
        
        let strippedId = id;
        if (stairMatch) strippedId = stairMatch[1];
        else if (slabMatch) strippedId = slabMatch[1];

        if (strippedId.endsWith('_stairs')) {
            targetId = strippedId.replace('_stairs', '_planks');
            if (!this.blockTextures.has(targetId)) targetId = strippedId.replace('_stairs', '');
        } else if (strippedId.endsWith('_slab')) {
            targetId = strippedId.replace('_slab', '_planks');
            if (!this.blockTextures.has(targetId)) targetId = strippedId.replace('_slab', '');
        }

        const config = this.blocks.get(id) || this.blocks.get(strippedId) || this.blocks.get(targetId) || { id, name: id, textureId: targetId };
        const textureId = config.textureId || targetId;
        const textures = this.blockTextures.get(textureId) || this.blockTextures.get(targetId) || this.blockTextures.get(id) || {};

        if (!config && Object.keys(textures).length === 0) return new THREE.MeshLambertMaterial({ color: 0xff00ff });
        
        const load = (name) => {
            const url = textures[name];
            if (url) return this.loadTexture(url);
            
            // IGNEOUS FALLBACK: Check if filename exists without 'all.png' or 'bottom.png' etc
            // Handle both {id}.png and {textureId}_{suffix}.png (e.g. tall_grass_bottom.png)
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
        
        // For decals/sprites in texture packs (like grass), they often only provide one of these fileName patterns.
        // We define a decoTex fallback but ensure it doesn't override specific block sides like log bark.
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

        // Face order: px, nx, py, ny, pz, nz (Right, Left, Top, Bottom, Front, Back)
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
                for (const mat of mats) {
                    mat.userData.alphaCutout = true;
                }
            }
            
            const isFoliage = (
                (isDeco && (textureId === 'grass' || textureId.includes('grass') || textureId.includes('fern') || textureId === 'vine' || textureId === 'sugar_cane' || textureId.includes('roots') || textureId.includes('sprouts')))
                || textureId.includes('leaves')
            );
            // Grass top texture is already baked green in this pack; avoid instance tinting
            // to prevent rare black-top failures from per-instance color paths.
            const isGrassTopOnly = id === 'grass_block' || id === 'grass';
            
                        for (let i = 0; i < mats.length; i++) {
                const m = mats[i];
                if ((isGrassTopOnly && i === 2) || isFoliage) {
                    m.userData.tintable = true;
                } else {
                    m.userData.tintable = false;
                }
            }
            // If all sides are identical and no specific ones provided, use a single material
            if (!textures['top.png'] && !textures['bottom.png'] && !textures['side.png'] && 
                !textures['front.png'] && !textures['back.png'] && !textures['left.png'] && !textures['right.png'] && allTex) {
                material = mats[0];
            } else {
                material = mats;
            }
        }

        if (!material) {

            if (id === 'water') {
                material = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        varying vec3 vColor;
                        void main() {
                            vUv = uv;
                            vColor = vec3(1.0);
                            #ifdef USE_INSTANCING_COLOR
                                vColor = instanceColor;
                            #endif
                            vec4 local = vec4(position, 1.0);
                            #ifdef USE_INSTANCING
                                local = instanceMatrix * local;
                            #endif
                            vec4 mvPosition = modelViewMatrix * local;
                            gl_Position = projectionMatrix * mvPosition;
                        }
                    `,
                    fragmentShader: `
                        uniform float uTime;
                        varying vec2 vUv;
                        varying vec3 vColor;
                        void main() {
                            float waveA = sin((vUv.x * 18.0) + (uTime * 1.8)) * 0.08;
                            float waveB = cos((vUv.y * 22.0) - (uTime * 1.4)) * 0.07;
                            float wave = clamp((waveA + waveB) * 0.5 + 0.5, 0.0, 1.0);
                            vec3 deep = vColor * 0.8;
                            vec3 shallow = vColor * 1.2;
                            vec3 color = mix(deep, shallow, wave);
                            gl_FragColor = vec4(color, 0.82);
                        }
                    `,
                    side: THREE.FrontSide
                });
                material.userData.tintable = true;
                material.transparent = true;
                material.opacity = 0.55; // Lower opacity to make 'walls' less prominent
            } else {
                const isDeco = Boolean(config.deco);
                const cutoutBlock = this.isCutoutBlockId(id, isDeco);
                const isCutout = cutoutBlock;
                const isTransparent = Boolean(config.transparent) && !isCutout;
                material = new THREE.MeshLambertMaterial({
                    color: config.color ? parseInt(config.color) : 0x9c9c9c,
                    transparent: isTransparent,
                    opacity: isTransparent ? 0.82 : 1,
                    alphaTest: isCutout ? 0.08 : 0,
                    depthWrite: isCutout ? true : !isTransparent,
                    side: isDeco ? THREE.DoubleSide : THREE.FrontSide
                });
                if (isCutout) material.userData.alphaCutout = true;
            }

            // Special handling for wool texture/grain
            if (id.startsWith('wool_')) {
                material.emissive = new THREE.Color(config.color ? parseInt(config.color) : 0x000000).multiplyScalar(0.08);
            }

            if (config.emissive) {
                material.emissive = new THREE.Color(0x662100);
            }
        }

        const shouldEnhanceFaceShading = !config?.deco && id !== 'water' && id !== 'path_block' && id !== 'grass_block';
        if (shouldEnhanceFaceShading) {
            this.enhanceFaceShading(material);
        }

        this.configureTransparentMaterial(material);
        this.materialCache.set(id, material);
        return material;
    }
}
