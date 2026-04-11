import * as THREE from 'three';
import { CLOUD_SETTINGS, computeFogDensity } from '../rendering/RenderConfig.js';

export class Renderer {
    constructor() {
        this.instance = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance'
        });
        this.instance.setSize(window.innerWidth, window.innerHeight);
        this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
        this.instance.shadowMap.enabled = false;
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
        this.scene.add(this.sun);

        this.playerLight = new THREE.PointLight(0xffd88b, 0.0, 16, 2);
        this.playerLight.position.set(0, 5, 0);
        this.scene.add(this.playerLight);

        this.setupSky();
        this.setupClouds();
        this.lastCloudUpdateMs = performance.now();
        this.areaInfluence = { virus: 0, arlo: 0 };
        this.applyScreenFilter();
    }

    setupSky() {
        // Sky Dome
        const skyGeo = new THREE.SphereGeometry(450, 32, 15);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize( vWorldPosition + offset ).y;
                    gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0 ), exponent ), 0.0 ) ), 1.0 );
                }
            `,
            side: THREE.BackSide
        });

        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyDome);

        // Starfield
        const starGeo = new THREE.BufferGeometry();
        const starPos = [];
        for (let i = 0; i < 2400; i++) {
            const x = THREE.MathUtils.randFloatSpread(800);
            const y = THREE.MathUtils.randFloat(20, 400); // Only in sky
            const z = THREE.MathUtils.randFloatSpread(800);
            starPos.push(x, y, z);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        this.starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0 });
        this.stars = new THREE.Points(starGeo, this.starsMat);
        this.scene.add(this.stars);
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

    updateSky(top, bottom, fog, starOpacity, sunIntensity) {
        if (!this.skyDome) return;
        this.skyDome.material.uniforms.topColor.value.copy(top);
        this.skyDome.material.uniforms.bottomColor.value.copy(bottom);
        this.scene.fog.color.copy(bottom);
        this.scene.background.copy(bottom);
        this.starsMat.opacity = starOpacity;
        this.sun.intensity = sunIntensity;
    }

    updateEnvironmentLighting(daylight, playerPosition) {
        const clamped = Math.max(0.05, Math.min(1, daylight));
        this.daylight = clamped;

        const topDay = new THREE.Color(0x5ea4ff);
        const topNight = new THREE.Color(0x041029);
        const bottomDay = new THREE.Color(0xbfe0ff);
        const bottomNight = new THREE.Color(0x05070f);

        const top = topNight.clone().lerp(topDay, clamped);
        const bottom = bottomNight.clone().lerp(bottomDay, clamped);
        this.updateSky(top, bottom, bottom, 1 - clamped, 0.25 + (clamped * 0.95));

        this.hemiLight.intensity = 0.16 + (clamped * 0.5);
        this.hemiLight.color.set(top);
        this.hemiLight.groundColor.set(0x2e261d);

        this.scene.fog.density = computeFogDensity(this.daylight, this.submerged);

        this.playerLight.intensity = THREE.MathUtils.lerp(0.9, 0.0, clamped);
        if (playerPosition) {
            this.playerLight.position.set(playerPosition.x, playerPosition.y + 1.8, playerPosition.z);
        }
    }

    setUnderwaterState(submerged) {
        const next = Boolean(submerged);
        if (this.submerged === next) return;
        this.submerged = next;
        this.scene.fog.density = computeFogDensity(this.daylight, this.submerged);
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

        this.instance.render(this.scene, camera);
    }
}
