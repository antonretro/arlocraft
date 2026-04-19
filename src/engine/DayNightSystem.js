import * as THREE from 'three';

const SUN_RADIUS  = 380;
const MOON_RADIUS = 380;

export class DayNightSystem {
    constructor(renderer, world, features) {
        this.renderer = renderer;
        this.world = world;
        this.features = features;
        this.timeOfDay = 0.3;
        this.dayDurationSeconds = 420;

        this._setupSunMoonPlanes();
    }

    _setupSunMoonPlanes() {
        const scene = this.renderer?.scene;
        if (!scene) return;

        const loader = new THREE.TextureLoader();
        const planeGeo = new THREE.PlaneGeometry(18, 18);

        // --- Sun ---
        const sunMat = new THREE.MeshBasicMaterial({
            color: 0xfffde8,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        loader.load(
            '/src/content/textures/sun.png',
            (tex) => {
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                sunMat.map = tex;
                sunMat.color.set(0xffffff);
                sunMat.needsUpdate = true;
            },
            undefined,
            () => { /* no sun.png — solid yellow fallback is already set */ }
        );
        this.sunPlane = new THREE.Mesh(planeGeo, sunMat);
        this.sunPlane.renderOrder = -1;
        scene.add(this.sunPlane);

        // --- Moon ---
        const moonMat = new THREE.MeshBasicMaterial({
            color: 0xddeeff,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        loader.load(
            '/src/content/textures/moon_phases.png',
            (tex) => {
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                moonMat.map = tex;
                moonMat.color.set(0xffffff);
                moonMat.needsUpdate = true;
            },
            undefined,
            () => { /* no moon_phases.png — solid tint fallback */ }
        );
        this.moonPlane = new THREE.Mesh(planeGeo.clone(), moonMat);
        this.moonPlane.renderOrder = -1;
        scene.add(this.moonPlane);
    }

    update(delta, getPlayerPosition) {
        this.timeOfDay = (this.timeOfDay + (delta / this.dayDurationSeconds)) % 1;
        // angle 0 = sunrise, PI/2 = noon, PI = sunset, 3PI/2 = midnight
        const angle = (this.timeOfDay * Math.PI * 2) - (Math.PI / 2);
        const sunHeight = Math.sin(angle);
        const sunDistance = 110;

        this.renderer.sun.position.set(
            Math.cos(angle) * sunDistance,
            sunHeight * sunDistance,
            70
        );

        const daylight = Math.max(0.08, Math.min(1, (sunHeight + 0.3)));
        this.renderer.setDaylightLevel(daylight);

        // --- Position sun & moon planes along sky arc ---
        const camera = this.renderer?.instance?.xr?.getCamera?.() ?? null;
        // We use the scene camera; grab it from renderer if available
        const cam = this.renderer?._lastCamera;
        const camPos = cam ? cam.position : new THREE.Vector3(0, 64, 0);

        if (this.sunPlane) {
            const sx = Math.cos(angle) * SUN_RADIUS;
            const sy = Math.sin(angle) * SUN_RADIUS;
            this.sunPlane.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
            this.sunPlane.lookAt(camPos);
            const isDay = sunHeight > -0.1;
            this.sunPlane.material.opacity = isDay ? Math.min(1, (sunHeight + 0.1) * 5) : 0;
            this.sunPlane.visible = this.sunPlane.material.opacity > 0.01;
        }

        if (this.moonPlane) {
            // Moon is opposite arc from sun
            const mx = Math.cos(angle + Math.PI) * MOON_RADIUS;
            const my = Math.sin(angle + Math.PI) * MOON_RADIUS;
            this.moonPlane.position.set(camPos.x + mx, camPos.y + my, camPos.z);
            this.moonPlane.lookAt(camPos);
            const isNight = sunHeight < 0.1;
            this.moonPlane.material.opacity = isNight ? Math.min(1, (-sunHeight + 0.1) * 5) : 0;
            this.moonPlane.visible = this.moonPlane.material.opacity > 0.01;
        }

        if (this.features.dynamicLighting) {
            const pos = getPlayerPosition?.();
            let depthBlend = 0;
            if (pos) {
                const surfaceY = this.world.getColumnHeight(pos.x, pos.z);
                const relativeDepth = surfaceY - pos.y;
                depthBlend = Math.max(0, Math.min(1, relativeDepth / 16));
            }
            this.renderer.updateEnvironmentLighting(daylight, pos, depthBlend);
        }
    }
}
