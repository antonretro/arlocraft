import * as THREE from 'three';

export class HorizonService {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.textures = new Map();
        this.materials = new Map();
        this.cube = null;
        this.currentBiome = 'plains';
        this.targetBiome = 'plains';
        this.blend = 0;
        
        this.init();
    }

    async init() {
        const loader = new THREE.TextureLoader();
        const base = import.meta.env.BASE_URL || '/';
        const assetPath = base.endsWith('/') ? base : base + '/';
        const texturePaths = {
            plains: `${assetPath}textures/horizon/plains.png`,
            mountains: `${assetPath}textures/horizon/mountains.png`,
            forest: `${assetPath}textures/horizon/forest.png`
        };

        for (const [key, path] of Object.entries(texturePaths)) {
            const tex = loader.load(path);
            tex.wrapS = THREE.RepeatWrapping;
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            this.textures.set(key, tex);
        }

        // Create a large, high-radius cylinder to act as our horizon line
        const geo = new THREE.CylinderGeometry(480, 480, 320, 32, 1, true);
        
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                tPlains: { value: this.textures.get('plains') },
                tMountains: { value: this.textures.get('mountains') },
                tForest: { value: this.textures.get('forest') },
                uBlendMnt: { value: 0 },
                uBlendFor: { value: 0 },
                uTime: { value: 0 },
                uDaylight: { value: 1.0 },
                uOpacity: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tPlains;
                uniform sampler2D tMountains;
                uniform sampler2D tForest;
                uniform float uBlendMnt;
                uniform float uBlendFor;
                uniform float uDaylight;
                uniform float uOpacity;
                varying vec2 vUv;

                void main() {
                    vec4 cPlains = texture2D(tPlains, vUv);
                    vec4 cMountains = texture2D(tMountains, vUv);
                    vec4 cForest = texture2D(tForest, vUv);
                    
                    // Layered blending
                    vec4 color = mix(cPlains, cMountains, uBlendMnt);
                    color = mix(color, cForest, uBlendFor);
                    
                    // Darken for night
                    float nightFactor = max(0.15, uDaylight);
                    color.rgb *= nightFactor;
                    
                    // Fade out at top/bottom for smoother sky blending
                    float edgeFade = smoothstep(0.0, 0.4, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
                    
                    gl_FragColor = vec4(color.rgb, color.a * uOpacity * edgeFade);
                }
            `,
            transparent: true,
            side: THREE.BackSide,
            depthWrite: false
        });

        this.cylinder = new THREE.Mesh(geo, mat);
        this.cylinder.renderOrder = -5;
        this.scene.add(this.cylinder);
    }

    update(camPos, daylight, dominantBiome) {
        if (!this.cylinder) return;

        this.cylinder.position.set(camPos.x, camPos.y - 40, camPos.z);
        this.cylinder.material.uniforms.uDaylight.value = daylight;
        
        let targetMnt = 0;
        let targetFor = 0;
        
        if (dominantBiome === 'highlands' || dominantBiome === 'desert') {
            targetMnt = 1.0;
        } else if (dominantBiome === 'forest' || dominantBiome === 'meadow') {
            targetFor = 1.0;
        }

        this.cylinder.material.uniforms.uBlendMnt.value += (targetMnt - this.cylinder.material.uniforms.uBlendMnt.value) * 0.02;
        this.cylinder.material.uniforms.uBlendFor.value += (targetFor - this.cylinder.material.uniforms.uBlendFor.value) * 0.02;
    }
}
