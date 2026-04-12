import * as THREE from 'three';
import { CLOUD_SETTINGS, computeFogDensity, ATMOSPHERIC_COLORS } from '../rendering/RenderConfig.js';

export class Renderer {
    constructor() {
        this.instance = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.instance.setSize(window.innerWidth, window.innerHeight);
        this.instance.setPixelRatio(window.devicePixelRatio);
        this.instance.shadowMap.enabled = true;
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
        this.instance.outputColorSpace = THREE.SRGBColorSpace;
        
        document.getElementById('app').appendChild(this.instance.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        
        this.daylight = 1;
        this.submerged = false;

        // Exponential fog tuned by day/night + underwater state.
        this.scene.fog = new THREE.FogExp2(0x87ceeb, computeFogDensity(this.daylight, this.submerged));

        this.hemiLight = new THREE.HemisphereLight(0xb9e3ff, 0x3a301f, 0.45);
        this.scene.add(this.hemiLight);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sun.position.set(50, 100, 50);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.width = 2048;
        this.sun.shadow.mapSize.height = 2048;
        this.sun.shadow.camera.near = 0.5;
        this.sun.shadow.camera.far = 400;
        this.sun.shadow.camera.left = -64;
        this.sun.shadow.camera.right = 64;
        this.sun.shadow.camera.top = 64;
        this.sun.shadow.camera.bottom = -64;
        this.sun.shadow.bias = -0.002;
        this.scene.add(this.sun);

        this.playerLight = new THREE.PointLight(0xffd88b, 0.0, 16, 2);
        this.playerLight.position.set(0, 5, 0);
        this.scene.add(this.playerLight);

        this.setupSky();
        this.setupSun();
        this.setupMoon();
        this.setupClouds();
        this.setupFireflies();
        this.lastCloudUpdateMs = performance.now();
        this.areaInfluence = { virus: 0, arlo: 0 };
        this.applyScreenFilter();

        // Texture Loading for AI Skybox
        const loader = new THREE.TextureLoader();
        this.textures = {
            skyNoon: loader.load('textures/sky/sky_noon.png'),
            skyNight: loader.load('textures/sky/sky_night.png'),
            sun: loader.load('textures/sky/sun.png'),
            moon: loader.load('textures/sky/moon.png')
        };
        // Configure textures
        this.textures.skyNoon.mapping = THREE.EquirectangularReflectionMapping;
        this.textures.skyNight.mapping = THREE.EquirectangularReflectionMapping;
        this.textures.skyNoon.colorSpace = THREE.SRGBColorSpace;
        this.textures.skyNight.colorSpace = THREE.SRGBColorSpace;
    }

    setupSky() {
        // Advanced Sky Dome with Texture Support
        const skyGeo = new THREE.SphereGeometry(450, 64, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                texNoon: { value: null },
                texNight: { value: null },
                mixFactor: { value: 0.0 },
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                horizonColor: { value: new THREE.Color(0xffffff) },
                sunPos: { value: new THREE.Vector3(0, 1, 0) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vLocalPos;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    // Use LOCAL position (camera-relative) so sky direction is
                    // independent of where the player is in the world.
                    vLocalPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform sampler2D texNoon;
                uniform sampler2D texNight;
                uniform float mixFactor;
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform vec3 horizonColor;
                uniform vec3 sunPos;
                uniform float exponent;
                varying vec3 vLocalPos;
                varying vec2 vUv;

                void main() {
                    // sphereDir is a pure view direction — unaffected by player position
                    vec3 sphereDir = normalize(vLocalPos);
                    float h = sphereDir.y;

                    // Equirectangular mapping logic
                    vec2 skyUv = vUv;
                    vec4 noon = texture2D(texNoon, skyUv);
                    vec4 night = texture2D(texNight, skyUv);

                    // Atmospheric gradient — richer zenith, warm horizon
                    float gradT = max(pow(max(h, 0.0), exponent), 0.0);
                    vec3 grad = mix(bottomColor, topColor, gradT);

                    // Subtle Rayleigh brightening near horizon
                    float horizonGlow = pow(max(1.0 - abs(h), 0.0), 4.0);
                    grad += bottomColor * horizonGlow * 0.25;

                    // AI Texture blend
                    vec3 texColor = mix(noon.rgb, night.rgb, mixFactor);

                    // 35% texture, 65% procedural so dawn/dusk colours show clearly
                    vec3 color = mix(grad, texColor, 0.35);

                    // Horizon tint blend
                    float horizon = 1.0 - abs(h);
                    horizon = pow(max(horizon, 0.0), 10.0);
                    color = mix(color, horizonColor, horizon * 0.55);

                    // ── Sun in skybox shader ──────────────────────────────
                    vec3 sunDir = normalize(sunPos);
                    float sunHeight = sunDir.y;

                    float sunDot = dot(sphereDir, sunDir);

                    // Combined visibility: sun above world horizon AND sky pixel above ground plane.
                    // This prevents any sun rendering from bleeding through terrain.
                    float sunAbove  = smoothstep(-0.08, 0.04, sunHeight); // sun elevation
                    float skyAbove  = smoothstep(-0.04, 0.03, h);         // sky pixel elevation
                    float sunVisible = sunAbove * skyAbove;

                    // Wide atmospheric glow
                    float sunAtmos = pow(max(0.0, sunDot), 6.0);
                    color += horizonColor * sunAtmos * 0.18 * sunVisible;

                    // Tight corona ring
                    float sunCorona = smoothstep(0.9920, 0.9975, sunDot) * (1.0 - smoothstep(0.9975, 1.0, sunDot));
                    color += mix(horizonColor, vec3(1.0, 0.92, 0.70), 0.5) * sunCorona * 0.9 * sunVisible;

                    // Hard sun disc
                    float sunDisc = smoothstep(0.9975, 0.9990, sunDot);
                    color = mix(color, vec3(1.0, 0.97, 0.88), sunDisc * sunVisible);

                    // Fade the entire bottom hemisphere to the fog/horizon colour so the
                    // sky sphere never clips through terrain or shows below the ground.
                    color = mix(bottomColor, color, smoothstep(-0.12, 0.0, h));

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false,   // never pollute the depth buffer
            depthTest: false     // always render as background behind everything
        });

        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.skyDome.renderOrder = -1;  // render before all terrain/entities
        this.scene.add(this.skyDome);

        // Starfield
        const starGeo = new THREE.BufferGeometry();
        const starPos = [];
        for (let i = 0; i < 2400; i++) {
            const x = THREE.MathUtils.randFloatSpread(800);
            const y = THREE.MathUtils.randFloat(20, 400);
            const z = THREE.MathUtils.randFloatSpread(800);
            starPos.push(x, y, z);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        this.starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0 });
        this.stars = new THREE.Points(starGeo, this.starsMat);
        this.scene.add(this.stars);
    }

    setupSun() {
        const geo = new THREE.CircleGeometry(32, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.98,
            side: THREE.BackSide,
            depthWrite: false
        });
        // Sun is rendered purely in the sky shader; keep the mesh object
        // so updateEnvironmentLighting references don't break, but don't
        // add it to the scene.
        this.sunMesh = new THREE.Mesh(geo, mat);
        this.sunMesh.renderOrder = 5;

        const glowGeo = new THREE.CircleGeometry(64, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xffaa44,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.sunGlow = new THREE.Mesh(glowGeo, glowMat);
        this.sunGlow.renderOrder = 4;
    }

    setupMoon() {
        const geo = new THREE.CircleGeometry(24, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.moonMesh = new THREE.Mesh(geo, mat);
        this.moonMesh.renderOrder = 5;
        this.scene.add(this.moonMesh);

        // Moon Glow
        const glowGeo = new THREE.CircleGeometry(48, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.moonGlow = new THREE.Mesh(glowGeo, glowMat);
        this.moonGlow.renderOrder = 4;
        this.scene.add(this.moonGlow);
    }

    setupClouds() {
        this.cloudGroup = new THREE.Group();
        this.scene.add(this.cloudGroup);

        for (let i = 0; i < CLOUD_SETTINGS.count; i++) {
            const width = THREE.MathUtils.randFloat(CLOUD_SETTINGS.widthMin, CLOUD_SETTINGS.widthMax);
            const depth = THREE.MathUtils.randFloat(CLOUD_SETTINGS.depthMin, CLOUD_SETTINGS.depthMax);
            const cloud = new THREE.Mesh(
                new THREE.PlaneGeometry(width, depth),
                new THREE.MeshLambertMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.9,
                    depthWrite: false,
                    side: THREE.DoubleSide
                })
            );
            cloud.rotation.x = -Math.PI / 2;
            cloud.position.set(
                THREE.MathUtils.randFloatSpread(CLOUD_SETTINGS.spread),
                THREE.MathUtils.randFloat(CLOUD_SETTINGS.yMin, CLOUD_SETTINGS.yMax),
                THREE.MathUtils.randFloatSpread(CLOUD_SETTINGS.spread)
            );
            cloud.userData.speed = THREE.MathUtils.randFloat(CLOUD_SETTINGS.speedMin, CLOUD_SETTINGS.speedMax);
            this.cloudGroup.add(cloud);
        }
    }

    setupFireflies() {
        const count = 72;
        const radius = 38;
        const minY = 1.5;
        const maxY = 9.0;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const phases = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const base = i * 3;
            positions[base] = THREE.MathUtils.randFloatSpread(radius * 2);
            positions[base + 1] = THREE.MathUtils.randFloat(minY, maxY);
            positions[base + 2] = THREE.MathUtils.randFloatSpread(radius * 2);
            velocities[base] = THREE.MathUtils.randFloat(-0.7, 0.7);
            velocities[base + 1] = THREE.MathUtils.randFloat(-0.08, 0.08);
            velocities[base + 2] = THREE.MathUtils.randFloat(-0.7, 0.7);
            phases[i] = Math.random() * Math.PI * 2;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xffec9b,
            size: 0.22,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.fireflies = new THREE.Points(geo, mat);
        this.fireflies.frustumCulled = false;
        this.scene.add(this.fireflies);
        this.fireflyState = {
            radius,
            minY,
            maxY,
            velocities,
            phases
        };
    }

    updateClouds(camera, delta) {
        if (!this.cloudGroup) return;
        const wrap = 700;
        const span = wrap * 2;
        for (const cloud of this.cloudGroup.children) {
            cloud.position.x += (cloud.userData.speed ?? 0.75) * delta * 6;
            if ((cloud.position.x - camera.position.x) > wrap) cloud.position.x -= span;
            if ((cloud.position.x - camera.position.x) < -wrap) cloud.position.x += span;
            if ((cloud.position.z - camera.position.z) > wrap) cloud.position.z -= span;
            if ((cloud.position.z - camera.position.z) < -wrap) cloud.position.z += span;
        }
    }

    updateFireflies(camera, delta) {
        if (!this.fireflies || !this.fireflyState) return;

        const positions = this.fireflies.geometry.attributes.position.array;
        const velocities = this.fireflyState.velocities;
        const phases = this.fireflyState.phases;
        const radius = this.fireflyState.radius;
        const minY = this.fireflyState.minY;
        const maxY = this.fireflyState.maxY;
        const now = performance.now() * 0.001;
        const range = radius * 1.25;

        for (let i = 0; i < phases.length; i++) {
            const base = i * 3;
            positions[base] += velocities[base] * delta;
            positions[base + 2] += velocities[base + 2] * delta;
            positions[base + 1] += (Math.sin(now + phases[i]) * 0.12 * delta) + (velocities[base + 1] * delta);

            const worldX = positions[base];
            const worldY = positions[base + 1];
            const worldZ = positions[base + 2];

            if (Math.abs(worldX - camera.position.x) > range) {
                positions[base] = camera.position.x + THREE.MathUtils.randFloatSpread(radius * 2);
            }
            if (Math.abs(worldZ - camera.position.z) > range) {
                positions[base + 2] = camera.position.z + THREE.MathUtils.randFloatSpread(radius * 2);
            }
            if (worldY < minY || worldY > maxY) {
                positions[base + 1] = THREE.MathUtils.randFloat(minY, maxY);
            }
        }

        this.fireflies.geometry.attributes.position.needsUpdate = true;
        const nightFactor = Math.max(0, (0.56 - this.daylight) / 0.56);
        this.fireflies.material.opacity = this.submerged ? 0 : (0.04 + (nightFactor * 0.72));
    }

    updateSky(top, bottom, horizon, sunPos, starOpacity, sunIntensity, mixFactor = 0) {
        if (!this.skyDome) return;
        const uniforms = this.skyDome.material.uniforms;
        uniforms.topColor.value.copy(top);
        uniforms.bottomColor.value.copy(bottom);
        uniforms.horizonColor.value.copy(horizon);
        // Pass sun as a normalised direction so the shader result is the
        // same regardless of how far the player is from the world origin.
        uniforms.sunPos.value.copy(sunPos).normalize();
        uniforms.mixFactor.value = mixFactor;
        
        // Assign textures if loaded
        if (this.textures) {
            if (!uniforms.texNoon.value) uniforms.texNoon.value = this.textures.skyNoon;
            if (!uniforms.texNight.value) uniforms.texNight.value = this.textures.skyNight;
        }

        this.scene.fog.color.copy(bottom);
        this.scene.background.copy(bottom);
        this.starsMat.opacity = starOpacity;
        this.sun.intensity = sunIntensity;
    }

    setDaylightLevel(daylight) {
        this.daylight = Math.max(0.05, Math.min(1, Number(daylight) || 1));
    }

    updateEnvironmentLighting(daylight, playerPosition) {
        const clamped = Math.max(0.05, Math.min(1, daylight));
        this.setDaylightLevel(clamped);

        const sunPos = this.sun.position;
        const sunNormal = sunPos.clone().normalize();
        const sunHeight = sunNormal.y;

        // Determine phase based on sun height
        let top, bottom, horizon, sunIntensity;
        const dawnPower = Math.max(0, 1.0 - Math.abs(sunHeight - 0.2) * 5.0);
        const duskPower = Math.max(0, 1.0 - Math.abs(sunHeight - 0.15) * 5.0);
        
        const dayColor = ATMOSPHERIC_COLORS.DAY;
        const nightColor = ATMOSPHERIC_COLORS.NIGHT;
        const dawnColor = ATMOSPHERIC_COLORS.DAWN;
        const duskColor = ATMOSPHERIC_COLORS.DUSK;

        const dayColTop = new THREE.Color(dayColor.top);
        const nightColTop = new THREE.Color(nightColor.top);
        const dawnColTop = new THREE.Color(dawnColor.top);
        const duskColTop = new THREE.Color(duskColor.top);

        const dayColBot = new THREE.Color(dayColor.bottom);
        const nightColBot = new THREE.Color(nightColor.bottom);
        const dawnColBot = new THREE.Color(dawnColor.bottom);
        const duskColBot = new THREE.Color(duskColor.bottom);

        // Transition Logic
        if (sunHeight > 0.4) {
            top = dayColTop;
            bottom = dayColBot;
            horizon = dayColBot;
            sunIntensity = 1.0;
        } else if (sunHeight > 0) {
            // Dawn/Dusk blend
            const t = sunHeight / 0.4;
            const sunrise = sunPos.x > 0;
            const transTop = sunrise ? dawnColTop : duskColTop;
            const transBot = sunrise ? dawnColBot : duskColBot;
            
            top = transTop.clone().lerp(dayColTop, t);
            bottom = transBot.clone().lerp(dayColBot, t);
            horizon = transBot.clone().lerp(dayColBot, t);
            sunIntensity = 0.3 + t * 0.7;
        } else {
            // Night
            top = nightColTop;
            bottom = nightColBot;
            horizon = nightColBot;
            sunIntensity = 0.15;
        }

        const mixFactor = Math.max(0, Math.min(1, (0.4 - sunHeight) / 0.8));
        this.updateSky(top, bottom, horizon, sunPos, 1.0 - clamped, sunIntensity, mixFactor);

        this.hemiLight.intensity = 0.12 + (clamped * 0.55);
        this.hemiLight.color.set(top);
        this.hemiLight.groundColor.set(0x2e261d);

        this.scene.fog.density = computeFogDensity(this.daylight, this.submerged) * (this.fogDensityScale || 1.0);

        this.playerLight.intensity = THREE.MathUtils.lerp(0.8, 0.0, clamped);
        if (playerPosition) {
            this.playerLight.position.set(playerPosition.x, playerPosition.y + 1.8, playerPosition.z);
        }

        // Update visual Sun/Moon positions and textures
        if (this.sunMesh && this.textures?.sun) {
            if (!this.sunMesh.material.map) this.sunMesh.material.map = this.textures.sun;
            this.sunMesh.position.copy(sunNormal).multiplyScalar(400);
            this.sunMesh.lookAt(new THREE.Vector3(0,0,0));
            this.sunMesh.visible = sunHeight > -0.2;
            if (this.sunGlow) {
                this.sunGlow.position.copy(this.sunMesh.position);
                this.sunGlow.lookAt(new THREE.Vector3(0,0,0));
                this.sunGlow.visible = this.sunMesh.visible;
            }
        }
        if (this.moonMesh && this.textures?.moon) {
            if (!this.moonMesh.material.map) this.moonMesh.material.map = this.textures.moon;
            if (this.moonGlow && !this.moonGlow.material.map) this.moonGlow.material.map = this.textures.moon;

            const moonNormal = sunNormal.clone().multiplyScalar(-1);
            this.moonMesh.position.copy(moonNormal).multiplyScalar(400);
            this.moonMesh.lookAt(new THREE.Vector3(0,0,0));
            this.moonMesh.visible = sunHeight < 0.2;

            if (this.moonGlow) {
                this.moonGlow.position.copy(this.moonMesh.position);
                this.moonGlow.lookAt(new THREE.Vector3(0,0,0));
                this.moonGlow.visible = this.moonMesh.visible;
            }
        }
    }

    toggleShadows(enabled) {
        this.instance.shadowMap.enabled = Boolean(enabled);
        this.sun.castShadow = Boolean(enabled);
        // Traversal to update materials if needed (already handled by Three.js usually)
    }

    setFogDensityScale(scale) {
        this.fogDensityScale = Math.max(0, Math.min(2, Number(scale) || 1.0));
    }

    setUnderwaterState(submerged) {
        const next = Boolean(submerged);
        if (this.submerged === next) return;
        this.submerged = next;
        this.scene.fog.density = computeFogDensity(this.daylight, this.submerged) * (this.fogDensityScale || 1.0);
        this.applyScreenFilter();
    }

    setAreaInfluence(influence) {
        const v = Math.max(0, Math.min(1, influence?.virus ?? 0));
        const a = Math.max(0, Math.min(1, influence?.arlo ?? 0));
        // Skip redundant filter recalculation when values haven't shifted meaningfully
        if (Math.abs(v - this.areaInfluence.virus) < 0.005 &&
            Math.abs(a - this.areaInfluence.arlo) < 0.005) return;
        this.areaInfluence.virus = v;
        this.areaInfluence.arlo = a;
        this.applyScreenFilter();
    }

    applyScreenFilter() {
        const v = this.areaInfluence.virus;
        const a = this.areaInfluence.arlo;

        // Corruption influence is intentionally subtle: slight dim + purple shift.
        let brightness = 1 - v * 0.05 + a * 0.03;
        let saturation = 1 - v * 0.18 + a * 0.10;
        let contrast = 1 + v * 0.04;
        let hueRotate = v * 22;

        if (this.submerged) {
            saturation += 0.05;
            contrast -= 0.05;
            hueRotate -= 6;
        }

        brightness = Math.max(0.94, Math.min(1.06, brightness));
        saturation = Math.max(0.78, Math.min(1.15, saturation));

        // Drive the corruption overlay element
        const overlay = document.getElementById('corruption-overlay');
        if (overlay) overlay.style.opacity = String((v * 0.12).toFixed(3));

        const filterParts = [];
        if (Math.abs(brightness - 1) > 0.002) filterParts.push(`brightness(${brightness.toFixed(3)})`);
        if (Math.abs(saturation - 1) > 0.002) filterParts.push(`saturate(${saturation.toFixed(3)})`);
        if (Math.abs(contrast - 1) > 0.002) filterParts.push(`contrast(${contrast.toFixed(3)})`);
        if (Math.abs(hueRotate) > 0.5) filterParts.push(`hue-rotate(${hueRotate.toFixed(1)}deg)`);

        this.instance.domElement.style.filter = filterParts.length > 0 ? filterParts.join(' ') : 'none';
    }

    setResolutionScale(scale) {
        const val = Math.max(0.1, Math.min(2.0, Number(scale) || 1.0));
        this.instance.setPixelRatio(window.devicePixelRatio * val);
    }
    setSize(w, h) {
        this.instance.setSize(w, h);
    }

    render(camera) {
        // Sky follows player
        if (this.skyDome) this.skyDome.position.copy(camera.position);
        if (this.stars) this.stars.position.copy(camera.position);
        const now = performance.now();
        const delta = Math.max(0, Math.min(0.05, (now - this.lastCloudUpdateMs) / 1000));
        this.lastCloudUpdateMs = now;
        this.updateClouds(camera, delta);
        this.updateFireflies(camera, delta);

        this.instance.render(this.scene, camera);
    }
}
