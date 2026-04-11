import * as THREE from 'three';
import { BLOCKS } from '../data/blocks.js';
import grassTopTexture from '../assets/grass_top_texture.png';
import grassSideTexture from '../assets/grass_side_texture.png';
import stoneTexture from '../assets/stone_texture.png';
import dirtTexture from '../assets/dirt.png';
import woodTexture from '../assets/wood.png';
import leavesTexture from '../assets/leaves.png';
import sandTexture from '../assets/sand.png';
import ironOreTexture from '../assets/iron_ore.png';
import { BLOCK_TEXTURE_ATLAS, getAtlasFacesForBlock } from '../rendering/BlockTextureMap.js';


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
        BLOCKS.forEach((config) => {
            this.blocks.set(config.id, config);
        });
        this.loadStunningExpansion();
    }

    async loadStunningExpansion() {
        const paths = {
            arlo: '/arlo_real.png'
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
        // so no duplicate network requests) — this guarantees each tile gets its own
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
        if (id === 'water') return null;
        const faces = getAtlasFacesForBlock(id);
        if (!faces) return null;

        const hasAnyFace = Boolean(
            faces.all || faces.side || faces.top || faces.bottom || faces.front || faces.back || faces.left || faces.right
        );
        if (!hasAnyFace) return null;

        const all = this.createMappedFaceMaterial(config, faces.all);
        if (all && !faces.side && !faces.top && !faces.bottom) return all;

        const side = this.createMappedFaceMaterial(config, faces.side ?? faces.all);
        const top = this.createMappedFaceMaterial(config, faces.top ?? faces.side ?? faces.all);
        const bottom = this.createMappedFaceMaterial(config, faces.bottom ?? faces.side ?? faces.all);
        const front = this.createMappedFaceMaterial(config, faces.front ?? faces.side ?? faces.all);
        const back = this.createMappedFaceMaterial(config, faces.back ?? faces.side ?? faces.all);
        const right = this.createMappedFaceMaterial(config, faces.right ?? faces.side ?? faces.all);
        const left = this.createMappedFaceMaterial(config, faces.left ?? faces.side ?? faces.all);

        return [
            right ?? side ?? all,
            left ?? side ?? all,
            top ?? all,
            bottom ?? all,
            front ?? side ?? all,
            back ?? side ?? all
        ];
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

        let material = null;
        if (id === 'grass') {
            const side = this.loadTexture(grassSideTexture);
            const top = this.loadTexture(grassTopTexture);
            const bottom = this.loadTexture(dirtTexture);
            material = [
                new THREE.MeshLambertMaterial({ map: side }),
                new THREE.MeshLambertMaterial({ map: side }),
                new THREE.MeshLambertMaterial({ map: top }),
                new THREE.MeshLambertMaterial({ map: bottom }),
                new THREE.MeshLambertMaterial({ map: side }),
                new THREE.MeshLambertMaterial({ map: side })
            ];
        } else if (id === 'dirt') {
            material = new THREE.MeshLambertMaterial({ map: this.loadTexture(dirtTexture) });
        } else if (id === 'stone') {
            material = new THREE.MeshLambertMaterial({ map: this.loadTexture(stoneTexture) });
        } else if (id === 'cobblestone') {
            material = new THREE.MeshLambertMaterial({ map: this.loadTexture(stoneTexture) });
        } else if (id === 'sand') {
            material = new THREE.MeshLambertMaterial({ map: this.loadTexture(sandTexture) });
        } else if (id === 'sandstone') {
            material = new THREE.MeshLambertMaterial({ map: this.loadTexture(sandTexture) });
        } else if (id === 'wood' || id.startsWith('wood_')) {
            material = new THREE.MeshLambertMaterial({ map: this.loadTexture(woodTexture) });
        } else if (id === 'leaves' || id.startsWith('leaves_')) {
            material = new THREE.MeshLambertMaterial({
                map: this.loadTexture(leavesTexture)
            });
        } else if (id === 'iron') {
            material = new THREE.MeshLambertMaterial({ map: this.loadTexture(ironOreTexture) });
        }

        if (!material) {
            material = this.createAtlasMaterial(id, config);
        }

        if (!material) {
            const palette = {
                dirt: 0x7a5f3a,
                wood: 0x8f673c,
                leaves: 0x3f8f3f,
                sand: 0xd6c891,
                lava: 0xff6b1a,
                iron: 0xb0afb5,
                gold: 0xf2d438,
                diamond: 0x55ffd9,
                coal: 0x3b3f47,
                copper: 0xc1773b,
                tin: 0xa9b2bb,
                silver: 0xd5dbe2,
                ruby: 0xd7265d,
                sapphire: 0x2e78ff,
                amethyst: 0x8d5fe8,
                uranium: 0x78ff4f,
                platinum: 0xc6d8eb,
                mythril: 0x43f3ff,
                tnt: 0xff3b30,
                nuke: 0x1c1c1c,
                glass: 0xa9d6ff,
                clay: 0xb49582,
                brick: 0xb24936,
                cobblestone: 0x7d8087,
                path_block: 0x9c7a4f,
                lantern: 0xffdc78,
                wood_planks: 0xb78354,
                crafting_table: 0xa67c52,
                starter_chest: 0xb37a3a,
                wool_white: 0xeeeeee,
                wool_orange: 0xf9801d,
                wool_magenta: 0xc74ebb,
                wool_light_blue: 0x3ab3da,
                wool_yellow: 0xfed83d,
                wool_lime: 0x80c71f,
                wool_pink: 0xf38baa,
                wool_gray: 0x474f52,
                wool_light_gray: 0x9d9d97,
                wool_cyan: 0x169c9c,
                wool_purple: 0x8932b8,
                wool_blue: 0x3c44aa,
                wool_brown: 0x835432,
                wool_green: 0x5e7c16,
                wool_red: 0xb02e26,
                wool_black: 0x1d1d21,
                obsidian: 0x2e2540,
                bedrock: 0x222222,

                // Expansion Blocks
                wood_birch: 0xd8d4cb,
                wood_pine: 0x473824,
                wood_palm: 0x987146,
                wood_willow: 0x5a5840,
                wood_cherry: 0x6e453d,
                wood_redwood: 0x51291b,
                wood_crystal: 0x211042,

                leaves_birch: 0x568041,
                leaves_pine: 0x2d4834,
                leaves_palm: 0x548622,
                leaves_willow: 0x51643c,
                leaves_cherry: 0xffadc0,
                leaves_redwood: 0x2d4f21,
                leaves_crystal: 0xbc7fff,

                sandstone: 0xdbd3a0,
                snow_block: 0xfafafa,
                ice: 0xd1e9ff,
                cloud_block: 0xffffff,

                // Culinary Expansion Colors
                apple: 0xf44336,
                tomato: 0xff5252,
                carrot: 0xff9800,
                potato: 0xcd853f,
                corn: 0xffeb3b,
                blueberry: 0x3f51b5,
                strawberry: 0xe91e63,
                melon_slice: 0xff8a65,
                pumpkin_pie: 0xbf360c,
                bread: 0x8d6e63,
                steak: 0x5d4037,
                cooked_fish: 0x81d4fa,
                mushroom_brown: 0x795548,
                honey_bottle: 0xffb300,
                cookie: 0x6d4c41
            };

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
                    depthWrite: false
                });
            } else {
                material = new THREE.MeshLambertMaterial({
                    color: palette[id] ?? 0x9c9c9c,
                    transparent: Boolean(config.transparent),
                    opacity: config.transparent ? 0.65 : 1,
                    depthWrite: !config.transparent
                });
            }

            // Special handling for wool texture/grain
            if (id.startsWith('wool_')) {
                material.emissive = new THREE.Color(palette[id]).multiplyScalar(0.08);
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
