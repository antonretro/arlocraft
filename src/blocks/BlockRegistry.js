import * as THREE from 'three';
import { BLOCKS } from '../data/blocks.js';

const textureModules = import.meta.glob('../content/blocks/*/*.png', { eager: true, query: '?url' });



export class BlockRegistry {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.blocks = new Map();
        this.materialCache = new Map();
        this.textureCache = new Map();
        this.atlasTileCache = new Map();
        this.pixelTextures = new Map();
        this.animatedGif = null;
        this.init();
    }

    init() {
        this.blockTextures = new Map();
        for (const [path, module] of Object.entries(textureModules)) {
            const segments = path.split('/');
            const blockId = segments[segments.length - 2];
            const fileName = segments[segments.length - 1];
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
            'grass_tall': 'grass_tall',
            'flower_rose': 'flower_rose',
            'flower_dandelion': 'flower_dandelion',
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
                    transparent: true,
                    alphaTest: 0.1,
                    depthWrite: false
                }));
            }
        }
    }

    configureTransparentMaterial(material) {
        if (!material) return;
        if (Array.isArray(material)) {
            for (let i = 0; i < material.length; i++) {
                this.configureTransparentMaterial(material[i]);
            }
            return;
        }
        if (material.transparent) {
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

    getMaterial(id) {
        if (this.materialCache.has(id)) return this.materialCache.get(id);
        const config = this.blocks.get(id);
        if (!config) return new THREE.MeshLambertMaterial({ color: 0xff00ff });

        const textures = this.blockTextures.get(id) || {};
        
        const load = (name) => {
            const url = textures[name];
            if (!url) return null;
            return this.loadTexture(url);
        };

        const allTex = load('all.png');
        const sideTex = load('side.png') || allTex;
        const topTex = load('top.png') || allTex;
        const bottomTex = load('bottom.png') || allTex;
        const frontTex = load('front.png') || sideTex;
        const backTex = load('back.png') || sideTex;
        const leftTex = load('left.png') || sideTex;
        const rightTex = load('right.png') || sideTex;

        let material = null;

        // Face order: px, nx, py, ny, pz, nz (Right, Left, Top, Bottom, Front, Back)
        if (topTex || bottomTex || sideTex || frontTex || backTex || leftTex || rightTex) {
            const isTransparent = Boolean(config.transparent);
            const isCutout = isTransparent && (
                id === 'grass_tall' ||
                id === 'mushroom_brown' ||
                id.startsWith('flower_') ||
                id.startsWith('leaves')
            );
            const matConfig = {
                transparent: isTransparent,
                opacity: isTransparent ? (isCutout ? 1 : 0.82) : 1,
                alphaTest: isCutout ? 0.24 : 0,
                depthWrite: isCutout ? true : !isTransparent
            };

            const mats = [
                new THREE.MeshLambertMaterial({ ...matConfig, map: rightTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: leftTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: topTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: bottomTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: frontTex }),
                new THREE.MeshLambertMaterial({ ...matConfig, map: backTex })
            ];
            
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
                        void main() {
                            vUv = uv;
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
                        void main() {
                            float waveA = sin((vUv.x * 18.0) + (uTime * 1.8)) * 0.08;
                            float waveB = cos((vUv.y * 22.0) - (uTime * 1.4)) * 0.07;
                            float wave = clamp((waveA + waveB) * 0.5 + 0.5, 0.0, 1.0);
                            vec3 deep = vec3(0.18, 0.36, 0.74);
                            vec3 shallow = vec3(0.34, 0.60, 0.94);
                            vec3 color = mix(deep, shallow, wave);
                            float alpha = 0.84 + (wave * 0.12);
                            gl_FragColor = vec4(color, alpha);
                        }
                    `,
                    transparent: true,
                    depthTest: true,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            } else {
                const isTransparent = Boolean(config.transparent);
                const isCutout = isTransparent && (
                    id === 'grass_tall' ||
                    id === 'mushroom_brown' ||
                    id.startsWith('flower_') ||
                    id.startsWith('leaves')
                );
                material = new THREE.MeshLambertMaterial({
                    color: config.color ? parseInt(config.color) : 0x9c9c9c,
                    transparent: isTransparent,
                    opacity: isTransparent ? (isCutout ? 1 : 0.82) : 1,
                    alphaTest: isCutout ? 0.24 : 0,
                    depthWrite: isCutout ? true : !isTransparent
                });
            }

            // Special handling for wool texture/grain
            if (id.startsWith('wool_')) {
                material.emissive = new THREE.Color(config.color ? parseInt(config.color) : 0x000000).multiplyScalar(0.08);
            }

            if (config.emissive) {
                material.emissive = new THREE.Color(0x662100);
            }
        }

        this.configureTransparentMaterial(material);
        this.materialCache.set(id, material);
        return material;
    }
}

