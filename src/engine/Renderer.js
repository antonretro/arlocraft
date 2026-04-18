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
        this.instance.shadowMap.type = THREE.PCFShadowMap;
        this.instance.outputColorSpace = THREE.SRGBColorSpace;
        this.instance.setClearColor(0x87ceeb, 1);
        
        document.getElementById('app').appendChild(this.instance.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x7ec8f0);
        this.scene.fog = new THREE.FogExp2(0x7ec8f0, 0.012);

        this.daylight = 1;
        this.submerged = false;
        this.fogDensityScale = 1.0;
        this.areaInfluence = { virus: 0, arlo: 0 };
        this.lastCloudUpdateMs = performance.now();

        this.setupLights();
        this.setupSky();
        this.setupClouds();
        
        window.addEventListener('resize', () => {
            if (this.instance) {
                this.instance.setSize(window.innerWidth, window.innerHeight);
            }
        });
    }

    setupLights() {
        this.hemiLight = new THREE.HemisphereLight(0xcce8ff, 0x4a402f, 0.95);
        this.scene.add(this.hemiLight);

        this.ambientFill = new THREE.AmbientLight(0xf4ead8, 0.38);
        this.scene.add(this.ambientFill);

        this.sun = new THREE.DirectionalLight(0xfffff5, 1.25);
        this.sun.position.set(20, 100, 20);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.width = 2048;
        this.sun.shadow.mapSize.height = 2048;
        this.sun.shadow.camera.left = -100;
        this.sun.shadow.camera.right = 100;
        this.sun.shadow.camera.top = 100;
        this.sun.shadow.camera.bottom = -100;
        this.sun.shadow.camera.near = 0.5;
        this.sun.shadow.camera.far = 500;
        this.sun.shadow.bias = -0.0005;
        this.scene.add(this.sun);
    }

    setupSky() {
        const skyGeo = new THREE.SphereGeometry(450, 64, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                top:      { value: new THREE.Color(0x0d5fd6) },
                bottom:   { value: new THREE.Color(0x7ec8f0) },
                horizon:  { value: new THREE.Color(0xffd090) },
                horizonStrength: { value: 0.0 },
                offset:   { value: 0 },
                exponent: { value: 1.8 }
            },
            vertexShader: `
                varying vec3 vLocalPos;
                void main() {
                    vLocalPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 top;
                uniform vec3 bottom;
                uniform vec3 horizon;
                uniform float horizonStrength;
                uniform float offset;
                uniform float exponent;
                varying vec3 vLocalPos;
                void main() {
                    float h = normalize(vLocalPos).y;
                    float factor = clamp(pow(h * 0.5 + 0.5, exponent), 0.0, 1.0);
                    vec3 sky = mix(bottom, top, factor);
                    // Horizon glow band: brightest right at h=0
                    float horizonBand = pow(1.0 - abs(h), 6.0) * horizonStrength;
                    sky = mix(sky, horizon, clamp(horizonBand, 0.0, 1.0));
                    gl_FragColor = vec4(sky, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthTest: false
        });
        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyDome);

        // Stars
        const starsGeo = new THREE.BufferGeometry();
        const starsPos = [];
        for (let i = 0; i < 2400; i++) {
            const x = THREE.MathUtils.randFloatSpread(900);
            const y = THREE.MathUtils.randFloat(20, 450);
            const z = THREE.MathUtils.randFloatSpread(900);
            starsPos.push(x, y, z);
        }
        starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starsPos, 3));
        const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0 });
        this.stars = new THREE.Points(starsGeo, starsMat);
        this.scene.add(this.stars);

        // Moon
        const moonGeo = new THREE.CircleGeometry(14, 32);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0 });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.scene.add(this.moonMesh);

        // Moon glow
        const moonGlowGeo = new THREE.CircleGeometry(24, 32);
        const moonGlowMat = new THREE.MeshBasicMaterial({ color: 0x6688cc, transparent: true, opacity: 0 });
        this.moonGlow = new THREE.Mesh(moonGlowGeo, moonGlowMat);
        this.scene.add(this.moonGlow);
    }

    setupClouds() {
        this.clouds = new THREE.Group();
        this.cloudMeshes = [];
        const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
        const cloudMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.85,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < CLOUD_SETTINGS.count; i++) {
            const mesh = new THREE.Mesh(cloudGeo, cloudMat);
            const w = THREE.MathUtils.randFloat(CLOUD_SETTINGS.widthMin, CLOUD_SETTINGS.widthMax);
            const h = THREE.MathUtils.randFloat(2, 5);
            const d = THREE.MathUtils.randFloat(CLOUD_SETTINGS.depthMin, CLOUD_SETTINGS.depthMax);
            mesh.scale.set(w, h, d);
            mesh.position.set(
                THREE.MathUtils.randFloatSpread(CLOUD_SETTINGS.spread),
                THREE.MathUtils.randFloat(CLOUD_SETTINGS.yMin, CLOUD_SETTINGS.yMax),
                THREE.MathUtils.randFloatSpread(CLOUD_SETTINGS.spread)
            );
            mesh.userData.speed = THREE.MathUtils.randFloat(CLOUD_SETTINGS.speedMin, CLOUD_SETTINGS.speedMax);
            this.clouds.add(mesh);
            this.cloudMeshes.push(mesh);
        }
        this.scene.add(this.clouds);
    }

    updateEnvironmentLighting(daylight, playerPos = null, forcedDepthBlend = null) {
        this.daylight = daylight;
        const clamped = Math.max(0, Math.min(1, daylight));
        
        // Atmosphere logic
        let state = 'DAY';
        if (daylight < 0.28) state = 'NIGHT';
        else if (daylight < 0.45) state = 'DAWN';
        else if (daylight > 0.85) state = 'DAY';
        
        const colors = ATMOSPHERIC_COLORS[state];
        const top = new THREE.Color(colors.top);
        const bottom = new THREE.Color(colors.bottom);
        const sunCol = new THREE.Color(colors.sun);

        // Apply depth-based darkening
        let depthBlend = forcedDepthBlend !== null ? forcedDepthBlend : 0;
        if (forcedDepthBlend === null && playerPos) {
            const surfaceY = 64; 
            const depth = surfaceY - playerPos.y;
            depthBlend = Math.max(0, Math.min(0.55, depth / 180));
        }

        if (depthBlend > 0) {
            const caveTint = new THREE.Color(0x1f2c38);
            bottom.lerp(caveTint, depthBlend);
            top.lerp(caveTint, depthBlend);
        }

        if (this.skyDome) {
            this.skyDome.material.uniforms.top.value.copy(top);
            this.skyDome.material.uniforms.bottom.value.copy(bottom);
            // Horizon glow: strong at dawn/dusk, none at day/night
            const horizonGlowColor = state === 'DUSK' ? new THREE.Color(0xff4400)
                                   : state === 'DAWN' ? new THREE.Color(0xff8833)
                                   : new THREE.Color(0xffd0a0);
            const horizonStr = state === 'DAWN' || state === 'DUSK' ? 0.85 : (state === 'DAY' ? 0.12 : 0.0);
            this.skyDome.material.uniforms.horizon.value.copy(horizonGlowColor);
            this.skyDome.material.uniforms.horizonStrength.value = horizonStr;
        }
        this.scene.background.copy(bottom);
        
        const fogCol = bottom.clone().lerp(new THREE.Color(0xffffff), 0.05);
        this.scene.fog.color.copy(fogCol);
        this.scene.fog.density = computeFogDensity(daylight, this.submerged) * (this.fogDensityScale || 1.0);

        this.sun.intensity = 0.45 + (clamped * 1.05);
        this.sun.color.copy(sunCol);
        this.hemiLight.intensity = 0.95 + (clamped * 0.5);
        this.hemiLight.color.set(top);
        this.hemiLight.groundColor.set(0x6d6253);
        if (this.ambientFill) {
            this.ambientFill.intensity = 0.34 + (clamped * 0.16);
            this.ambientFill.color.copy(sunCol).lerp(new THREE.Color(0xffffff), 0.35);
        }

        // Stars & Moon
        if (this.stars) {
            this.stars.material.opacity = Math.max(0, (0.35 - daylight) * 2.5);
            this.stars.visible = this.stars.material.opacity > 0.01;
        }
        if (this.moonMesh && this.moonGlow) {
            const moonOp = Math.max(0, (0.32 - daylight) * 1.8);
            this.moonMesh.material.opacity = moonOp;
            this.moonGlow.material.opacity = moonOp * 0.4;
            this.moonMesh.visible = moonOp > 0.01;
            this.moonGlow.visible = this.moonMesh.visible;
        }
    }

    setDaylightLevel(daylight) {
        this.daylight = Math.max(0, Math.min(1, daylight));
        this.hemiLight.intensity = 0.85 + this.daylight * 0.55;
        this.sun.intensity = 0.4 + this.daylight * 1.05;
        if (this.ambientFill) {
            this.ambientFill.intensity = 0.32 + this.daylight * 0.18;
        }
        
        // Sky colors mix - use THREE.Color to wrap the hex constants from RenderConfig
        const dayTop = new THREE.Color(ATMOSPHERIC_COLORS.DAY.top);
        const dayBottom = new THREE.Color(ATMOSPHERIC_COLORS.DAY.bottom);
        const nightTop = new THREE.Color(ATMOSPHERIC_COLORS.NIGHT.top);
        const nightBottom = new THREE.Color(ATMOSPHERIC_COLORS.NIGHT.bottom);

        const skyTop = dayTop.clone().lerp(nightTop, 1 - this.daylight);
        const skyBottom = dayBottom.clone().lerp(nightBottom, 1 - this.daylight);

        if (this.skyDome) {
            this.skyDome.material.uniforms.top.value.copy(skyTop);
            this.skyDome.material.uniforms.bottom.value.copy(skyBottom);
        }

        this.scene.fog.color.copy(skyBottom);
        this.scene.fog.density = computeFogDensity(this.daylight, this.submerged) * (this.fogDensityScale || 1.0);

        if (this.stars) {
            this.stars.material.opacity = Math.max(0, (0.45 - this.daylight) * 1.5);
            this.stars.visible = this.stars.material.opacity > 0.05;
        }

        if (this.moonMesh && this.moonGlow) {
            const moonOp = Math.max(0, (0.32 - this.daylight) * 1.8);
            this.moonMesh.material.opacity = moonOp;
            this.moonGlow.material.opacity = moonOp * 0.4;
            this.moonMesh.visible = moonOp > 0.01;
            this.moonGlow.visible = this.moonMesh.visible;
        }
    }

    toggleShadows(enabled) {
        this.instance.shadowMap.enabled = Boolean(enabled);
        this.sun.castShadow = Boolean(enabled);
    }

    setFogDensityScale(scale) {
        this.fogDensityScale = Math.max(0, Math.min(2, Number(scale) || 1.0));
    }

    setUnderwaterState(submerged) {
        this.submerged = Boolean(submerged);
        if (submerged) {
            // Deep teal-blue underwater fog
            this.scene.fog.color.setHex(0x0a3d5a);
            this.scene.background.setHex(0x061e2e);
            if (this.skyDome) this.skyDome.visible = false;
        } else {
            if (this.skyDome) this.skyDome.visible = true;
        }
        this.scene.fog.density = computeFogDensity(this.daylight, this.submerged) * (this.fogDensityScale || 1.0);
    }

    render(camera) {
        if (this.skyDome) this.skyDome.position.copy(camera.position);
        if (this.stars) this.stars.position.copy(camera.position);
        
        // Moon Billboarding: face the camera
        if (this.moonMesh && this.moonGlow) {
            // Position moon in the sky distance
            const moonDir = new THREE.Vector3(0, 0.45, -1).normalize();
            const moonDist = 400;
            this.moonMesh.position.copy(camera.position).addScaledVector(moonDir, moonDist);
            this.moonGlow.position.copy(this.moonMesh.position);
            
            this.moonMesh.lookAt(camera.position);
            this.moonGlow.lookAt(camera.position);
        }
        
        const now = performance.now();
        const delta = Math.max(0, Math.min(0.05, (now - this.lastCloudUpdateMs) / 1000));
        this.lastCloudUpdateMs = now;

        for (let i = 0; i < this.cloudMeshes.length; i++) {
            const cloud = this.cloudMeshes[i];
            cloud.position.x += cloud.userData.speed * delta;
            if (cloud.position.x > CLOUD_SETTINGS.spread / 2) cloud.position.x = -CLOUD_SETTINGS.spread / 2;
        }

        this.instance.render(this.scene, camera);
    }

    setResolutionScale(scale) {
        const val = Math.max(0.1, Math.min(2.0, Number(scale) || 1.0));
        this.instance.setPixelRatio(window.devicePixelRatio * val);
    }
    setSize(w, h) {
        this.instance.setSize(w, h);
    }

    setAreaInfluence(influence) {
        this.areaInfluence = influence || { virus: 0, arlo: 0 };
        // Could apply color grading or post-processing here based on virus level
        if (this.areaInfluence.virus > 0.5) {
            // Apply subtle glitch/red tint to sky or fog
        }
    }
}
